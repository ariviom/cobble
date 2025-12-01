import { getSupabaseAuthServerClient } from '@/app/lib/supabaseAuthServerClient';
import type { Tables } from '@/supabase/types';
import { NextRequest, NextResponse } from 'next/server';

type JoinBody = {
  displayName: string;
  clientToken: string;
};

type GroupSessionParticipantRow = Tables<'group_session_participants'>;

export async function POST(
  req: NextRequest,
) {
  const match = req.nextUrl.pathname.match(/\/api\/group-sessions\/([^/]+)\/join$/);
  const slug = match && match[1] ? decodeURIComponent(match[1]).trim() : '';
  if (!slug) {
    return NextResponse.json({ error: 'missing_slug' }, { status: 400 });
  }

  let body: JoinBody;
  try {
    body = (await req.json()) as JoinBody;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const displayName = body.displayName?.trim();
  const clientToken = body.clientToken?.trim();

  if (!displayName) {
    return NextResponse.json(
      { error: 'missing_display_name' },
      { status: 400 }
    );
  }

  if (!clientToken) {
    return NextResponse.json(
      { error: 'missing_client_token' },
      { status: 400 }
    );
  }

  try {
    const supabase = await getSupabaseAuthServerClient();
    const { data: session, error: sessionError } = await supabase
      .from('group_sessions')
      .select('id, set_num, is_active')
      .eq('slug', slug)
      .maybeSingle();

    if (sessionError) {
      console.error('GroupSessionsJoin: failed to load session by slug', {
        slug,
        error: sessionError.message,
      });
      return NextResponse.json({ error: 'session_lookup_failed' }, { status: 500 });
    }

    if (!session || !session.is_active) {
      return NextResponse.json(
        { error: 'session_not_found_or_inactive' },
        { status: 404 }
      );
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
      .eq('client_token', clientToken as GroupSessionParticipantRow['client_token'])
      .maybeSingle();

    if (participantError) {
      console.error('GroupSessionsJoin: failed to load participant', {
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
        console.error('GroupSessionsJoin: failed to update participant', {
          slug,
          sessionId: session.id,
          participantId: existing.id,
          error: updateError?.message,
        });
        return NextResponse.json(
          { error: 'participant_update_failed' },
          { status: 500 }
        );
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
      console.error('GroupSessionsJoin: failed to insert participant', {
        slug,
        sessionId: session.id,
        error: insertError?.message,
      });
      return NextResponse.json(
        { error: 'participant_insert_failed' },
        { status: 500 }
      );
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
    console.error('GroupSessionsJoin: unexpected failure', {
      slug,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}


