'use client';

import { useEffect, useRef } from 'react';

import { useSupabaseUser } from '@/app/hooks/useSupabaseUser';
import { getSupabaseBrowserClient } from '@/app/lib/supabaseClient';
import { logger } from '@/lib/metrics';
import {
  type HydratedSetInput,
  type SetStatus,
  type UserSet,
  useUserSetsStore,
} from '@/app/store/user-sets';
import type {
  UserSetWithMeta,
  UserSetsResponse,
} from '@/app/api/user-sets/route';

/**
 * Global hydration state for deduplication across component instances.
 *
 * We use a global Map + Promise pattern to prevent duplicate fetches when
 * multiple components mount simultaneously. Each user ID gets at most one
 * inflight request, and subsequent hook instances wait on the existing promise.
 */
type HydrationEntry = {
  promise: Promise<void>;
  completed: boolean;
};
const hydrationByUser = new Map<string, HydrationEntry>();

async function syncLocalSetsToSupabase(
  userId: string,
  supabase: ReturnType<typeof getSupabaseBrowserClient>
) {
  try {
    const localSets = useUserSetsStore.getState().sets;
    const entries = Object.values(localSets).filter(
      (entry): entry is UserSet => !!entry && entry.status.owned
    );

    if (entries.length === 0) {
      return;
    }

    const upserts = entries.map(entry => ({
      user_id: userId,
      set_num: entry.setNumber,
      owned: true,
    }));

    if (upserts.length === 0) {
      return;
    }

    await supabase
      .from('user_sets')
      .upsert(upserts, { onConflict: 'user_id,set_num' });
  } catch (error) {
    logger.error('hydrate.sync_local_sets_failed', {
      error: (error as Error)?.message ?? String(error),
    });
  }
}

function mapDbOwnedToLocal(owned: boolean): SetStatus {
  return { owned };
}

export function useHydrateUserSets() {
  const { user } = useSupabaseUser();
  const hydrate = useUserSetsStore(state => state.hydrateFromSupabase);
  const markHydrated = useUserSetsStore(state => state.markHydrated);
  // Use ref to track per-instance cancellation (safe for Concurrent Mode)
  const cancelledRef = useRef(false);
  const prevUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    cancelledRef.current = false;

    if (!user) {
      // Clean up hydration state for logged-out users so re-login re-hydrates
      if (prevUserIdRef.current) {
        hydrationByUser.delete(prevUserIdRef.current);
      }
      markHydrated();
      return;
    }

    const userId = user.id;
    prevUserIdRef.current = userId;
    const existing = hydrationByUser.get(userId);

    // If already completed successfully, skip
    if (existing?.completed) {
      return;
    }

    // If there's an inflight request, wait for it instead of duplicating
    if (existing && !existing.completed) {
      void existing.promise;
      return;
    }

    const supabase = getSupabaseBrowserClient();

    const run = async () => {
      try {
        // Use API route for reliable server-side join query; auth is derived
        // from Supabase cookies via the SSR server client and middleware.
        const response = await fetch('/api/user-sets', {
          credentials: 'same-origin',
        });

        if (!response.ok) {
          if (response.status === 401) {
            // Server considers the user unauthenticated; treat this as a
            // no-op for hydration and rely on client-side Supabase hooks
            // to eventually clear any stale cached user state.
            markHydrated();
            return;
          }
          logger.error('hydrate.api_request_failed', {
            status: response.status,
          });
          markHydrated();
          hydrationByUser.delete(userId);
          return;
        }

        const data = (await response.json()) as UserSetsResponse;

        if (cancelledRef.current) return;

        if (!data.sets || data.sets.length === 0) {
          // No remote sets - sync local sets to Supabase
          await syncLocalSetsToSupabase(userId, supabase);
          markHydrated();
          // Mark as completed
          const entry = hydrationByUser.get(userId);
          if (entry) entry.completed = true;
          return;
        }

        const hydratedEntries: HydratedSetInput[] = data.sets.map(
          (row: UserSetWithMeta) => {
            const updatedAt =
              row.updatedAt && !Number.isNaN(Date.parse(row.updatedAt))
                ? Date.parse(row.updatedAt)
                : undefined;

            const entry: HydratedSetInput = {
              setNumber: row.setNumber,
              status: mapDbOwnedToLocal(row.owned),
              name: row.name,
              year: row.year,
              imageUrl: row.imageUrl,
              numParts: row.numParts,
              themeId: row.themeId,
              foundCount: row.foundCount,
            };

            if (typeof updatedAt === 'number') {
              entry.updatedAt = updatedAt;
            }

            return entry;
          }
        );

        hydrate(hydratedEntries);
        // Mark as completed
        const entry = hydrationByUser.get(userId);
        if (entry) entry.completed = true;
      } catch (err) {
        logger.error('hydrate.user_sets_failed', {
          error: (err as Error)?.message ?? String(err),
        });
        markHydrated();
        hydrationByUser.delete(userId);
      }
    };

    const promise = run();
    hydrationByUser.set(userId, { promise, completed: false });

    return () => {
      cancelledRef.current = true;
    };
  }, [user, hydrate, markHydrated]);
}
