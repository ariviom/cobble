import { NextResponse } from 'next/server';

import { errorResponse } from '@/app/lib/api/responses';
import { getEntitlements } from '@/app/lib/services/entitlements';
import { getSupabaseAuthServerClient } from '@/app/lib/supabaseAuthServerClient';
import { logger } from '@/lib/metrics';

export async function GET() {
  const supabase = await getSupabaseAuthServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    logger.error('entitlements.auth_failed', { error: userError.message });
    return errorResponse('unauthorized', { status: 401 });
  }

  if (!user) {
    return NextResponse.json({ tier: 'free', features: [] });
  }

  try {
    const entitlements = await getEntitlements(user.id);
    return NextResponse.json({
      tier: entitlements.tier,
      features: entitlements.features,
    });
  } catch (err) {
    logger.error('entitlements.fetch_failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return errorResponse('unknown_error', { status: 500 });
  }
}
