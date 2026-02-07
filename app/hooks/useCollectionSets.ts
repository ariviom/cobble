'use client';

import { useSupabaseUser } from '@/app/hooks/useSupabaseUser';
import { useUserLists } from '@/app/hooks/useUserLists';
import { getSupabaseBrowserClient } from '@/app/lib/supabaseClient';
import { useUserSetsStore } from '@/app/store/user-sets';
import { useEffect, useMemo, useState } from 'react';

export type CollectionSet = {
  setNumber: string;
  name: string;
  year: number;
  imageUrl: string | null;
  numParts: number;
  themeId: number | null;
  isOwned: boolean;
  listIds: string[];
};

export type ListFilter = 'all' | 'owned' | 'wishlist' | `list:${string}`;

type ListItemRow = {
  set_num: string;
  list_id: string;
};

type RbSetRow = {
  set_num: string;
  name: string;
  year: number;
  image_url: string | null;
  num_parts: number;
  theme_id: number | null;
};

function normalizeKey(setNumber: string): string {
  return setNumber.trim().toLowerCase();
}

/**
 * Pure merge function: unions owned sets and list items, deduplicates by
 * normalized set number, and attaches isOwned + listIds to each entry.
 *
 * @visibleForTesting
 */
export function mergeCollectionSets(
  ownedSets: Array<{
    setNumber: string;
    name: string;
    year: number;
    imageUrl: string | null;
    numParts: number;
    themeId: number | null;
  }>,
  listItemsBySet: Map<string, string[]>,
  listOnlyMeta: Map<string, RbSetRow>
): CollectionSet[] {
  const merged = new Map<string, CollectionSet>();

  // Add owned sets
  for (const s of ownedSets) {
    const key = normalizeKey(s.setNumber);
    merged.set(key, {
      setNumber: s.setNumber,
      name: s.name,
      year: s.year,
      imageUrl: s.imageUrl,
      numParts: s.numParts,
      themeId: s.themeId,
      isOwned: true,
      listIds: listItemsBySet.get(key) ?? [],
    });
  }

  // Add list-only sets (not already in owned)
  for (const [rawSetNum, listIds] of listItemsBySet) {
    const key = normalizeKey(rawSetNum);
    if (merged.has(key)) continue;

    const meta = listOnlyMeta.get(key);
    if (!meta) continue; // skip sets without metadata

    merged.set(key, {
      setNumber: rawSetNum,
      name: meta.name,
      year: meta.year,
      imageUrl: meta.image_url,
      numParts: meta.num_parts,
      themeId: meta.theme_id,
      isOwned: false,
      listIds: listIds,
    });
  }

  return Array.from(merged.values());
}

export type FilterOption = {
  key: ListFilter;
  label: string;
  count: number;
};

export type UseCollectionSetsResult = {
  allSets: CollectionSet[];
  filteredSets: CollectionSet[];
  totalCount: number;
  listFilter: ListFilter;
  setListFilter: (filter: ListFilter) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  filterOptions: FilterOption[];
  isLoading: boolean;
  error: string | null;
  isEmpty: boolean;
};

