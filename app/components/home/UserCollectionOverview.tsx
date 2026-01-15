'use client';

import { MinifigCard } from '@/app/components/minifig/MinifigCard';
import { SetDisplayCard } from '@/app/components/set/SetDisplayCard';
import { Button } from '@/app/components/ui/Button';
import { CollectionGroupHeading } from '@/app/components/ui/CollectionGroupHeading';
import { Select } from '@/app/components/ui/Select';
import { cn } from '@/app/components/ui/utils';
import { useHydrateUserSets } from '@/app/hooks/useHydrateUserSets';
import { useSupabaseUser } from '@/app/hooks/useSupabaseUser';
import { useUserLists } from '@/app/hooks/useUserLists';
import { useUserMinifigs } from '@/app/hooks/useUserMinifigs';
import { getSupabaseBrowserClient } from '@/app/lib/supabaseClient';
import { useUserSetsStore } from '@/app/store/user-sets';
import type { Tables } from '@/supabase/types';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

type ThemeInfo = {
  id: number;
  name: string;
  parent_id: number | null;
};

type CustomListFilter = `list:${string}`;
type ListFilter = 'all' | 'owned' | 'wishlist' | CustomListFilter;
type GroupBy = 'status' | 'theme';

type UserSetsView = 'all' | 'owned' | 'wishlist';
type CollectionType = 'sets' | 'minifigs';

type ListMembership = {
  sets: string[];
  minifigs: string[];
};

type ThemeMap = Map<number, ThemeInfo>;

function createThemeMap(source?: ThemeInfo[] | null): ThemeMap {
  const map: ThemeMap = new Map();
  if (!Array.isArray(source)) {
    return map;
  }
  for (const theme of source) {
    if (
      theme &&
      typeof theme.id === 'number' &&
      Number.isFinite(theme.id) &&
      typeof theme.name === 'string'
    ) {
      map.set(theme.id, theme);
    }
  }
  return map;
}

