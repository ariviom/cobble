import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { errorResponse } from '@/app/lib/api/responses';
import { withCsrfProtection } from '@/app/lib/middleware/csrf';
import { getSupabaseAuthServerClient } from '@/app/lib/supabaseAuthServerClient';
import { logger } from '@/lib/metrics';
import type { Tables } from '@/supabase/types';

type GroupSessionParticipantRow = Tables<'group_session_participants'>;

const joinBodySchema = z.object({
  displayName: z.string().trim().min(1, 'display_name_required'),
  clientToken: z.string().trim().min(1, 'client_token_required'),
});

function extractSlug(req: NextRequest): string | null {
  const match = req.nextUrl.pathname.match(
    /\/api\/group-sessions\/([^/]+)\/join$/
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

  const parsed = joinBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return errorResponse('validation_failed', {
      details: parsed.error.flatten(),
    });
  }

  const { displayName, clientToken } = parsed.data;

  try {
    const supabase = await getSupabaseAuthServerClient();
    const { data: session, error: sessionError } = await supabase
      .from('group_sessions')
      .select('id, set_num, is_active')
      .eq('slug', slug)
      .maybeSingle();

    if (sessionError) {
      logger.error('group_sessions.join.session_lookup_failed', {
        slug,
        error: sessionError.message,
      });
      return errorResponse('unknown_error');
    }

    if (!session || !session.is_active) {
      return errorResponse('not_found', {
        message: 'session_not_found_or_inactive',
      });
    }

    // Determine whether the caller is authenticated; participants can be
    // anonymous, but we attach user_id when available so they can be
    // recognized across devices.
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const userId = user?.id ?? null;

    const { data: existing, error: participantError } = await supabase
      .from('group_session_participants')
      .select('*')
      .eq('session_id', session.id as GroupSessionParticipantRow['session_id'])
      .eq(
        'client_token',
        clientToken as GroupSessionParticipantRow['client_token']
      )
      .maybeSingle();

    if (participantError) {
      logger.error('group_sessions.join.participant_lookup_failed', {
        slug,
        sessionId: session.id,
        error: participantError.message,
      });
    }

    if (existing) {
      const { data: updated, error: updateError } = await supabase
        .from('group_session_participants')
        .update({
          display_name: displayName,
          user_id: userId ?? existing.user_id,
          last_seen_at: new Date().toISOString(),
        })
        .eq('id', existing.id as GroupSessionParticipantRow['id'])
        .select('*')
        .maybeSingle();

      if (updateError || !updated) {
        logger.error('group_sessions.join.participant_update_failed', {
          slug,
          sessionId: session.id,
          participantId: existing.id,
          error: updateError?.message,
        });
        return errorResponse('unknown_error');
      }

      return NextResponse.json({
        session: {
          id: session.id,
          setNumber: session.set_num,
        },
        participant: {
          id: updated.id,
          displayName: updated.display_name,
          piecesFound: updated.pieces_found,
        },
      });
    }

    const { data: inserted, error: insertError } = await supabase
      .from('group_session_participants')
      .insert({
        session_id: session.id as GroupSessionParticipantRow['session_id'],
        user_id: userId as GroupSessionParticipantRow['user_id'],
        client_token: clientToken as GroupSessionParticipantRow['client_token'],
        display_name: displayName,
      })
      .select('*')
      .maybeSingle();

    if (insertError || !inserted) {
      logger.error('group_sessions.join.participant_insert_failed', {
        slug,
        sessionId: session.id,
        error: insertError?.message,
      });
      return errorResponse('unknown_error');
    }

    return NextResponse.json({
      session: {
        id: session.id,
        setNumber: session.set_num,
      },
      participant: {
        id: inserted.id,
        displayName: inserted.display_name,
        piecesFound: inserted.pieces_found,
      },
    });
  } catch (err) {
    logger.error('group_sessions.join.unexpected', {
      slug,
      error: err instanceof Error ? err.message : String(err),
    });
    return errorResponse('unknown_error');
  }
});
