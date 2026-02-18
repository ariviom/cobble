import { NextRequest, NextResponse } from 'next/server';

import { errorResponse } from '@/app/lib/api/responses';
import { withCsrfProtection } from '@/app/lib/middleware/csrf';
import { getSupabaseAuthServerClient } from '@/app/lib/supabaseAuthServerClient';
import { logger } from '@/lib/metrics';
import type { Tables } from '@/supabase/types';

type GroupSessionRow = Tables<'group_sessions'>;
type GroupSessionParticipantRow = Tables<'group_session_participants'>;

function extractParams(req: NextRequest): {
  slug: string;
  participantId: string;
} | null {
  const match = req.nextUrl.pathname.match(
    /\/api\/group-sessions\/([^/]+)\/participants\/([^/]+)$/
  );
  if (!match || !match[1] || !match[2]) return null;
  try {
    return {
      slug: decodeURIComponent(match[1]).trim(),
      participantId: decodeURIComponent(match[2]).trim(),
    };
  } catch {
    return null;
  }
}

export const DELETE = withCsrfProtection(async (req: NextRequest) => {
  const params = extractParams(req);
  if (!params) {
    return errorResponse('missing_required_field', {
      message: 'slug and participantId are required',
    });
  }

  const { slug, participantId } = params;

  try {
    const supabase = await getSupabaseAuthServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return errorResponse('unauthorized');
    }

    const { data: session, error: sessionError } = await supabase
      .from('group_sessions')
      .select('id, host_user_id')
      .eq('slug', slug as GroupSessionRow['slug'])
      .maybeSingle();

    if (sessionError) {
      logger.error('group_sessions.remove_participant.session_lookup_failed', {
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

    const { error: updateError } = await supabase
      .from('group_session_participants')
      .update({ left_at: new Date().toISOString() })
      .eq('id', participantId as GroupSessionParticipantRow['id'])
      .eq('session_id', session.id as GroupSessionParticipantRow['session_id']);

    if (updateError) {
      logger.error('group_sessions.remove_participant.update_failed', {
        slug,
        participantId,
        error: updateError.message,
      });
      return errorResponse('unknown_error');
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error('group_sessions.remove_participant.unexpected', {
      slug,
      error: err instanceof Error ? err.message : String(err),
    });
    return errorResponse('unknown_error');
  }
});
