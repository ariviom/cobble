import { NextRequest, NextResponse } from 'next/server';

import { errorResponse } from '@/app/lib/api/responses';
import { getEntitlements, hasFeature } from '@/app/lib/services/entitlements';
import { getUsageStatus } from '@/app/lib/services/usageCounters';
import { getSupabaseAuthServerClient } from '@/app/lib/supabaseAuthServerClient';
import { logger } from '@/lib/metrics';
import { consumeRateLimit, getClientIp } from '@/lib/rateLimit';

export async function GET(req: NextRequest) {
  try {
    const clientIp = (await getClientIp(req)) ?? 'unknown';
    const ipLimit = await consumeRateLimit(`identify-quota:ip:${clientIp}`, {
      windowMs: 60_000,
      maxHits: 30,
    });
    if (!ipLimit.allowed) {
      return errorResponse('rate_limited', {
        status: 429,
        headers: { 'Retry-After': String(ipLimit.retryAfterSeconds) },
      });
    }

    const supabase = await getSupabaseAuthServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return errorResponse('unauthorized', { status: 401 });
    }

    const entitlements = await getEntitlements(user.id);

    if (hasFeature(entitlements, 'identify.unlimited')) {
      return NextResponse.json({
        status: 'unlimited',
        tier: entitlements.tier,
      });
    }

    const usage = await getUsageStatus({
      userId: user.id,
      featureKey: 'identify:daily',
      windowKind: 'daily',
      limit: 5,
    });

    return NextResponse.json({
      status: 'metered',
      tier: entitlements.tier,
      limit: usage.limit,
      remaining: usage.remaining,
      resetAt: usage.resetAt,
    });
  } catch (err) {
    logger.error('identify.quota_failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return errorResponse('unknown_error', { status: 500 });
  }
}
