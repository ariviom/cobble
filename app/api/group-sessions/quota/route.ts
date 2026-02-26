import { NextResponse } from 'next/server';

import { errorResponse } from '@/app/lib/api/responses';
import { getEntitlements, hasFeature } from '@/app/lib/services/entitlements';
import { logger } from '@/lib/metrics';
import { getUsageStatus } from '@/app/lib/services/usageCounters';
import { getSupabaseAuthServerClient } from '@/app/lib/supabaseAuthServerClient';

const MONTHLY_LIMIT = 2;

export async function GET() {
  try {
    const supabase = await getSupabaseAuthServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({
        canHost: false,
        reason: 'unauthenticated',
      });
    }

    const entitlements = await getEntitlements(user.id, { supabase });
    const hasUnlimited = hasFeature(entitlements, 'search_party.unlimited');

    if (hasUnlimited) {
      return NextResponse.json({
        canHost: true,
        unlimited: true,
        tier: entitlements.tier,
      });
    }

    // Check current usage
    const usage = await getUsageStatus({
      userId: user.id,
      featureKey: 'search_party_host:monthly',
      windowKind: 'monthly',
      limit: MONTHLY_LIMIT,
    });

    const canHost = usage.remaining > 0;
    const resetDate = new Date(usage.resetAt);

    return NextResponse.json({
      canHost,
      unlimited: false,
      tier: entitlements.tier,
      limit: usage.limit,
      used: usage.count,
      remaining: usage.remaining,
      resetAt: usage.resetAt,
      resetDateFormatted: resetDate.toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      }),
    });
  } catch (err) {
    logger.error('Failed to check Search Party quota', { error: err });
    return errorResponse('unknown_error', {
      message: 'Failed to check quota',
    });
  }
}
