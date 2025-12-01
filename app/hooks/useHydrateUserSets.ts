'use client';

import { useEffect } from 'react';

import { useSupabaseUser } from '@/app/hooks/useSupabaseUser';
import { getSupabaseBrowserClient } from '@/app/lib/supabaseClient';
import {
  type HydratedSetInput,
  type SetStatus,
  type UserSet,
  useUserSetsStore,
} from '@/app/store/user-sets';
import type { UserSetWithMeta, UserSetsResponse } from '@/app/api/user-sets/route';

const hydratedState = {
  userId: null as string | null,
  inflightUserId: null as string | null,
  inflight: null as Promise<void> | null,
};

function localStatusToDb(
  status: SetStatus
): 'owned' | 'want' | null {
  if (status.owned) return 'owned';
  if (status.wantToBuild) return 'want';
  return null;
}

async function syncLocalSetsToSupabase(
  userId: string,
  supabase: ReturnType<typeof getSupabaseBrowserClient>
) {
  try {
    const localSets = useUserSetsStore.getState().sets;
    const entries = Object.values(localSets).filter(
      (entry): entry is UserSet =>
        !!entry &&
        (entry.status.owned || entry.status.wantToBuild)
    );

    if (entries.length === 0) {
      return;
    }

    const upserts = entries.map(entry => ({
      user_id: userId,
      set_num: entry.setNumber,
      status:
        localStatusToDb(entry.status) ??
        'want',
    }));

    if (upserts.length === 0) {
      return;
    }

    await supabase
      .from('user_sets')
      .upsert(upserts, { onConflict: 'user_id,set_num' });
  } catch (error) {
    console.error('syncLocalSetsToSupabase failed', error);
  }
}

function mapDbStatusToLocal(status: 'owned' | 'want'): SetStatus {
  if (status === 'owned') {
    return { owned: true, wantToBuild: false };
  }
  return { owned: false, wantToBuild: true };
}

export function useHydrateUserSets() {
  const { user } = useSupabaseUser();
  const hydrate = useUserSetsStore(state => state.hydrateFromSupabase);

  useEffect(() => {
    if (!user) {
      hydratedState.userId = null;
      hydratedState.inflightUserId = null;
      hydratedState.inflight = null;
      return;
    }
    if (hydratedState.userId === user.id) {
      return;
    }
    if (
      hydratedState.inflightUserId === user.id &&
      hydratedState.inflight
    ) {
      return;
    }

    const supabase = getSupabaseBrowserClient();
    let cancelled = false;

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
            return;
          }
          console.error(
            'useHydrateUserSets: API request failed',
            response.status
          );
          return;
        }

        const data = await response.json() as UserSetsResponse;
        
        if (cancelled) return;

        if (!data.sets || data.sets.length === 0) {
          // No remote sets - sync local sets to Supabase
          await syncLocalSetsToSupabase(user.id, supabase);
          hydratedState.userId = user.id;
          return;
        }

        const hydratedEntries: HydratedSetInput[] = data.sets.map((row: UserSetWithMeta) => {
          const updatedAt =
            row.updatedAt && !Number.isNaN(Date.parse(row.updatedAt))
              ? Date.parse(row.updatedAt)
              : undefined;

          const entry: HydratedSetInput = {
            setNumber: row.setNumber,
            status: mapDbStatusToLocal(row.status),
            name: row.name,
            year: row.year,
            imageUrl: row.imageUrl,
            numParts: row.numParts,
            themeId: row.themeId,
          };

          if (typeof updatedAt === 'number') {
            entry.updatedAt = updatedAt;
          }

          return entry;
        });

        hydrate(hydratedEntries);
        hydratedState.userId = user.id;
      } catch (err) {
        console.error('useHydrateUserSets failed', err);
      } finally {
        if (hydratedState.inflightUserId === user.id) {
          hydratedState.inflightUserId = null;
          hydratedState.inflight = null;
        }
      }
    };

    hydratedState.inflightUserId = user.id;
    const promise = run();
    hydratedState.inflight = promise;
    return () => {
      cancelled = true;
    };
  }, [user, hydrate]);
}
