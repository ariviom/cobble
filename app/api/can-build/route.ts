import { NextResponse, type NextRequest } from 'next/server';

import { errorResponse } from '@/app/lib/api/responses';
import {
  getEntitlements,
  assertFeature,
} from '@/app/lib/services/entitlements';
import {
  findBuildableSets,
  type CanBuildFilters,
} from '@/app/lib/services/canBuild';
import { getSupabaseAuthServerClient } from '@/app/lib/supabaseAuthServerClient';
import { logger } from '@/lib/metrics';

function parseIntParam(value: string | null, fallback: number): number {
  if (!value) return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : fallback;
}

function parseBoolParam(value: string | null, fallback: boolean): boolean {
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  return fallback;
}

export async function GET(req: NextRequest) {
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
    const params = req.nextUrl.searchParams;
    const filters: CanBuildFilters = {
      minParts: parseIntParam(params.get('minParts'), 50),
      maxParts: parseIntParam(params.get('maxParts'), 500),
      minCoverage: parseIntParam(params.get('minCoverage'), 80),
      theme: params.get('theme') || null,
      excludeMinifigs: parseBoolParam(params.get('excludeMinifigs'), false),
      page: parseIntParam(params.get('page'), 1),
      limit: Math.min(parseIntParam(params.get('limit'), 20), 100),
    };

    const result = await findBuildableSets(user.id, filters);

    return NextResponse.json(result, {
      headers: {
        'Cache-Control': 'private, max-age=30, stale-while-revalidate=60',
      },
    });
  } catch (err) {
    logger.error('can_build.route_failed', {
      userId: user.id,
      error: err instanceof Error ? err.message : String(err),
    });
    return errorResponse('unknown_error');
  }
}
