import { errorResponse } from '@/app/lib/api/responses';
import { blGetSetPriceGuide } from '@/app/lib/bricklink';
import {
  BL_RATE_LIMIT_IP,
  BL_RATE_LIMIT_USER,
  BL_RATE_WINDOW_MS,
} from '@/app/lib/bricklink/rateLimitConfig';
import { withCsrfProtection } from '@/app/lib/middleware/csrf';
import { DEFAULT_PRICING_PREFERENCES } from '@/app/lib/pricing';
import { getSupabaseAuthServerClient } from '@/app/lib/supabaseAuthServerClient';
import { loadUserPricingPreferences } from '@/app/lib/userPricingPreferences';
import { incrementCounter, logEvent, logger } from '@/lib/metrics';
import { consumeRateLimit, getClientIp } from '@/lib/rateLimit';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const schema = z.object({
  setNumber: z.string().min(1).max(200),
});

export const POST = withCsrfProtection(async (req: NextRequest) => {
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    const issues = parsed.error.flatten();
    incrementCounter('prices_bricklink_set_validation_failed', { issues });
    return errorResponse('validation_failed', { details: issues });
  }

  const setNumber = parsed.data.setNumber.trim();

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
    logger.warn('prices.bricklink_set.load_prefs_failed', {
      setNumber,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  const ipLimit = await consumeRateLimit(`bl-set-price:ip:${clientIp}`, {
    windowMs: BL_RATE_WINDOW_MS,
    maxHits: BL_RATE_LIMIT_IP,
  });
  if (!ipLimit.allowed) {
    incrementCounter('prices_bricklink_set_rate_limited', { scope: 'ip' });
    return errorResponse('rate_limited', {
      message: 'Too many pricing requests. Please wait a moment.',
      details: { scope: 'ip', retryAfterSeconds: ipLimit.retryAfterSeconds },
      headers: { 'Retry-After': String(ipLimit.retryAfterSeconds) },
    });
  }

  if (userId) {
    const userLimit = await consumeRateLimit(`bl-set-price:user:${userId}`, {
      windowMs: BL_RATE_WINDOW_MS,
      maxHits: BL_RATE_LIMIT_USER,
    });
    if (!userLimit.allowed) {
      incrementCounter('prices_bricklink_set_rate_limited', { scope: 'user' });
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

  try {
    const guide = await blGetSetPriceGuide(setNumber, pricingPrefs);
    incrementCounter('prices_bricklink_set_fetched', { setNumber });
    logEvent('prices_bricklink_set_response', { setNumber });
    return NextResponse.json({
      total: guide.unitPriceUsed,
      minPrice: guide.minPriceUsed,
      maxPrice: guide.maxPriceUsed,
      currency: guide.currencyCode,
      pricingSource: 'real_time' as const,
      lastUpdatedAt: null,
      nextRefreshAt: null,
    });
  } catch (err) {
    incrementCounter('prices_bricklink_set_failed', {
      setNumber,
      error: err instanceof Error ? err.message : String(err),
    });
    logger.error('prices.bricklink_set.price_failed', {
      setNumber,
      error: err instanceof Error ? err.message : String(err),
    });
    return errorResponse('external_service_error', { status: 502 });
  }
});