function useThemesForUserSets(
  themeIds: number[],
  initialThemes?: ThemeInfo[]
): {
  themeMap: ThemeMap;
  isLoading: boolean;
} {
  const [themeMap, setThemeMap] = useState<ThemeMap>(() =>
    createThemeMap(initialThemes)
  );
  const [isLoading, setIsLoading] = useState(
    themeIds.length > 0 && (!initialThemes || initialThemes.length === 0)
  );

  const missingThemeCount = useMemo(() => {
    if (themeIds.length === 0) {
      return 0;
    }
    let missing = 0;
    for (const id of themeIds) {
      if (!themeMap.has(id)) {
        missing += 1;
      }
    }
    return missing;
  }, [themeIds, themeMap]);

  useEffect(() => {
    if (themeIds.length === 0 || missingThemeCount === 0) {
      setIsLoading(false);
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
        const map = createThemeMap(all);
        if (!cancelled) {
          setThemeMap(map);
        }
      } catch {
        // ignore fetch errors; keep existing map (likely hydrated via props)
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
  }, [themeIds, missingThemeCount]);

  return { themeMap, isLoading };
}

function makeCustomListFilter(id: string): CustomListFilter {
  return `list:${id}`;
}

function extractListId(value: ListFilter): string | null {
  if (value === 'all' || value === 'owned' || value === 'wishlist') return null;
  return value.replace('list:', '');
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

function getRootThemeName(themeId: number, themeMap: ThemeMap): string | null {
  const rootId = getRootThemeId(themeId, themeMap);
  const root = themeMap.get(rootId);
  return root?.name ?? null;
}

function getMinifigStatusLabel(
  status: Tables<'user_minifigs'>['status'] | null
): string {
  switch (status) {
    case 'owned':
      return 'Owned';
    case 'want':
      return 'Wishlist';
    default:
      return 'Minifigures';
  }
}

type UserCollectionOverviewProps = {
  initialThemes?: ThemeInfo[];
  initialView?: UserSetsView;
  initialType?: CollectionType;
};

export function UserCollectionOverview({
  initialThemes,
  initialView = 'all',
  initialType = 'sets',
}: UserCollectionOverviewProps) {
  const [mounted, setMounted] = useState(false);
  useHydrateUserSets();
  const { user } = useSupabaseUser();
  const setsRecord = useUserSetsStore(state => state.sets);
  const { lists, isLoading: listsLoading, error: listsError } = useUserLists();
  const {
    minifigs,
    isLoading: minifigsLoading,
    error: minifigsError,
  } = useUserMinifigs();
  const [listFilter, setListFilter] = useState<ListFilter>(() => {
    if (initialView === 'owned') return 'owned';
    if (initialView === 'wishlist') return 'wishlist';
    return 'all';
  });
  const [collectionType, setCollectionType] =
    useState<CollectionType>(initialType);
  const [groupBy, setGroupBy] = useState<GroupBy>('status');
  const [themeFilter, setThemeFilter] = useState<number | 'all'>('all');
  const [listMembership, setListMembership] = useState<
    Record<string, ListMembership>
  >({});
  const [listMembershipLoading, setListMembershipLoading] = useState<
    string | null
  >(null);
  const [listMembershipErrorId, setListMembershipErrorId] = useState<
    string | null
  >(null);
  const [listMembershipError, setListMembershipError] = useState<string | null>(
    null
  );
  const selectedListId = useMemo(() => extractListId(listFilter), [listFilter]);

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Sync the selected list from the ?list=<name> query param when present.
  useEffect(() => {
    const listName = searchParams?.get('list');
    if (!listName) return;

    const match = lists.find(list => list.name === listName);
    if (!match) return;

    const targetFilter = makeCustomListFilter(match.id);
    setListFilter(current =>
      current === targetFilter ? current : targetFilter
    );
  }, [lists, searchParams]);

  useEffect(() => {
    if (!user) {
      setListFilter(prev => {
        if (prev === 'all' || prev === 'owned' || prev === 'wishlist') {
          return prev;
        }
        return 'all';
      });
      setListMembership({});
      setListMembershipLoading(null);
      setListMembershipError(null);
      setListMembershipErrorId(null);
    }
  }, [user]);

  useEffect(() => {
    if (!user || !selectedListId) {
      return;
    }
    if (listMembership[selectedListId]) {
      return;
    }

    let cancelled = false;
    const supabase = getSupabaseBrowserClient();
    const run = async () => {
      setListMembershipLoading(selectedListId);
      setListMembershipError(null);
      setListMembershipErrorId(null);
      const { data, error } = await supabase
        .from('user_list_items')
        .select<'item_type,set_num,minifig_id'>('item_type,set_num,minifig_id')
        .eq('user_id', user.id)
        .eq('list_id', selectedListId);

      if (cancelled) {
        return;
      }

      if (error) {
        console.error('Failed to load list membership', error);
        setListMembershipError(error.message ?? 'Failed to load list');
        setListMembershipErrorId(selectedListId);
        setListMembershipLoading(current =>
          current === selectedListId ? null : current
        );
        return;
      }

      const rows = (data ?? []) as Array<
        Pick<Tables<'user_list_items'>, 'item_type' | 'set_num' | 'minifig_id'>
      >;
      const membership: ListMembership = { sets: [], minifigs: [] };
      for (const row of rows) {
        if (row.item_type === 'set' && row.set_num) {
          membership.sets.push(row.set_num);
        } else if (row.item_type === 'minifig' && row.minifig_id) {
          membership.minifigs.push(row.minifig_id);
        }
      }

      setListMembership(prev => ({
        ...prev,
        [selectedListId]: membership,
      }));
      if (listMembershipErrorId === selectedListId) {
        setListMembershipError(null);
        setListMembershipErrorId(null);
      }
      setListMembershipLoading(current =>
        current === selectedListId ? null : current
      );
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [user, selectedListId, listMembership, listMembershipErrorId]);

  const sets = useMemo(
    () =>
      Object.values(setsRecord).sort(
        (a, b) => b.lastUpdatedAt - a.lastUpdatedAt
      ),
    [setsRecord]
  );

  useEffect(() => {
    setMounted(true);
  }, []);

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

  const { themeMap, isLoading: themesLoading } = useThemesForUserSets(
    themeIds,
    initialThemes
  );

  const themeOptions = useMemo(() => {
    const names = new Map<number, string>();
    for (const set of sets) {
      if (typeof set.themeId === 'number' && Number.isFinite(set.themeId)) {
        const rootId = getRootThemeId(set.themeId, themeMap);
        const name = getRootThemeName(set.themeId, themeMap);
        if (name) {
          names.set(rootId, name);
        }
      }
    }
    return Array.from(names.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [sets, themeMap]);

  const filteredSets = useMemo(() => {
    const customListId = selectedListId;
    const membership = customListId ? listMembership[customListId]?.sets : null;
    return sets.filter(set => {
      const { status } = set;
      if (listFilter === 'owned' && !status.owned) return false;
      if (listFilter === 'wishlist' && !status.wantToBuild) return false;
      if (customListId) {
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
  }, [sets, listFilter, selectedListId, listMembership, themeFilter, themeMap]);

  const grouped = useMemo(() => {
    const groups = new Map<string, typeof filteredSets>();
    for (const set of filteredSets) {
      let key: string;
      if (groupBy === 'status') {
        key = getPrimaryStatusLabel(set.status);
      } else {
        const themeName =
          typeof set.themeId === 'number' && Number.isFinite(set.themeId)
            ? getRootThemeName(set.themeId, themeMap)
            : null;
        key = themeName ?? 'Unknown theme';
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

  const filteredMinifigs = useMemo(() => {
    const customListId = selectedListId;
    const membership = customListId
      ? listMembership[customListId]?.minifigs
      : null;
    return minifigs.filter(fig => {
      if (listFilter === 'owned' && fig.status !== 'owned') return false;
      if (listFilter === 'wishlist' && fig.status !== 'want') return false;
      if (customListId) {
        if (!membership || !membership.includes(fig.figNum)) {
          return false;
        }
      }
      return true;
    });
  }, [minifigs, listFilter, selectedListId, listMembership]);

  const groupedMinifigs = useMemo(() => {
    const groups = new Map<string, typeof filteredMinifigs>();
    for (const fig of filteredMinifigs) {
      const key = getMinifigStatusLabel(fig.status);
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(fig);
    }
    return Array.from(groups.entries())
      .map(([label, items]) => ({ label, items }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [filteredMinifigs]);

  const hasAnySets = sets.length > 0;
  const hasAnyMinifigs = minifigs.length > 0;
  const isCustomListLoading =
    !!selectedListId &&
    listMembershipLoading === selectedListId &&
    !listMembership[selectedListId];
  const hasAnyItems = collectionType === 'sets' ? hasAnySets : hasAnyMinifigs;
  const heading = collectionType === 'sets' ? 'Your sets' : 'Your minifigures';

  const handleCollectionTypeChange = (next: CollectionType) => {
    if (collectionType === next) {
      return;
    }
    setCollectionType(next);

    if (!pathname) {
      return;
    }

    const params = new URLSearchParams(
      searchParams ? searchParams.toString() : undefined
    );

    if (next === 'sets') {
      params.delete('type');
    } else {
      params.set('type', next);
    }

    const query = params.toString();
    const href = query ? `${pathname}?${query}` : pathname;
    router.replace(href, { scroll: false });
  };

  // Avoid SSR/CSR hydration mismatches: render a static shell until mounted.
  if (!mounted) {
    return (
      <section className="mb-8 px-4">
        <div className="mx-auto w-full max-w-7xl">
          <div className="my-4">
            <h2 className="text-lg font-semibold">Your collection</h2>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="mb-8 px-4">
      <div className="mx-auto w-full max-w-7xl">
        <div className="my-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <h2 className="text-lg font-semibold">{heading}</h2>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            {hasAnyItems && (
              <>
                <div className="flex items-center gap-2">
                  <label
                    htmlFor="list-filter"
                    className="flex items-center gap-2 text-xs"
                  >
                    <span>List</span>
                    {listsLoading && lists.length === 0 && (
                      <span className="text-[10px] text-foreground-muted">
                        Syncing…
                      </span>
                    )}
                  </label>
                  <Select
                    id="list-filter"
                    className="px-2 py-1 text-xs"
                    value={listFilter}
                    onChange={event => {
                      const next = event.target.value as ListFilter;
                      setListFilter(next);

                      if (!pathname) {
                        return;
                      }

                      const params = new URLSearchParams(
                        searchParams ? searchParams.toString() : undefined
                      );

                      if (next === 'all') {
                        // "All" is the default view – drop explicit params.
                        params.delete('view');
                        params.delete('list');
                      } else if (next === 'owned' || next === 'wishlist') {
                        params.set('view', next);
                        params.delete('list');
                      } else {
                        // A specific list selected.
                        const listId = extractListId(next);
                        if (listId) {
                          const match = lists.find(list => list.id === listId);
                          if (match) {
                            params.set('list', match.name);
                          } else {
                            params.delete('list');
                          }
                        } else {
                          params.delete('list');
                        }
                        params.delete('view');
                      }

                      const query = params.toString();
                      const href = query ? `${pathname}?${query}` : pathname;
                      router.replace(href, { scroll: false });
                    }}
                  >
                    <option value="all">All</option>
                    <option value="owned">Owned</option>
                    <option value="wishlist">Wishlist</option>
                    {lists.map(list => (
                      <option
                        key={list.id}
                        value={makeCustomListFilter(list.id)}
                      >
                        {list.name}
                      </option>
                    ))}
                  </Select>
                </div>
                {collectionType === 'sets' && hasAnySets && (
                  <>
                    <div className="flex items-center gap-2">
                      <label htmlFor="theme-filter" className="text-xs">
                        Theme
                      </label>
                      <Select
                        id="theme-filter"
                        className="px-2 py-1 text-xs"
                        value={
                          themeFilter === 'all' ? 'all' : String(themeFilter)
                        }
                        onChange={event => {
                          const v = event.target.value;
                          if (v === 'all') {
                            setThemeFilter('all');
                          } else {
                            const parsed = Number(v);
                            setThemeFilter(
                              Number.isFinite(parsed) ? parsed : 'all'
                            );
                          }
                        }}
                      >
                        <option value="all">All themes</option>
                        {themeOptions.map(opt => (
                          <option key={opt.id} value={opt.id}>
                            {opt.name}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-medium text-foreground-muted">
                        Group
                      </span>
                      <div className="inline-flex rounded-[var(--radius-md)] border-2 border-subtle bg-card">
                        <Button
                          type="button"
                          size="xs"
                          variant={groupBy === 'status' ? 'secondary' : 'ghost'}
                          className={cn(
                            'rounded-none border-0 shadow-none first:rounded-l-[var(--radius-md)] last:rounded-r-[var(--radius-md)] hover:translate-y-0 hover:shadow-none active:translate-y-0 active:shadow-none',
                            groupBy === 'status' && 'font-bold'
                          )}
                          onClick={() => setGroupBy('status')}
                        >
                          Collection
                        </Button>
                        <Button
                          type="button"
                          size="xs"
                          variant={groupBy === 'theme' ? 'secondary' : 'ghost'}
                          className={cn(
                            'rounded-none border-0 shadow-none first:rounded-l-[var(--radius-md)] last:rounded-r-[var(--radius-md)] hover:translate-y-0 hover:shadow-none active:translate-y-0 active:shadow-none',
                            groupBy === 'theme' && 'font-bold'
                          )}
                          onClick={() => setGroupBy('theme')}
                        >
                          Theme
                        </Button>
                      </div>
                    </div>
                  </>
                )}
              </>
            )}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-medium text-foreground-muted">
                Type
              </span>
              <div className="inline-flex rounded-[var(--radius-md)] border-2 border-subtle bg-card">
                <Button
                  type="button"
                  size="xs"
                  variant={collectionType === 'sets' ? 'secondary' : 'ghost'}
                  className={cn(
                    'rounded-none border-0 shadow-none first:rounded-l-[var(--radius-md)] last:rounded-r-[var(--radius-md)] hover:translate-y-0 hover:shadow-none active:translate-y-0 active:shadow-none',
                    collectionType === 'sets' && 'font-bold'
                  )}
                  onClick={() => handleCollectionTypeChange('sets')}
                >
                  Sets
                </Button>
                <Button
                  type="button"
                  size="xs"
                  variant={
                    collectionType === 'minifigs' ? 'secondary' : 'ghost'
                  }
                  className={cn(
                    'rounded-none border-0 shadow-none first:rounded-l-[var(--radius-md)] last:rounded-r-[var(--radius-md)] hover:translate-y-0 hover:shadow-none active:translate-y-0 active:shadow-none',
                    collectionType === 'minifigs' && 'font-bold'
                  )}
                  onClick={() => handleCollectionTypeChange('minifigs')}
                >
                  Minifigs
                </Button>
              </div>
            </div>
          </div>
        </div>

        {!hasAnyItems && (
          <div className="mt-2 text-sm text-foreground-muted">
            {collectionType === 'sets' ? (
              <>
                You have no tracked sets yet. Use the status menu on search
                results or set pages to mark sets as{' '}
                <span className="font-medium">Owned</span> or add them to your{' '}
                <span className="font-medium">Wishlist</span>.
              </>
            ) : (
              <>
                You have no tracked minifigures yet. Once you mark minifigs as{' '}
                <span className="font-medium">Owned</span> or add them to your{' '}
                <span className="font-medium">Wishlist</span>, they will appear
                here.
              </>
            )}
          </div>
        )}

        {listsError && (
          <div className="mt-2 text-xs text-brand-red">
            Failed to load lists. Try refreshing the page.
          </div>
        )}

        {collectionType === 'minifigs' && minifigsError && (
          <div className="mt-2 text-xs text-brand-red">{minifigsError}</div>
        )}

        {isCustomListLoading && (
          <div className="mt-2 text-xs text-foreground-muted">
            Loading list…
          </div>
        )}

        {selectedListId &&
          listMembershipError &&
          listMembershipErrorId === selectedListId && (
            <div className="mt-2 text-xs text-brand-red">
              {listMembershipError}
            </div>
          )}

        {collectionType === 'sets' &&
          hasAnySets &&
          filteredSets.length === 0 &&
          !isCustomListLoading && (
            <div className="mt-2 text-sm text-foreground-muted">
              No sets match the current filters.
            </div>
          )}

        {collectionType === 'minifigs' &&
          hasAnyMinifigs &&
          filteredMinifigs.length === 0 &&
          !isCustomListLoading && (
            <div className="mt-2 text-sm text-foreground-muted">
              No minifigures match the current filters.
            </div>
          )}

        {collectionType === 'sets' && hasAnySets && filteredSets.length > 0 && (
          <div className="mt-4 flex flex-col gap-6">
            {grouped.map(group => (
              <div key={group.label} className="flex flex-col gap-2">
                <CollectionGroupHeading>{group.label}</CollectionGroupHeading>
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

        {collectionType === 'minifigs' &&
          hasAnyMinifigs &&
          filteredMinifigs.length > 0 && (
            <div className="mt-4 flex flex-col gap-6">
              {groupedMinifigs.map(group => (
                <div key={group.label} className="flex flex-col gap-2">
                  <CollectionGroupHeading>{group.label}</CollectionGroupHeading>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                    {group.items.map(fig => (
                      <MinifigCard
                        key={fig.figNum}
                        figNum={fig.figNum}
                        name={fig.name}
                        imageUrl={fig.imageUrl}
                        blId={fig.blId ?? null}
                        numParts={fig.numParts}
                        quantity={fig.quantity}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

        {collectionType === 'sets' && themesLoading && hasAnySets && (
          <div className="mt-2 text-xs text-foreground-muted">
            Loading themes…
          </div>
        )}

        {collectionType === 'minifigs' && minifigsLoading && hasAnyMinifigs && (
          <div className="mt-2 text-xs text-foreground-muted">
            Loading minifigures…
          </div>
        )}
      </div>
    </section>
  );
}
