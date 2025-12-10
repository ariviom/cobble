import { NextRequest, NextResponse } from 'next/server';

import { errorResponse } from '@/app/lib/api/responses';
import { withCsrfProtection } from '@/app/lib/middleware/csrf';
import { getSupabaseAuthServerClient } from '@/app/lib/supabaseAuthServerClient';
import { logger } from '@/lib/metrics';
import type { Tables } from '@/supabase/types';

type GroupSessionRow = Tables<'group_sessions'>;

function extractSlugFromRequest(req: NextRequest): string | null {
  const match = req.nextUrl.pathname.match(
    /\/api\/group-sessions\/([^/]+)\/end$/
  );
  if (!match || !match[1]) return null;
  try {
    return decodeURIComponent(match[1]).trim();
  } catch {
    return match[1];
  }
}

export const POST = withCsrfProtection(async (req: NextRequest) => {
  const slug = extractSlugFromRequest(req);
  if (!slug) {
    return errorResponse('missing_required_field', {
      message: 'slug is required',
      details: { field: 'slug' },
    });
  }

  try {
    const supabase = await getSupabaseAuthServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      logger.warn('group_sessions.end.unauthorized', {
        slug,
        error: userError?.message,
      });
      return errorResponse('unauthorized');
    }

    const { data: session, error: sessionError } = await supabase
      .from('group_sessions')
      .select('*')
      .eq('slug', slug as GroupSessionRow['slug'])
      .maybeSingle();

    if (sessionError) {
      logger.error('group_sessions.end.session_lookup_failed', {
        slug,
        error: sessionError.message,
      });
      return errorResponse('unknown_error');
    }

    if (!session) {
      return errorResponse('not_found', { message: 'session_not_found' });
    }

    // The RLS policy ensures only the host can update their session. We still
    // double-check at the application layer.
    if (session.host_user_id !== user.id) {
      return errorResponse('forbidden', { message: 'forbidden_not_host' });
    }

    const { error: updateError } = await supabase
      .from('group_sessions')
      .update({
        is_active: false,
        ended_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', session.id as GroupSessionRow['id']);

    if (updateError) {
      logger.error('group_sessions.end.update_failed', {
        slug,
        sessionId: session.id,
        error: updateError.message,
      });
      return errorResponse('unknown_error');
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error('group_sessions.end.unexpected', {
      slug,
      error: err instanceof Error ? err.message : String(err),
    });
    return errorResponse('unknown_error');
  }
});
