'use client';

import { MinifigCard } from '@/app/components/minifig/MinifigCard';
import {
  getPiecesBucket,
  piecesBucketOrder,
} from '@/app/components/search/SearchControlBar';
import { SetDisplayCardWithControls } from '@/app/components/set/SetDisplayCardWithControls';
import { CollectionGroupHeading } from '@/app/components/ui/CollectionGroupHeading';
import { useHydrateUserSets } from '@/app/hooks/useHydrateUserSets';
import { useSupabaseUser } from '@/app/hooks/useSupabaseUser';
import { useUserLists } from '@/app/hooks/useUserLists';
import { useUserMinifigs } from '@/app/hooks/useUserMinifigs';
import { getSupabaseBrowserClient } from '@/app/lib/supabaseClient';
import { useUserSetsStore } from '@/app/store/user-sets';
import type { Tables } from '@/supabase/types';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CanBuildView } from '@/app/components/can-build/CanBuildView';
import {
  CollectionControlBar,
  type CollectionSortField,
  type CollectionType,
  type ListFilter,
  type MinifigSortField,
  type SortDir,
} from './CollectionControlBar';

type ThemeInfo = {
  id: number;
  name: string;
  parent_id: number | null;
};

type CustomListFilter = `list:${string}`;

type UserSetsView = 'all' | 'owned' | 'wishlist';

type ListMembership = {
  sets: string[];
  minifigs: string[];
};

