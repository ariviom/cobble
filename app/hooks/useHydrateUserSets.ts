'use client';

import { useEffect } from 'react';

import { useSupabaseUser } from '@/app/hooks/useSupabaseUser';
import { getSupabaseBrowserClient } from '@/app/lib/supabaseClient';
import { resolveSetImageUrl } from '@/app/lib/setImage';
import {
  type HydratedSetInput,
  type SetStatus,
  type UserSet,
  useUserSetsStore,
} from '@/app/store/user-sets';

const hydratedState = {
	userId: null as string | null,
	inflightUserId: null as string | null,
	inflight: null as Promise<void> | null,
};

type DbUserSetRow = {
  set_num: string;
  status: 'owned' | 'want';
  updated_at: string | null;
};

type DbSetMetaRow = {
  set_num: string;
  name: string;
  year: number | null;
  num_parts: number | null;
  image_url: string | null;
  theme_id: number | null;
};

function localStatusToDb(
  status: SetStatus
): DbUserSetRow['status'] | null {
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

function mapDbStatusToLocal(status: DbUserSetRow['status']): SetStatus {
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
        const { data: userSets, error } = await supabase
          .from('user_sets')
          .select<'set_num,status,updated_at'>('set_num,status,updated_at')
          .eq('user_id', user.id);

				if (error) {
          console.error('useHydrateUserSets: user_sets query failed', error);
          return;
        }

        if (!userSets || userSets.length === 0) {
          await syncLocalSetsToSupabase(user.id, supabase);
					hydratedState.userId = user.id;
          return;
        }

        const setNums = Array.from(
          new Set(userSets.map(row => row.set_num).filter(Boolean))
        );
        let metaBySet = new Map<string, DbSetMetaRow>();

        if (setNums.length > 0) {
          const { data: metaRows, error: metaError } = await supabase
            .from('rb_sets')
            .select<'set_num,name,year,num_parts,image_url,theme_id'>(
              'set_num,name,year,num_parts,image_url,theme_id'
            )
            .in('set_num', setNums);

          if (!cancelled && !metaError && Array.isArray(metaRows)) {
            metaBySet = new Map(
              metaRows.map(row => [row.set_num, row as DbSetMetaRow])
            );
          } else if (metaError) {
            console.error('useHydrateUserSets: rb_sets query failed', metaError);
          }
        }

        const hydratedEntries = userSets.map(row => {
          const meta = metaBySet.get(row.set_num);
          const updatedAt =
            row.updated_at && !Number.isNaN(Date.parse(row.updated_at))
              ? Date.parse(row.updated_at)
              : undefined;

          const entry: HydratedSetInput = {
            setNumber: row.set_num,
            status: mapDbStatusToLocal(row.status),
          };

          if (meta?.name) {
            entry.name = meta.name;
          }
          if (typeof meta?.year === 'number') {
            entry.year = meta.year;
          }
          entry.imageUrl = resolveSetImageUrl(
            meta?.image_url ?? null,
            row.set_num
          );
          if (typeof meta?.num_parts === 'number') {
            entry.numParts = meta.num_parts;
          }
          if (meta && 'theme_id' in meta) {
            entry.themeId =
              typeof meta.theme_id === 'number' ? meta.theme_id : null;
          }
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

