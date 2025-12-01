import { getSupabaseAuthServerClient } from '@/app/lib/supabaseAuthServerClient';
import { NextRequest, NextResponse } from 'next/server';

function extractSlugFromRequest(req: NextRequest): string | null {
  const match = req.nextUrl.pathname.match(/\/api\/group-sessions\/([^/]+)\/end$/);
  if (!match || !match[1]) return null;
  try {
    return decodeURIComponent(match[1]).trim();
  } catch {
    return match[1];
  }
}

export async function POST(req: NextRequest) {
  const slug = extractSlugFromRequest(req);
  if (!slug) {
    return NextResponse.json({ error: 'missing_slug' }, { status: 400 });
  }

  try {
    const supabase = await getSupabaseAuthServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { error: 'not_authenticated' },
        { status: 401 }
      );
    }

    const { data: session, error: sessionError } = await supabase
      .from('group_sessions')
      .select('*')
      .eq('slug', slug)
      .maybeSingle();

    if (sessionError) {
      console.error('GroupSessionsEnd: failed to load session by slug', {
        slug,
        error: sessionError.message,
      });
      return NextResponse.json({ error: 'session_lookup_failed' }, { status: 500 });
    }

    if (!session) {
      return NextResponse.json({ error: 'session_not_found' }, { status: 404 });
    }

    // The RLS policy ensures only the host can update their session. We still
    // double-check at the application layer.
    if (session.host_user_id !== user.id) {
      return NextResponse.json(
        { error: 'forbidden_not_host' },
        { status: 403 }
      );
    }

    const { error: updateError } = await supabase
      .from('group_sessions')
      .update({
        is_active: false,
        ended_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', session.id);

    if (updateError) {
      console.error('GroupSessionsEnd: failed to update session', {
        slug,
        sessionId: session.id,
        error: updateError.message,
      });
      return NextResponse.json(
        { error: 'session_update_failed' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('GroupSessionsEnd: unexpected failure', {
      slug,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}


