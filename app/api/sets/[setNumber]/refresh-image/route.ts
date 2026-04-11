import { errorResponse } from '@/app/lib/api/responses';
import { withCsrfProtection } from '@/app/lib/middleware/csrf';
import { getSetSummary } from '@/app/lib/rebrickable';
import { getSupabaseAuthServerClient } from '@/app/lib/supabaseAuthServerClient';
import { incrementCounter, logger } from '@/lib/metrics';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export const POST = withCsrfProtection(
  async (
    _req: NextRequest,
    { params }: { params: Promise<{ setNumber: string }> }
  ) => {
    const supabase = await getSupabaseAuthServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return errorResponse('unauthorized');
    }

    const { setNumber: rawSetNumber } = await params;
    const trimmed = rawSetNumber.trim();

    if (!trimmed) {
      return errorResponse('validation_failed', {
        message: 'Missing or empty setNumber',
      });
    }

    try {
      // Fetch latest data from Rebrickable (cached on server side).
      const summary = await getSetSummary(trimmed);
      const imageUrl =
        typeof summary.imageUrl === 'string' &&
        summary.imageUrl.trim().length > 0
          ? summary.imageUrl.trim()
          : null;

      if (!imageUrl) {
        incrementCounter('set_image_refresh_no_url', { setNumber: trimmed });
        return NextResponse.json(
          { imageUrl: null },
          { status: 200, headers: { 'Cache-Control': 'no-store' } }
        );
      }

      incrementCounter('set_image_refresh_success', { setNumber: trimmed });
      return NextResponse.json(
        { imageUrl },
        { status: 200, headers: { 'Cache-Control': 'no-store' } }
      );
    } catch (err) {
      logger.error('set_image_refresh_failed', {
        setNumber: trimmed,
        error: err instanceof Error ? err.message : String(err),
      });
      incrementCounter('set_image_refresh_failed', { setNumber: trimmed });
      return errorResponse('rebrickable_failed', {
        message: 'Failed to refresh set image from Rebrickable',
      });
    }
  }
);