// Set metadata fetched from rb_sets for items not in the user's store
type ListSetInfo = {
  setNumber: string;
  name: string;
  year: number | null;
  imageUrl: string | null;
  numParts: number | null;
  themeId: number | null;
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

function getPrimaryStatusLabel(status: { owned: boolean }): string {
  if (status.owned) return 'Owned';
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
  const {
    lists,
    wishlist,
    isLoading: listsLoading,
    error: listsError,
  } = useUserLists();
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

  // Sort-driven grouping — the sort field determines the group headings
  const [sortField, setSortField] = useState<CollectionSortField>('collection');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [minifigSortField, setMinifigSortField] =
    useState<MinifigSortField>('collection');
  const [minifigSortDir, setMinifigSortDir] = useState<SortDir>('asc');

  const [themeFilter, setThemeFilter] = useState<number | 'all'>('all');
  const [categoryFilter, setCategoryFilter] = useState<number | 'all'>('all');
  const [listMembership, setListMembership] = useState<
    Record<string, ListMembership>
  >({});
  const [listSetsInfo, setListSetsInfo] = useState<
    Record<string, ListSetInfo[]>
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
  const selectedListId = useMemo(() => {
    if (listFilter === 'wishlist') {
      return wishlist?.id ?? null;
    }
    return extractListId(listFilter);
  }, [listFilter, wishlist]);

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const prevSearchParamsRef = useRef<URLSearchParams | null>(null);
  useEffect(() => {
    const currentParams = searchParams?.toString() ?? '';
    const prevParams = prevSearchParamsRef.current?.toString() ?? '';

    if (currentParams === prevParams) return;
    prevSearchParamsRef.current = searchParams;

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

  // Fetch list membership
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

  // Fetch set metadata for list items not in the store
  useEffect(() => {
    if (!selectedListId) return;
    const membership = listMembership[selectedListId];
    if (!membership) return;
    if (listSetsInfo[selectedListId]) return;

    const setsNotInStore = membership.sets.filter(
      setNum => !setsRecord[setNum.toLowerCase()]
    );
    if (setsNotInStore.length === 0) {
      setListSetsInfo(prev => ({ ...prev, [selectedListId]: [] }));
      return;
    }

    let cancelled = false;
    const supabase = getSupabaseBrowserClient();
    const run = async () => {
      const { data: setsData } = await supabase
        .from('rb_sets')
        .select('set_num,name,year,image_url,num_parts,theme_id')
        .in('set_num', setsNotInStore);

      if (!cancelled && setsData) {
        const fetchedSets: ListSetInfo[] = setsData.map(s => ({
          setNumber: s.set_num,
          name: s.name,
          year: s.year,
          imageUrl: s.image_url,
          numParts: s.num_parts,
          themeId: s.theme_id,
        }));
        setListSetsInfo(prev => ({
          ...prev,
          [selectedListId]: fetchedSets,
        }));
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [selectedListId, listMembership, listSetsInfo, setsRecord]);

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

  const categoryOptions = useMemo(() => {
    const names = new Map<number, string>();
    for (const fig of minifigs) {
      if (
        typeof fig.categoryId === 'number' &&
        Number.isFinite(fig.categoryId) &&
        fig.categoryName
      ) {
        names.set(fig.categoryId, fig.categoryName);
      }
    }
    return Array.from(names.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [minifigs]);

  const filteredSets = useMemo(() => {
    const membership = selectedListId
      ? listMembership[selectedListId]?.sets
      : null;

    const storeSets = sets.filter(set => {
      const { status } = set;
      if (listFilter === 'owned' && !status.owned) return false;
      if (listFilter === 'wishlist' && !selectedListId) return false;
      if (selectedListId) {
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

    if (selectedListId && listSetsInfo[selectedListId]) {
      const storeSetNums = new Set(
        storeSets.map(s => s.setNumber.toLowerCase())
      );
      const additionalSets = listSetsInfo[selectedListId]
        .filter(s => !storeSetNums.has(s.setNumber.toLowerCase()))
        .filter(s => {
          if (themeFilter !== 'all') {
            if (typeof s.themeId !== 'number' || !Number.isFinite(s.themeId)) {
              return false;
            }
            const rootId = getRootThemeId(s.themeId, themeMap);
            if (rootId !== themeFilter) return false;
          }
          return true;
        })
        .map(s => ({
          setNumber: s.setNumber,
          name: s.name,
          year: s.year ?? 0,
          imageUrl: s.imageUrl,
          numParts: s.numParts ?? 0,
          themeId: s.themeId,
          status: { owned: false },
          lastUpdatedAt: 0,
        }));
      return [...storeSets, ...additionalSets];
    }

    return storeSets;
  }, [
    sets,
    listFilter,
    selectedListId,
    listMembership,
    listSetsInfo,
    themeFilter,
    themeMap,
  ]);

  // Determine the label to use when viewing a specific list
  const activeListName = useMemo(() => {
    if (listFilter === 'wishlist') return 'Wishlist';
    if (listFilter === 'owned') return 'Owned';
    const customListId = extractListId(listFilter);
    if (customListId) {
      const match = lists.find(l => l.id === customListId);
      return match?.name ?? null;
    }
    return null;
  }, [listFilter, lists]);

  // Sort-driven grouping for sets
  const grouped = useMemo(() => {
    const groups = new Map<string, typeof filteredSets>();
    for (const set of filteredSets) {
      let key: string;
      if (sortField === 'collection') {
        if (activeListName) {
          key = activeListName;
        } else {
          key = getPrimaryStatusLabel(set.status);
        }
      } else if (sortField === 'year') {
        key = set.year && set.year > 0 ? String(set.year) : 'Unknown Year';
      } else if (sortField === 'pieces') {
        key = getPiecesBucket(set.numParts);
      } else {
        // theme
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
    const entries = Array.from(groups.entries()).map(([label, items]) => ({
      label,
      items,
    }));

    if (sortField === 'year') {
      return entries.sort((a, b) => {
        const aIsUnknown = a.label === 'Unknown Year';
        const bIsUnknown = b.label === 'Unknown Year';
        if (aIsUnknown && bIsUnknown) return 0;
        if (aIsUnknown) return 1;
        if (bIsUnknown) return -1;
        const diff = Number(a.label) - Number(b.label);
        return sortDir === 'desc' ? -diff : diff;
      });
    }

    if (sortField === 'pieces') {
      for (const group of entries) {
        group.items.sort((a, b) =>
          sortDir === 'desc' ? b.numParts - a.numParts : a.numParts - b.numParts
        );
      }
      return entries.sort((a, b) => {
        const diff = piecesBucketOrder(a.label) - piecesBucketOrder(b.label);
        return sortDir === 'desc' ? -diff : diff;
      });
    }

    // collection / theme — alphabetical
    return entries.sort((a, b) => {
      const cmp = a.label.localeCompare(b.label);
      return sortDir === 'desc' ? -cmp : cmp;
    });
  }, [filteredSets, sortField, sortDir, themeMap, activeListName]);

  const filteredMinifigs = useMemo(() => {
    const customListId = selectedListId;
    const membership = customListId
      ? listMembership[customListId]?.minifigs
      : null;
    return minifigs.filter(fig => {
      if (listFilter === 'owned' && fig.status !== 'owned') return false;
      if (listFilter === 'wishlist' && !selectedListId) return false;
      if (customListId) {
        if (!membership || !membership.includes(fig.figNum)) {
          return false;
        }
      }
      if (categoryFilter !== 'all') {
        if (
          typeof fig.categoryId !== 'number' ||
          !Number.isFinite(fig.categoryId)
        ) {
          return false;
        }
        if (fig.categoryId !== categoryFilter) return false;
      }
      return true;
    });
  }, [minifigs, listFilter, selectedListId, listMembership, categoryFilter]);

  // Sort-driven grouping for minifigs
  const groupedMinifigs = useMemo(() => {
    const groups = new Map<string, typeof filteredMinifigs>();
    for (const fig of filteredMinifigs) {
      let key: string;
      if (minifigSortField === 'collection') {
        key = getMinifigStatusLabel(fig.status);
      } else {
        key = fig.categoryName ?? 'Unknown category';
      }
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(fig);
    }
    const entries = Array.from(groups.entries()).map(([label, items]) => ({
      label,
      items,
    }));

    return entries.sort((a, b) => {
      const cmp = a.label.localeCompare(b.label);
      return minifigSortDir === 'desc' ? -cmp : cmp;
    });
  }, [filteredMinifigs, minifigSortField, minifigSortDir]);

  const hasAnySets = sets.length > 0;
  const hasAnyMinifigs = minifigs.length > 0;
  const isCustomListLoading =
    !!selectedListId &&
    listMembershipLoading === selectedListId &&
    !listMembership[selectedListId];
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

  const handleListFilterChange = (next: ListFilter) => {
    setListFilter(next);

    if (!pathname) {
      return;
    }

    const params = new URLSearchParams(
      searchParams ? searchParams.toString() : undefined
    );

    if (next === 'all') {
      params.delete('view');
      params.delete('list');
    } else if (next === 'owned' || next === 'wishlist') {
      params.set('view', next);
      params.delete('list');
    } else {
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
  };

  // Avoid SSR/CSR hydration mismatches
  if (!mounted) {
    return <section className="mb-8" />;
  }

  return (
    <section className="mb-8">
      <CollectionControlBar
        collectionType={collectionType}
        onCollectionTypeChange={handleCollectionTypeChange}
        listFilter={listFilter}
        onListFilterChange={handleListFilterChange}
        lists={lists}
        listsLoading={listsLoading}
        hasAnySets={hasAnySets}
        themeFilter={themeFilter}
        onThemeFilterChange={setThemeFilter}
        themeOptions={themeOptions}
        sortField={sortField}
        onSortFieldChange={setSortField}
        sortDir={sortDir}
        onSortDirChange={setSortDir}
        hasAnyMinifigs={hasAnyMinifigs}
        categoryFilter={categoryFilter}
        onCategoryFilterChange={setCategoryFilter}
        categoryOptions={categoryOptions}
        minifigSortField={minifigSortField}
        onMinifigSortFieldChange={setMinifigSortField}
        minifigSortDir={minifigSortDir}
        onMinifigSortDirChange={setMinifigSortDir}
      />

      {collectionType === 'can-build' && <CanBuildView />}

      <div className="mx-auto w-full max-w-7xl px-4">
        {!hasAnySets && collectionType === 'sets' && (
          <div className="mt-2 text-sm text-foreground-muted">
            You have no tracked sets yet. Use the status menu on search results
            or set pages to mark sets as{' '}
            <span className="font-medium">Owned</span> or add them to your{' '}
            <span className="font-medium">Wishlist</span>.
          </div>
        )}

        {!hasAnyMinifigs && collectionType === 'minifigs' && (
          <div className="mt-2 text-sm text-foreground-muted">
            You have no tracked minifigures yet. Once you mark minifigs as{' '}
            <span className="font-medium">Owned</span> or add them to your{' '}
            <span className="font-medium">Wishlist</span>, they will appear
            here.
          </div>
        )}

        {listsError && (
          <div className="mt-2 text-xs text-danger">
            Failed to load lists. Try refreshing the page.
          </div>
        )}

        {collectionType === 'minifigs' && minifigsError && (
          <div className="mt-2 text-xs text-danger">{minifigsError}</div>
        )}

        {isCustomListLoading && (
          <div className="mt-2 text-xs text-foreground-muted">
            Loading list…
          </div>
        )}

        {selectedListId &&
          listMembershipError &&
          listMembershipErrorId === selectedListId && (
            <div className="mt-2 text-xs text-danger">
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
                  className="grid grid-cols-1 gap-x-2 gap-y-4 xs:grid-cols-2 md:grid-cols-3 lg:grid-cols-4"
                >
                  {group.items.map(set => (
                    <SetDisplayCardWithControls
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
                  <div className="grid grid-cols-1 gap-x-2 gap-y-4 xs:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                    {group.items.map(fig => (
                      <MinifigCard
                        key={fig.figNum}
                        figNum={fig.figNum}
                        name={fig.name}
                        imageUrl={fig.imageUrl}
                        blId={fig.blId ?? null}
                        numParts={fig.numParts}
                        quantity={fig.quantity}
                        year={fig.year}
                        themeName={fig.categoryName}
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
