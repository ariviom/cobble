import { NextRequest, NextResponse } from 'next/server';

import { errorResponse } from '@/app/lib/api/responses';
import { getSupabaseAuthServerClient } from '@/app/lib/supabaseAuthServerClient';
import { logger } from '@/lib/metrics';

export async function GET(req: NextRequest) {
  const setNumber = req.nextUrl.searchParams.get('setNumber');
  if (!setNumber) {
    return errorResponse('missing_required_field', {
      message: 'setNumber is required',
      details: { field: 'setNumber' },
    });
  }

  try {
    const supabase = await getSupabaseAuthServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return errorResponse('unauthorized');
    }

    const { data: session, error: queryError } = await supabase
      .from('group_sessions')
      .select('slug, ended_at')
      .eq('host_user_id', user.id)
      .eq('set_num', setNumber)
      .eq('is_active', false)
      .order('ended_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (queryError) {
      logger.error('group_sessions.previous.query_failed', {
        setNumber,
        error: queryError.message,
      });
      return errorResponse('unknown_error');
    }

    if (!session) {
      return NextResponse.json({ session: null });
    }

    return NextResponse.json({
      session: {
        slug: session.slug,
        endedAt: session.ended_at,
      },
    });
  } catch (err) {
    logger.error('group_sessions.previous.unexpected', {
      setNumber,
      error: err instanceof Error ? err.message : String(err),
    });
    return errorResponse('unknown_error');
  }
}
