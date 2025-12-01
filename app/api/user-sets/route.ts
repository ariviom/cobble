import { getSupabaseClientForRequest } from '@/app/lib/supabaseServer';
import { NextRequest, NextResponse } from 'next/server';

export type UserSetWithMeta = {
  setNumber: string;
  status: 'owned' | 'want';
  name: string;
  year: number;
  numParts: number;
  imageUrl: string | null;
  themeId: number | null;
  updatedAt: string | null;
};

export type UserSetsResponse = {
  sets: UserSetWithMeta[];
};

export async function GET(req: NextRequest) {
  let supabase;
  try {
    supabase = getSupabaseClientForRequest(req);
  } catch (err) {
    console.error('UserSets: Supabase client init failed', {
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

    // Fetch user sets with joined metadata from rb_sets
    const { data: userSets, error: setsError } = await supabase
      .from('user_sets')
      .select(`
        set_num,
        status,
        updated_at,
        rb_sets (
          name,
          year,
          num_parts,
          image_url,
          theme_id
        )
      `)
      .eq('user_id', user.id);

    if (setsError) {
      console.error('UserSets: query failed', {
        userId: user.id,
        error: setsError.message,
      });
      return NextResponse.json({ error: 'query_failed' }, { status: 500 });
    }

    const sets: UserSetWithMeta[] = (userSets ?? []).map(row => {
      const meta = row.rb_sets as {
        name: string;
        year: number | null;
        num_parts: number | null;
        image_url: string | null;
        theme_id: number | null;
      } | null;

      return {
        setNumber: row.set_num,
        status: row.status,
        name: meta?.name ?? row.set_num,
        year: meta?.year ?? 0,
        numParts: meta?.num_parts ?? 0,
        imageUrl: meta?.image_url ?? null,
        themeId: meta?.theme_id ?? null,
        updatedAt: row.updated_at,
      };
    });

    return NextResponse.json({ sets } satisfies UserSetsResponse);
  } catch (err) {
    console.error('UserSets: unexpected failure', {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}

