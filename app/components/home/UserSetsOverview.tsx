'use client';

import { SetDisplayCard } from '@/app/components/set/SetDisplayCard';
import { cn } from '@/app/components/ui/utils';
import { useSupabaseUser } from '@/app/hooks/useSupabaseUser';
import { useUserCollections } from '@/app/hooks/useUserCollections';
import { getSupabaseBrowserClient } from '@/app/lib/supabaseClient';
import { useUserSetsStore } from '@/app/store/user-sets';
import { useEffect, useMemo, useState } from 'react';

type ThemeInfo = {
  id: number;
  name: string;
  parent_id: number | null;
};

type CustomCollectionFilter = `collection:${string}`;
type CollectionFilter = 'all' | 'owned' | 'wishlist' | CustomCollectionFilter;
type GroupBy = 'status' | 'theme';

type ThemeMap = Map<number, ThemeInfo>;

function useThemesForUserSets(themeIds: number[]): {
  themeMap: ThemeMap;
  isLoading: boolean;
} {
  const [themeMap, setThemeMap] = useState<ThemeMap>(new Map());
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (themeIds.length === 0) {
      setThemeMap(new Map());
      return;
    }
    let cancelled = false;
    async function load() {
      setIsLoading(true);
      try {
        const res = await fetch('/api/themes');
        if (!res.ok) throw new Error('themes_failed');
        const data = (await res.json()) as { themes?: ThemeInfo[] };
        const all = Array.isArray(data.themes) ? data.themes : [];
        const map: ThemeMap = new Map();
        for (const t of all) {
          if (
            typeof t.id === 'number' &&
            Number.isFinite(t.id) &&
            typeof t.name === 'string'
          ) {
            map.set(t.id, t);
          }
        }
        if (!cancelled) {
          setThemeMap(map);
        }
      } catch {
        if (!cancelled) {
          setThemeMap(new Map());
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [themeIds]);

  return { themeMap, isLoading };
}

function makeCustomCollectionFilter(id: string): CustomCollectionFilter {
  return `collection:${id}`;
}

function extractCollectionId(value: CollectionFilter): string | null {
  if (value === 'all' || value === 'owned' || value === 'wishlist') return null;
  return value.replace('collection:', '');
}

function getPrimaryStatusLabel(status: {
  owned: boolean;
  wantToBuild: boolean;
}): string {
  if (status.owned) return 'Owned';
  if (status.wantToBuild) return 'Wishlist';
  return 'Uncategorized';
}

function getRootThemeId(themeId: number, themeMap: ThemeMap): number {
  let current = themeMap.get(themeId);
  if (!current) return themeId;
  while (current.parent_id != null) {
    const parent = themeMap.get(current.parent_id);
    if (!parent) break;
    current = parent;
  }
  return current.id;
}

function getRootThemeName(themeId: number, themeMap: ThemeMap): string {
  const rootId = getRootThemeId(themeId, themeMap);
  const root = themeMap.get(rootId);
  return root?.name ?? 'Unknown theme';
}

export function UserSetsOverview() {
  const [mounted, setMounted] = useState(false);
  const { user } = useSupabaseUser();
  const setsRecord = useUserSetsStore(state => state.sets);
  const {
    collections,
    isLoading: collectionsLoading,
    error: collectionsError,
  } = useUserCollections();
  const [collectionFilter, setCollectionFilter] =
    useState<CollectionFilter>('all');
  const [groupBy, setGroupBy] = useState<GroupBy>('status');
  const [themeFilter, setThemeFilter] = useState<number | 'all'>('all');
  const [collectionMembership, setCollectionMembership] = useState<
    Record<string, string[]>
  >({});
  const [collectionMembershipLoading, setCollectionMembershipLoading] =
    useState<string | null>(null);
  const [collectionMembershipErrorId, setCollectionMembershipErrorId] =
    useState<string | null>(null);
  const [collectionMembershipError, setCollectionMembershipError] = useState<
    string | null
  >(null);
  const selectedCollectionId = useMemo(
    () => extractCollectionId(collectionFilter),
    [collectionFilter]
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!user) {
      setCollectionFilter(prev => {
        if (prev === 'all' || prev === 'owned' || prev === 'wishlist') {
          return prev;
        }
        return 'all';
      });
      setCollectionMembership({});
      setCollectionMembershipLoading(null);
      setCollectionMembershipError(null);
      setCollectionMembershipErrorId(null);
    }
  }, [user]);

  useEffect(() => {
    if (!user || !selectedCollectionId) {
      return;
    }
    if (collectionMembership[selectedCollectionId]) {
      return;
    }

    let cancelled = false;
    const supabase = getSupabaseBrowserClient();
    const run = async () => {
      setCollectionMembershipLoading(selectedCollectionId);
      setCollectionMembershipError(null);
      setCollectionMembershipErrorId(null);
      const { data, error } = await supabase
        .from('user_collection_sets')
        .select<'set_num'>('set_num')
        .eq('user_id', user.id)
        .eq('collection_id', selectedCollectionId);

      if (cancelled) {
        return;
      }

      if (error) {
        console.error('Failed to load collection membership', error);
        setCollectionMembershipError(
          error.message ?? 'Failed to load collection'
        );
        setCollectionMembershipErrorId(selectedCollectionId);
        setCollectionMembershipLoading(current =>
          current === selectedCollectionId ? null : current
        );
        return;
      }

      setCollectionMembership(prev => ({
        ...prev,
        [selectedCollectionId]: (data ?? []).map(row => row.set_num),
      }));
      if (collectionMembershipErrorId === selectedCollectionId) {
        setCollectionMembershipError(null);
        setCollectionMembershipErrorId(null);
      }
      setCollectionMembershipLoading(current =>
        current === selectedCollectionId ? null : current
      );
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [
    user,
    selectedCollectionId,
    collectionMembership,
    collectionMembershipErrorId,
  ]);

  const sets = useMemo(
    () =>
      Object.values(setsRecord).sort(
        (a, b) => b.lastUpdatedAt - a.lastUpdatedAt
      ),
    [setsRecord]
  );

  const themeIds = useMemo(
    () =>
      Array.from(
        new Set(
          sets
            .map(s => s.themeId)
            .filter(
              (id): id is number =>
                typeof id === 'number' && Number.isFinite(id)
            )
        )
      ),
    [sets]
  );

  const { themeMap, isLoading: themesLoading } = useThemesForUserSets(themeIds);

  const themeOptions = useMemo(() => {
    const names = new Map<number, string>();
    for (const set of sets) {
      if (typeof set.themeId === 'number' && Number.isFinite(set.themeId)) {
        const rootId = getRootThemeId(set.themeId, themeMap);
        const name = getRootThemeName(set.themeId, themeMap);
        names.set(rootId, name);
      }
    }
    return Array.from(names.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [sets, themeMap]);

  const filteredSets = useMemo(() => {
    const customCollectionId = selectedCollectionId;
    const membership = customCollectionId
      ? collectionMembership[customCollectionId]
      : null;
    return sets.filter(set => {
      const { status } = set;
      if (collectionFilter === 'owned' && !status.owned) return false;
      if (collectionFilter === 'wishlist' && !status.wantToBuild) return false;
      if (customCollectionId) {
        if (!membership || !membership.includes(set.setNumber)) {
          return false;
        }
      }

      if (themeFilter !== 'all') {
        if (typeof set.themeId !== 'number' || !Number.isFinite(set.themeId)) {
          return false;
        }
        const rootId = getRootThemeId(set.themeId, themeMap);
        if (rootId !== themeFilter) return false;
      }
      return true;
    });
  }, [
    sets,
    collectionFilter,
    selectedCollectionId,
    collectionMembership,
    themeFilter,
    themeMap,
  ]);

  const grouped = useMemo(() => {
    const groups = new Map<string, typeof filteredSets>();
    for (const set of filteredSets) {
      let key: string;
      if (groupBy === 'status') {
        key = getPrimaryStatusLabel(set.status);
      } else {
        if (typeof set.themeId === 'number' && Number.isFinite(set.themeId)) {
          key = getRootThemeName(set.themeId, themeMap);
        } else {
          key = 'Unknown theme';
        }
      }
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(set);
    }
    return Array.from(groups.entries())
      .map(([label, items]) => ({ label, items }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [filteredSets, groupBy, themeMap]);

  const hasAnySets = sets.length > 0;
  const isCustomCollectionLoading =
    !!selectedCollectionId &&
    collectionMembershipLoading === selectedCollectionId &&
    !collectionMembership[selectedCollectionId];

  // Avoid SSR/CSR hydration mismatches: render a static shell until mounted.
  if (!mounted) {
    return (
      <section className="mb-8">
        <div className="mx-auto w-full max-w-7xl">
          <div className="my-4">
            <h2 className="text-lg font-semibold">Your sets</h2>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="mb-8">
      <div className="mx-auto w-full max-w-7xl">
        <div className="my-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <h2 className="text-lg font-semibold">Your sets</h2>
          {hasAnySets && (
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <div className="flex items-center gap-2">
                <label htmlFor="collection-filter" className="text-xs">
                  Collection
                </label>
                <select
                  id="collection-filter"
                  className="rounded border border-neutral-300 bg-background px-2 py-1 text-xs"
                  value={collectionFilter}
                  onChange={event =>
                    setCollectionFilter(event.target.value as CollectionFilter)
                  }
                >
                  <option value="all">All</option>
                  <option value="owned">Owned</option>
                  <option value="wishlist">Wishlist</option>
                  {collections.map(collection => (
                    <option
                      key={collection.id}
                      value={makeCustomCollectionFilter(collection.id)}
                    >
                      {collection.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <label htmlFor="theme-filter" className="text-xs">
                  Theme
                </label>
                <select
                  id="theme-filter"
                  className="rounded border border-neutral-300 bg-background px-2 py-1 text-xs"
                  value={themeFilter === 'all' ? 'all' : String(themeFilter)}
                  onChange={event => {
                    const v = event.target.value;
                    if (v === 'all') {
                      setThemeFilter('all');
                    } else {
                      const parsed = Number(v);
                      setThemeFilter(Number.isFinite(parsed) ? parsed : 'all');
                    }
                  }}
                >
                  <option value="all">All themes</option>
                  {themeOptions.map(opt => (
                    <option key={opt.id} value={opt.id}>
                      {opt.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs">Group by</span>
                <div className="inline-flex rounded border border-neutral-300 bg-background text-xs">
                  <button
                    type="button"
                    className={cn(
                      'px-2 py-1',
                      groupBy === 'status' && 'bg-neutral-200 font-medium'
                    )}
                    onClick={() => setGroupBy('status')}
                  >
                    Collection
                  </button>
                  <button
                    type="button"
                    className={cn(
                      'px-2 py-1',
                      groupBy === 'theme' && 'bg-neutral-200 font-medium'
                    )}
                    onClick={() => setGroupBy('theme')}
                  >
                    Theme
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {!hasAnySets && (
          <div className="mt-2 text-sm text-foreground-muted">
            You have no tracked sets yet. Use the status menu on search results
            or set pages to mark sets as{' '}
            <span className="font-medium">Owned</span> or add them to your{' '}
            <span className="font-medium">Wishlist</span>.
          </div>
        )}

        {collectionsLoading && (
          <div className="mt-2 text-xs text-foreground-muted">
            Loading collections…
          </div>
        )}

        {collectionsError && (
          <div className="mt-2 text-xs text-brand-red">
            Failed to load collections. Try refreshing the page.
          </div>
        )}

        {isCustomCollectionLoading && (
          <div className="mt-2 text-xs text-foreground-muted">
            Loading collection…
          </div>
        )}

        {selectedCollectionId &&
          collectionMembershipError &&
          collectionMembershipErrorId === selectedCollectionId && (
            <div className="mt-2 text-xs text-brand-red">
              {collectionMembershipError}
            </div>
          )}

        {hasAnySets &&
          filteredSets.length === 0 &&
          !isCustomCollectionLoading && (
            <div className="mt-2 text-sm text-foreground-muted">
              No sets match the current filters.
            </div>
          )}

        {hasAnySets && filteredSets.length > 0 && (
          <div className="mt-4 flex flex-col gap-6">
            {grouped.map(group => (
              <div key={group.label} className="flex flex-col gap-2">
                <div className="px-1 py-1 text-xs font-semibold tracking-wide text-foreground-muted uppercase">
                  {group.label}
                </div>
                <div
                  data-item-size="md"
                  className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4"
                >
                  {group.items.map(set => (
                    <SetDisplayCard
                      key={set.setNumber}
                      setNumber={set.setNumber}
                      name={set.name}
                      year={set.year}
                      imageUrl={set.imageUrl}
                      numParts={set.numParts}
                      themeId={set.themeId}
                      themeLabel={
                        typeof set.themeId === 'number' &&
                        Number.isFinite(set.themeId)
                          ? getRootThemeName(set.themeId, themeMap)
                          : null
                      }
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {themesLoading && hasAnySets && (
          <div className="mt-2 text-xs text-foreground-muted">
            Loading themes…
          </div>
        )}
      </div>
    </section>
  );
}