export function useCollectionSets(): UseCollectionSetsResult {
  const { user } = useSupabaseUser();
  const storeSets = useUserSetsStore(state => state.sets);
  const { allLists, wishlist, isLoading: listsLoading } = useUserLists();

  const [listItemsBySet, setListItemsBySet] = useState<Map<string, string[]>>(
    new Map()
  );
  const [listOnlyMeta, setListOnlyMeta] = useState<Map<string, RbSetRow>>(
    new Map()
  );
  const [isLoadingItems, setIsLoadingItems] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [listFilter, setListFilter] = useState<ListFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch user_list_items where item_type = 'set'.
  // Only re-fetches on login/logout — the merge useMemo handles owned-set
  // reactivity without re-querying Supabase.
  useEffect(() => {
    if (!user) {
      setListItemsBySet(new Map());
      setListOnlyMeta(new Map());
      setIsLoadingItems(false);
      setError(null);
      return;
    }

    let cancelled = false;
    const supabase = getSupabaseBrowserClient();

    async function fetchListItems() {
      setIsLoadingItems(true);
      setError(null);

      try {
        const { data, error: queryError } = await supabase
          .from('user_list_items')
          .select('set_num, list_id')
          .eq('user_id', user!.id)
          .eq('item_type', 'set')
          .not('set_num', 'is', null);

        if (cancelled) return;

        if (queryError) {
          setError(queryError.message);
          setIsLoadingItems(false);
          return;
        }

        const rows = (data ?? []) as ListItemRow[];
        const bySet = new Map<string, string[]>();
        const allListSetNums: string[] = [];
        for (const row of rows) {
          const key = normalizeKey(row.set_num);
          const existing = bySet.get(key);
          if (existing) {
            existing.push(row.list_id);
          } else {
            bySet.set(key, [row.list_id]);
            allListSetNums.push(key);
          }
        }

        if (cancelled) return;
        setListItemsBySet(bySet);

        // Fetch metadata for all list set numbers from rb_sets.
        // The merge step will skip entries that already have owned-store metadata,
        // but we fetch them all here since we don't read storeSets in this effect.
        if (allListSetNums.length > 0) {
          const CHUNK_SIZE = 200;
          const metaMap = new Map<string, RbSetRow>();

          for (let i = 0; i < allListSetNums.length; i += CHUNK_SIZE) {
            const chunk = allListSetNums.slice(i, i + CHUNK_SIZE);
            const { data: metaData, error: metaError } = await supabase
              .from('rb_sets')
              .select('set_num, name, year, image_url, num_parts, theme_id')
              .in('set_num', chunk);

            if (cancelled) return;
            if (metaError) continue;

            for (const row of (metaData ?? []) as RbSetRow[]) {
              metaMap.set(normalizeKey(row.set_num), row);
            }
          }

          if (!cancelled) {
            setListOnlyMeta(metaMap);
          }
        } else {
          setListOnlyMeta(new Map());
        }

        if (!cancelled) {
          setIsLoadingItems(false);
        }
      } catch {
        if (!cancelled) {
          setError('Failed to load collection data');
          setIsLoadingItems(false);
        }
      }
    }

    void fetchListItems();

    return () => {
      cancelled = true;
    };
  }, [user]);

  // Merge owned + list sets
  const allSets = useMemo(() => {
    const ownedEntries = Object.values(storeSets).map(s => ({
      setNumber: s.setNumber,
      name: s.name,
      year: s.year,
      imageUrl: s.imageUrl,
      numParts: s.numParts,
      themeId: s.themeId,
    }));
    return mergeCollectionSets(ownedEntries, listItemsBySet, listOnlyMeta);
  }, [storeSets, listItemsBySet, listOnlyMeta]);

  // Build filter options
  const filterOptions = useMemo<FilterOption[]>(() => {
    const options: FilterOption[] = [
      { key: 'all', label: 'All', count: allSets.length },
      {
        key: 'owned',
        label: 'Owned',
        count: allSets.filter(s => s.isOwned).length,
      },
    ];

    if (wishlist) {
      const wishlistCount = allSets.filter(s =>
        s.listIds.includes(wishlist.id)
      ).length;
      if (wishlistCount > 0) {
        options.push({
          key: 'wishlist',
          label: 'Wishlist',
          count: wishlistCount,
        });
      }
    }

    // Custom lists
    const customLists = allLists.filter(l => !l.isSystem);
    for (const list of customLists) {
      const count = allSets.filter(s => s.listIds.includes(list.id)).length;
      if (count > 0) {
        options.push({
          key: `list:${list.id}`,
          label: list.name,
          count,
        });
      }
    }

    return options;
  }, [allSets, wishlist, allLists]);

  // Apply filter + search
  const filteredSets = useMemo(() => {
    let result = allSets;

    // Apply list filter
    if (listFilter === 'owned') {
      result = result.filter(s => s.isOwned);
    } else if (listFilter === 'wishlist' && wishlist) {
      result = result.filter(s => s.listIds.includes(wishlist.id));
    } else if (listFilter.startsWith('list:')) {
      const listId = listFilter.slice(5);
      result = result.filter(s => s.listIds.includes(listId));
    }

    // Apply search
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(
        s =>
          s.name.toLowerCase().includes(q) ||
          s.setNumber.toLowerCase().includes(q)
      );
    }

    return result;
  }, [allSets, listFilter, searchQuery, wishlist]);

  const isLoading = listsLoading || isLoadingItems;

  return {
    allSets,
    filteredSets,
    totalCount: allSets.length,
    listFilter,
    setListFilter,
    searchQuery,
    setSearchQuery,
    filterOptions,
    isLoading,
    error,
    isEmpty: !isLoading && allSets.length === 0,
  };
}
