import { NextRequest, NextResponse } from 'next/server';

import { errorResponse } from '@/app/lib/api/responses';
import { withCsrfProtection } from '@/app/lib/middleware/csrf';
import { getSupabaseAuthServerClient } from '@/app/lib/supabaseAuthServerClient';
import { logger } from '@/lib/metrics';
import type { Tables } from '@/supabase/types';

type GroupSessionRow = Tables<'group_sessions'>;

function extractSlugFromRequest(req: NextRequest): string | null {
  const match = req.nextUrl.pathname.match(
    /\/api\/group-sessions\/([^/]+)\/reactivate$/
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
      logger.warn('group_sessions.reactivate.unauthorized', {
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
      logger.error('group_sessions.reactivate.session_lookup_failed', {
        slug,
        error: sessionError.message,
      });
      return errorResponse('unknown_error');
    }

    if (!session) {
      return errorResponse('not_found', { message: 'session_not_found' });
    }

    if (session.host_user_id !== user.id) {
      return errorResponse('forbidden', { message: 'forbidden_not_host' });
    }

    if (session.is_active) {
      // Already active — return success with current state
      return NextResponse.json({
        session: {
          id: session.id,
          slug: session.slug,
          setNumber: session.set_num,
          isActive: true,
        },
      });
    }

    const { error: updateError } = await supabase
      .from('group_sessions')
      .update({
        is_active: true,
        ended_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', session.id as GroupSessionRow['id']);

    if (updateError) {
      logger.error('group_sessions.reactivate.update_failed', {
        slug,
        sessionId: session.id,
        error: updateError.message,
      });
      return errorResponse('unknown_error');
    }

    return NextResponse.json({
      session: {
        id: session.id,
        slug: session.slug,
        setNumber: session.set_num,
        isActive: true,
      },
    });
  } catch (err) {
    logger.error('group_sessions.reactivate.unexpected', {
      slug,
      error: err instanceof Error ? err.message : String(err),
    });
    return errorResponse('unknown_error');
  }
});
