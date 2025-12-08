import { NextResponse } from 'next/server';

import { errorResponse } from '@/app/lib/api/responses';
import { getSupabaseAuthServerClient } from '@/app/lib/supabaseAuthServerClient';
import { logger } from '@/lib/metrics';
import type { Tables } from '@/supabase/types';

// User sets are private and user-specific. Cache briefly client-side to avoid
// redundant fetches, but use private to prevent CDN caching of user data.
// Zustand store handles optimistic updates on mutations; this cache is for
// initial page loads and tab switches.
const CACHE_CONTROL = 'private, max-age=30, stale-while-revalidate=60';

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

type UserSetRow = Tables<'user_sets'>;

type UserSetRowWithMeta = {
  set_num: UserSetRow['set_num'];
  status: UserSetRow['status'];
  updated_at: UserSetRow['updated_at'];
  rb_sets: {
    name: string;
    year: number | null;
    num_parts: number | null;
    image_url: string | null;
    theme_id: number | null;
  } | null;
};

export async function GET() {
  const supabase = await getSupabaseAuthServerClient();

  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      logger.warn('user_sets.unauthorized', { error: userError?.message });
      return errorResponse('unauthorized');
    }

    // Fetch user sets with joined metadata from rb_sets
    const {
      data: userSets,
      error: setsError,
    } = await supabase
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
      .eq('user_id', user.id as UserSetRow['user_id']);

    if (setsError) {
      logger.error('user_sets.query_failed', {
        userId: user.id,
        error: setsError.message,
      });
      return errorResponse('unknown_error');
    }

    const typedRows = (userSets ?? []) as UserSetRowWithMeta[];

    const sets: UserSetWithMeta[] = typedRows.map(row => {
      const meta = row.rb_sets;

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

    return NextResponse.json(
      { sets } satisfies UserSetsResponse,
      { headers: { 'Cache-Control': CACHE_CONTROL } }
    );
  } catch (err) {
    logger.error('user_sets.unexpected_failure', {
      error: err instanceof Error ? err.message : String(err),
    });
    return errorResponse('unknown_error');
  }
}

