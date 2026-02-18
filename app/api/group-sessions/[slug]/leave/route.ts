import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { errorResponse } from '@/app/lib/api/responses';
import { withCsrfProtection } from '@/app/lib/middleware/csrf';
import { getSupabaseAuthServerClient } from '@/app/lib/supabaseAuthServerClient';
import { logger } from '@/lib/metrics';
import type { Tables } from '@/supabase/types';

type GroupSessionParticipantRow = Tables<'group_session_participants'>;

const leaveBodySchema = z.object({
  clientToken: z.string().trim().min(1, 'client_token_required'),
});

function extractSlug(req: NextRequest): string | null {
  const match = req.nextUrl.pathname.match(
    /\/api\/group-sessions\/([^/]+)\/leave$/
  );
  if (!match || !match[1]) return null;
  try {
    const decoded = decodeURIComponent(match[1]).trim();
    return decoded.length ? decoded : null;
  } catch {
    return match[1].trim() || null;
  }
}

export const POST = withCsrfProtection(async (req: NextRequest) => {
  const slug = extractSlug(req);
  if (!slug) {
    return errorResponse('missing_required_field', {
      message: 'slug is required',
      details: { field: 'slug' },
    });
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return errorResponse('validation_failed', { message: 'invalid_json' });
  }

  const parsed = leaveBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return errorResponse('validation_failed', {
      details: parsed.error.flatten(),
    });
  }

  const { clientToken } = parsed.data;

  try {
    const supabase = await getSupabaseAuthServerClient();

    const { data: session, error: sessionError } = await supabase
      .from('group_sessions')
      .select('id')
      .eq('slug', slug)
      .maybeSingle();

    if (sessionError) {
      logger.error('group_sessions.leave.session_lookup_failed', {
        slug,
        error: sessionError.message,
      });
      return errorResponse('unknown_error');
    }

    if (!session) {
      // Graceful — session may have already been ended/deleted
      return NextResponse.json({ success: true });
    }

    const { error: updateError } = await supabase
      .from('group_session_participants')
      .update({ left_at: new Date().toISOString() })
      .eq('session_id', session.id as GroupSessionParticipantRow['session_id'])
      .eq(
        'client_token',
        clientToken as GroupSessionParticipantRow['client_token']
      )
      .is('left_at', null);

    if (updateError) {
      logger.error('group_sessions.leave.update_failed', {
        slug,
        error: updateError.message,
      });
      return errorResponse('unknown_error');
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error('group_sessions.leave.unexpected', {
      slug,
      error: err instanceof Error ? err.message : String(err),
    });
    return errorResponse('unknown_error');
  }
});
