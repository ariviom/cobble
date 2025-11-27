import type { Database } from '@/supabase/types';
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';

type CreateSessionBody = {
  setNumber: string;
};

function getSupabaseClientForRequest(req: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY'
    );
  }

  const authHeader = req.headers.get('authorization') ?? undefined;

  return createClient<Database>(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: authHeader ? { Authorization: authHeader } : {},
    },
    auth: {
      persistSession: false,
    },
  });
}

function generateSlug(): string {
  // Short, URL-safe slug for sharing sessions. Collision probability is
  // negligible given the small expected volume; the UNIQUE constraint on slug
  // will guard at the database level.
  return crypto.randomBytes(6).toString('base64url').slice(0, 10).toLowerCase();
}

export async function POST(req: NextRequest) {
  let body: CreateSessionBody;
  try {
    body = (await req.json()) as CreateSessionBody;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const setNumber = body.setNumber?.trim();
  if (!setNumber) {
    return NextResponse.json(
      { error: 'missing_set_number' },
      { status: 400 }
    );
  }

  let supabase;
  try {
    supabase = getSupabaseClientForRequest(req);
  } catch (err) {
    console.error('GroupSessions: Supabase client init failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: 'server_misconfigured' }, { status: 500 });
  }

  try {
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

    // Reuse an existing active session for this host + set when possible so
    // multiple clicks on "Search together" do not create duplicate sessions.
    const { data: existing, error: existingError } = await supabase
      .from('group_sessions')
      .select('*')
      .eq('host_user_id', user.id)
      .eq('set_num', setNumber)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingError) {
      console.error('GroupSessions: failed to load existing session', {
        setNumber,
        userId: user.id,
        error: existingError.message,
      });
    }

    if (existing) {
      return NextResponse.json({
        session: {
          id: existing.id,
          slug: existing.slug,
          setNumber: existing.set_num,
          isActive: existing.is_active,
        },
      });
    }

    let lastError: unknown = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const slug = generateSlug();

      const { data: created, error: insertError } = await supabase
        .from('group_sessions')
        .insert({
          host_user_id: user.id,
          set_num: setNumber,
          slug,
        })
        .select('*')
        .maybeSingle();

      if (!insertError && created) {
        return NextResponse.json({
          session: {
            id: created.id,
            slug: created.slug,
            setNumber: created.set_num,
            isActive: created.is_active,
          },
        });
      }

      lastError = insertError;

      // If slug collided (unique_violation), try again with a new slug.
      if (!insertError || insertError.code !== '23505') {
        break;
      }
    }

    console.error('GroupSessions: failed to create session', {
      setNumber,
      userId: user.id,
      error:
        lastError instanceof Error
          ? lastError.message
          : JSON.stringify(lastError),
    });
    return NextResponse.json({ error: 'create_session_failed' }, { status: 500 });
  } catch (err) {
    console.error('GroupSessions: unexpected failure', {
      setNumber,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}



