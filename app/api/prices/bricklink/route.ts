import { blGetPartPriceGuide } from '@/app/lib/bricklink';
import { mapToBrickLink } from '@/app/lib/mappings/rebrickableToBricklink';
import {
    DEFAULT_PRICING_PREFERENCES,
    formatPricingScopeLabel,
} from '@/app/lib/pricing';
import { getSupabaseAuthServerClient } from '@/app/lib/supabaseAuthServerClient';
import { loadUserPricingPreferences } from '@/app/lib/userPricingPreferences';
import { incrementCounter, logEvent } from '@/lib/metrics';
import { consumeRateLimit, getClientIp } from '@/lib/rateLimit';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

type PriceRequestItem = {
  key: string;
  partId: string;
  colorId: number;
};

type PricingSource = 'real_time' | 'historical' | 'unavailable';

type PriceResponseEntry = {
  unitPrice: number | null;
  minPrice: number | null;
  maxPrice: number | null;
  currency: string | null;
  bricklinkColorId: number | null;
  itemType: 'PART' | 'MINIFIG';
   /**
    * Human-readable reminder of the pricing context, e.g. "USD/Global" or
    * "EUR/Germany".
    */
  scopeLabel: string | null;
  pricingSource: PricingSource;
  pricing_source: PricingSource;
  lastUpdatedAt: string | null;
  nextRefreshAt: string | null;
};

const MAX_ITEMS = 100;
const BATCH_SIZE = 10;
const RATE_WINDOW_MS =
  Number.parseInt(process.env.BL_RATE_WINDOW_MS ?? '', 10) || 60_000;
const RATE_LIMIT_PER_MINUTE =
  Number.parseInt(process.env.BL_RATE_LIMIT_PER_MINUTE ?? '', 10) || 60;
const RATE_LIMIT_PER_MINUTE_USER =
  Number.parseInt(process.env.BL_RATE_LIMIT_PER_MINUTE_USER ?? '', 10) || 60;

const schema = z.object({
  items: z
    .array(
      z.object({
        key: z.string().min(1).max(200),
        partId: z.string().min(1).max(200),
        colorId: z.number().int(),
      })
    )
    .min(1)
    .max(MAX_ITEMS),
});

export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    const issues = parsed.error.flatten();
    incrementCounter('prices_bricklink_validation_failed', { issues });
    return NextResponse.json(
      { error: 'validation_failed', details: issues },
      { status: 400 }
    );
  }

  const items: PriceRequestItem[] = parsed.data.items;
  const clientIp = (await getClientIp(req)) ?? 'unknown';

  if (process.env.NODE_ENV !== 'production') {
    try {
      console.log('prices/bricklink POST', {
        itemCount: items.length,
      });
    } catch {}
  }

  const prices: Record<string, PriceResponseEntry> = {};

  // Determine pricing preferences for this request (user-specific when
  // authenticated via Supabase cookies; otherwise fall back to global USD).
  let pricingPrefs = DEFAULT_PRICING_PREFERENCES;
  let userId: string | null = null;
  try {
    const supabase = await getSupabaseAuthServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (!userError && user) {
      userId = user.id;
      pricingPrefs = await loadUserPricingPreferences(supabase, user.id);
    }
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      try {
        console.warn('prices/bricklink: failed to load pricing preferences', {
          error: err instanceof Error ? err.message : String(err),
        });
      } catch {}
    }
  }

  const scopeLabel = formatPricingScopeLabel(pricingPrefs);

  const ipLimit = await consumeRateLimit(`ip:${clientIp}`, {
    windowMs: RATE_WINDOW_MS,
    maxHits: RATE_LIMIT_PER_MINUTE,
  });
  if (!ipLimit.allowed) {
    incrementCounter('prices_bricklink_rate_limited', { scope: 'ip' });
    return NextResponse.json(
      {
        error: 'rate_limited',
        scope: 'ip',
        retryAfterSeconds: ipLimit.retryAfterSeconds,
      },
      {
        status: 429,
        headers: { 'Retry-After': String(ipLimit.retryAfterSeconds) },
      }
    );
  }

  if (userId) {
    const userLimit = await consumeRateLimit(`user:${userId}`, {
      windowMs: RATE_WINDOW_MS,
      maxHits: RATE_LIMIT_PER_MINUTE_USER,
    });
    if (!userLimit.allowed) {
      incrementCounter('prices_bricklink_rate_limited', { scope: 'user' });
      return NextResponse.json(
        {
          error: 'rate_limited',
          scope: 'user',
          retryAfterSeconds: userLimit.retryAfterSeconds,
        },
        {
          status: 429,
          headers: { 'Retry-After': String(userLimit.retryAfterSeconds) },
        }
      );
    }
  }

  // Simple batched concurrency limiter to avoid hammering BrickLink
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async item => {
        try {
          const mapped = await mapToBrickLink(item.partId, item.colorId);
          if (!mapped) {
            if (process.env.NODE_ENV !== 'production') {
              try {
                console.log('prices/bricklink: unmapped item', {
                  key: item.key,
                  partId: item.partId,
                  colorId: item.colorId,
                });
              } catch {}
            }
            return;
          }
          const pg = await blGetPartPriceGuide(
            mapped.itemNo,
            mapped.colorId ?? undefined,
            mapped.itemType,
            pricingPrefs
          );
          prices[item.key] = {
            unitPrice: pg.unitPriceUsed,
            minPrice: pg.minPriceUsed,
            maxPrice: pg.maxPriceUsed,
            currency: pg.currencyCode,
            bricklinkColorId: mapped.colorId ?? null,
            itemType: mapped.itemType,
            scopeLabel,
            pricingSource: 'real_time',
            pricing_source: 'real_time',
            lastUpdatedAt: null,
            nextRefreshAt: null,
          };
          incrementCounter('prices_bricklink_fetched');
        } catch (err) {
          incrementCounter('prices_bricklink_item_failed', {
            key: item.key,
            error: err instanceof Error ? err.message : String(err),
          });
          if (process.env.NODE_ENV !== 'production') {
            try {
              console.error('prices/bricklink: price fetch failed', {
                key: item.key,
                partId: item.partId,
                colorId: item.colorId,
                error: err instanceof Error ? err.message : String(err),
              });
            } catch {}
          }
          // Swallow per-item errors; missing prices just won't be present in the map
        }
      })
    );
  }

  if (process.env.NODE_ENV !== 'production') {
    try {
      console.log('prices/bricklink response', {
        pricedCount: Object.keys(prices).length,
      });
    } catch {}
  }

  logEvent('prices_bricklink_response', {
    pricedCount: Object.keys(prices).length,
  });

  // Prices can be cached briefly - they don't change frequently and
  // stale-while-revalidate gives a snappy UX while background refreshing.
  return NextResponse.json(
    { prices },
    { headers: { 'Cache-Control': 'private, max-age=300, stale-while-revalidate=3600' } }
  );
}
