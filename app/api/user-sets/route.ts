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
  owned: boolean;
  name: string;
  year: number;
  numParts: number;
  imageUrl: string | null;
  themeId: number | null;
  updatedAt: string | null;
  foundCount: number;
};

export type UserSetsResponse = {
  sets: UserSetWithMeta[];
};

type UserSetRow = Tables<'user_sets'>;

type UserSetRowWithMeta = {
  set_num: UserSetRow['set_num'];
  owned: UserSetRow['owned'];
  updated_at: UserSetRow['updated_at'];
  found_count: number;
  rb_sets: {
    name: string;
    year: number | null;
    num_parts: number | null;
    image_url: string | null;
    theme_id: number | null;
  } | null;
};

type TrackedProgressRow = {
  set_num: string;
  found_count: number;
  name: string | null;
  year: number | null;
  num_parts: number | null;
  image_url: string | null;
  theme_id: number | null;
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

    // Fetch user_sets rows and tracked progress aggregate in parallel
    const [userSetsResult, trackedResult] = await Promise.all([
      supabase
        .from('user_sets')
        .select(
          `
          set_num,
          owned,
          updated_at,
          found_count,
          rb_sets (
            name,
            year,
            num_parts,
            image_url,
            theme_id
          )
        `
        )
        .eq('user_id', user.id as UserSetRow['user_id']),
      supabase.rpc('get_tracked_set_progress'),
    ]);

    if (userSetsResult.error) {
      logger.error('user_sets.query_failed', {
        userId: user.id,
        error: userSetsResult.error.message,
      });
      return errorResponse('unknown_error');
    }

    // Build aggregate map from RPC (graceful degradation on failure)
    const trackedMap = new Map<string, TrackedProgressRow>();
    if (trackedResult.error) {
      logger.warn('user_sets.tracked_progress_failed', {
        userId: user.id,
        error: trackedResult.error.message,
      });
    } else {
      for (const row of (trackedResult.data ?? []) as TrackedProgressRow[]) {
        trackedMap.set(row.set_num, row);
      }
    }

    const typedRows = (userSetsResult.data ?? []) as UserSetRowWithMeta[];
    const seenSetNums = new Set<string>();

    // Map owned sets, using RPC aggregate for foundCount when available
    const sets: UserSetWithMeta[] = typedRows.map(row => {
      const meta = row.rb_sets;
      const tracked = trackedMap.get(row.set_num);
      seenSetNums.add(row.set_num);

      return {
        setNumber: row.set_num,
        owned: row.owned,
        name: meta?.name ?? row.set_num,
        year: meta?.year ?? 0,
        numParts: meta?.num_parts ?? 0,
        imageUrl: meta?.image_url ?? null,
        themeId: meta?.theme_id ?? null,
        updatedAt: row.updated_at,
        foundCount: tracked
          ? Number(tracked.found_count)
          : (row.found_count ?? 0),
      };
    });

    // Add tracked-only sets (have pieces but no user_sets row)
    for (const [setNum, tracked] of trackedMap) {
      if (seenSetNums.has(setNum)) continue;
      sets.push({
        setNumber: setNum,
        owned: false,
        name: tracked.name ?? setNum,
        year: tracked.year ?? 0,
        numParts: tracked.num_parts ?? 0,
        imageUrl: tracked.image_url ?? null,
        themeId: tracked.theme_id ?? null,
        updatedAt: null,
        foundCount: Number(tracked.found_count),
      });
    }

    return NextResponse.json({ sets } satisfies UserSetsResponse, {
      headers: { 'Cache-Control': CACHE_CONTROL },
    });
  } catch (err) {
    logger.error('user_sets.unexpected_failure', {
      error: err instanceof Error ? err.message : String(err),
    });
    return errorResponse('unknown_error');
  }
}
