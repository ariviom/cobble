import { blGetSetPriceGuide } from '@/app/lib/bricklink';
import { DEFAULT_PRICING_PREFERENCES } from '@/app/lib/pricing';
import { getSupabaseAuthServerClient } from '@/app/lib/supabaseAuthServerClient';
import { loadUserPricingPreferences } from '@/app/lib/userPricingPreferences';
import { incrementCounter, logEvent } from '@/lib/metrics';
import { consumeRateLimit, getClientIp } from '@/lib/rateLimit';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const RATE_WINDOW_MS =
  Number.parseInt(process.env.BL_RATE_WINDOW_MS ?? '', 10) || 60_000;
const RATE_LIMIT_PER_MINUTE =
  Number.parseInt(process.env.BL_RATE_LIMIT_PER_MINUTE ?? '', 10) || 60;
const RATE_LIMIT_PER_MINUTE_USER =
  Number.parseInt(process.env.BL_RATE_LIMIT_PER_MINUTE_USER ?? '', 10) || 60;

const schema = z.object({
  setNumber: z.string().min(1).max(200),
});

export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    const issues = parsed.error.flatten();
    incrementCounter('prices_bricklink_set_validation_failed', { issues });
    return NextResponse.json(
      { error: 'validation_failed', details: issues },
      { status: 400 }
    );
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
    if (process.env.NODE_ENV !== 'production') {
      try {
        console.warn('bricklink-set: failed to load pricing preferences', {
          setNumber,
          error: err instanceof Error ? err.message : String(err),
        });
      } catch {}
    }
  }

  const ipLimit = await consumeRateLimit(`ip:${clientIp}`, {
    windowMs: RATE_WINDOW_MS,
    maxHits: RATE_LIMIT_PER_MINUTE,
  });
  if (!ipLimit.allowed) {
    incrementCounter('prices_bricklink_set_rate_limited', { scope: 'ip' });
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
      incrementCounter('prices_bricklink_set_rate_limited', { scope: 'user' });
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
      pricing_source: 'real_time' as const,
      lastUpdatedAt: null,
      nextRefreshAt: null,
    });
  } catch (err) {
    incrementCounter('prices_bricklink_set_failed', {
      setNumber,
      error: err instanceof Error ? err.message : String(err),
    });
    if (process.env.NODE_ENV !== 'production') {
      console.error('bricklink-set price failed', {
        setNumber,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return NextResponse.json({ error: 'price_failed' }, { status: 502 });
  }
}


