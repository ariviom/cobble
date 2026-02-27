import { NextResponse } from 'next/server';

import { errorResponse } from '@/app/lib/api/responses';
import {
  getEntitlements,
  assertFeature,
} from '@/app/lib/services/entitlements';
import { findGapClosers } from '@/app/lib/services/canBuild';
import { getSupabaseAuthServerClient } from '@/app/lib/supabaseAuthServerClient';
import { logger } from '@/lib/metrics';

type RouteContext = {
  params: Promise<{ setNum: string }>;
};

export async function GET(_req: Request, context: RouteContext) {
  const supabase = await getSupabaseAuthServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return errorResponse('unauthorized');
  }

  try {
    const entitlements = await getEntitlements(user.id);
    assertFeature(entitlements, 'can_build.enabled', {
      featureDisplayName: 'Can Build',
    });
  } catch (err) {
    const typed = err as Error & { code?: string };
    if (typed.code === 'feature_unavailable') {
      return NextResponse.json(
        { error: 'feature_unavailable', reason: 'upgrade_required' },
        { status: 403 }
      );
    }
    throw err;
  }

  try {
    const { setNum } = await context.params;
    if (!setNum) {
      return errorResponse('validation_failed', {
        message: 'Missing setNum parameter',
      });
    }

    const result = await findGapClosers(user.id, setNum);

    return NextResponse.json(result, {
      headers: {
        'Cache-Control': 'private, max-age=300, stale-while-revalidate=600',
      },
    });
  } catch (err) {
    logger.error('can_build.gap_route_failed', {
      userId: user.id,
      error: err instanceof Error ? err.message : String(err),
    });
    return errorResponse('unknown_error');
  }
}
