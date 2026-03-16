import { errorResponse } from '@/app/lib/api/responses';
import {
  BL_RATE_LIMIT_IP,
  BL_RATE_LIMIT_USER,
  BL_RATE_WINDOW_MS,
} from '@/app/lib/bricklink/rateLimitConfig';
import { withCsrfProtection } from '@/app/lib/middleware/csrf';
import { DEFAULT_PRICING_PREFERENCES } from '@/app/lib/pricing';
import {
  fetchBricklinkPrices,
  type PriceRequestItem,
} from '@/app/lib/services/pricing';
import { getSupabaseAuthServerClient } from '@/app/lib/supabaseAuthServerClient';
import { loadUserPricingPreferences } from '@/app/lib/userPricingPreferences';
import { incrementCounter, logEvent, logger } from '@/lib/metrics';
import { consumeRateLimit, getClientIp } from '@/lib/rateLimit';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const MAX_ITEMS = 100;
const BATCH_SIZE = 10;

const schema = z.object({
  items: z
    .array(
      z.object({
        key: z.string().min(1).max(200),
        partId: z.string().min(1).max(200),
        colorId: z.number().int(),
        blPartId: z.string().min(1).max(200).optional(),
        blColorId: z.number().int().optional(),
        itemType: z.enum(['PART', 'MINIFIG']).optional(),
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

  const ipLimit = await consumeRateLimit(`bl-prices:ip:${clientIp}`, {
    windowMs: BL_RATE_WINDOW_MS,
    maxHits: BL_RATE_LIMIT_IP,
  });
  if (!ipLimit.allowed) {
    incrementCounter('prices_bricklink_rate_limited', { scope: 'ip' });
    return errorResponse('rate_limited', {
      message: 'Too many pricing requests. Please wait a moment.',
      details: { scope: 'ip', retryAfterSeconds: ipLimit.retryAfterSeconds },
      headers: { 'Retry-After': String(ipLimit.retryAfterSeconds) },
    });
  }

  if (userId) {
    const userLimit = await consumeRateLimit(`bl-prices:user:${userId}`, {
      windowMs: BL_RATE_WINDOW_MS,
      maxHits: BL_RATE_LIMIT_USER,
    });
    if (!userLimit.allowed) {
      incrementCounter('prices_bricklink_rate_limited', { scope: 'user' });
      return errorResponse('rate_limited', {
        message: 'Too many pricing requests. Please wait a moment.',
        details: {
          scope: 'user',
          retryAfterSeconds: userLimit.retryAfterSeconds,
        },
        headers: { 'Retry-After': String(userLimit.retryAfterSeconds) },
      });
    }
  }

  const prices = await fetchBricklinkPrices(items, pricingPrefs, {
    batchSize: BATCH_SIZE,
    logPrefix: 'prices.bricklink',
  });

  logEvent('prices_bricklink_response', {
    pricedCount: Object.keys(prices).length,
  });

  // Prices can be cached briefly - they don't change frequently and
  // stale-while-revalidate gives a snappy UX while background refreshing.
  return NextResponse.json(
    { prices },
    {
      headers: {
        'Cache-Control': 'private, max-age=300, stale-while-revalidate=3600',
      },
    }
  );
});
