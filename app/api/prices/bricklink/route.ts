import { errorResponse } from '@/app/lib/api/responses';
import { withCsrfProtection } from '@/app/lib/middleware/csrf';
import {
    DEFAULT_PRICING_PREFERENCES,
} from '@/app/lib/pricing';
import { fetchBricklinkPrices, type PriceRequestItem } from '@/app/lib/services/pricing';
import { getSupabaseAuthServerClient } from '@/app/lib/supabaseAuthServerClient';
import { loadUserPricingPreferences } from '@/app/lib/userPricingPreferences';
import { incrementCounter, logEvent, logger } from '@/lib/metrics';
import { consumeRateLimit, getClientIp } from '@/lib/rateLimit';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

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

export const POST = withCsrfProtection(async (req: NextRequest) => {
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    const issues = parsed.error.flatten();
    incrementCounter('prices_bricklink_validation_failed', { issues });
    return errorResponse('validation_failed', { details: issues });
  }

  const items: PriceRequestItem[] = parsed.data.items;
  const clientIp = (await getClientIp(req)) ?? 'unknown';

  if (process.env.NODE_ENV !== 'production') {
    logEvent('prices.bricklink.request', {
      itemCount: items.length,
    });
  }

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
    logger.warn('prices.bricklink.load_prefs_failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

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

  const prices = await fetchBricklinkPrices(items, pricingPrefs, {
    batchSize: BATCH_SIZE,
    logPrefix: 'prices.bricklink',
  });

  if (process.env.NODE_ENV !== 'production') {
    logEvent('prices.bricklink.response', {
      pricedCount: Object.keys(prices).length,
    });
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
});
