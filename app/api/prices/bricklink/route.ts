import { blGetPartPriceGuide } from '@/app/lib/bricklink';
import { mapToBrickLink } from '@/app/lib/mappings/rebrickableToBricklink';
import {
    DEFAULT_PRICING_PREFERENCES,
    formatPricingScopeLabel,
} from '@/app/lib/pricing';
import { getSupabaseAuthServerClient } from '@/app/lib/supabaseAuthServerClient';
import { loadUserPricingPreferences } from '@/app/lib/userPricingPreferences';
import { NextRequest, NextResponse } from 'next/server';

type PriceRequestItem = {
  key: string;
  partId: string;
  colorId: number;
};

type PriceRequestBody = {
  items: PriceRequestItem[];
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

export async function POST(req: NextRequest) {
  let body: PriceRequestBody;
  try {
    body = (await req.json()) as PriceRequestBody;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const rawItems = Array.isArray(body.items) ? body.items : [];
  if (!rawItems.length) {
    return NextResponse.json({ prices: {} satisfies Record<string, never> });
  }

  const items: PriceRequestItem[] = rawItems
    .filter(
      it =>
        it &&
        typeof it.key === 'string' &&
        typeof it.partId === 'string' &&
        typeof it.colorId === 'number'
    )
    .slice(0, MAX_ITEMS);

  if (process.env.NODE_ENV !== 'production') {
    try {
      console.log('prices/bricklink POST', {
        rawCount: rawItems.length,
        filteredCount: items.length,
      });
    } catch {}
  }

  const prices: Record<string, PriceResponseEntry> = {};

  // Determine pricing preferences for this request (user-specific when
  // authenticated via Supabase cookies; otherwise fall back to global USD).
  let pricingPrefs = DEFAULT_PRICING_PREFERENCES;
  try {
    const supabase = await getSupabaseAuthServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (!userError && user) {
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
        } catch (err) {
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

  // Prices can be cached briefly - they don't change frequently and
  // stale-while-revalidate gives a snappy UX while background refreshing.
  return NextResponse.json(
    { prices },
    { headers: { 'Cache-Control': 'private, max-age=300, stale-while-revalidate=3600' } }
  );
}
