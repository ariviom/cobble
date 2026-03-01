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

// --- localStorage cache for collection items ---

const COLLECTION_CACHE_KEY = 'brick_party_collection_items_v1';

type CollectionCacheEntry = {
  bySet: [string, string[]][];
  meta: [string, RbSetRow][];
  updatedAt: number;
};

type CollectionCacheRoot = Record<string, CollectionCacheEntry>;

let collectionCacheRoot: CollectionCacheRoot | null = null;

function readCollectionCache(): CollectionCacheRoot {
  if (collectionCacheRoot) return collectionCacheRoot;
  if (typeof window === 'undefined') {
    collectionCacheRoot = {};
    return collectionCacheRoot;
  }
  try {
    const raw = window.localStorage.getItem(COLLECTION_CACHE_KEY);
    collectionCacheRoot = raw ? (JSON.parse(raw) as CollectionCacheRoot) : {};
  } catch {
    collectionCacheRoot = {};
  }
  return collectionCacheRoot!;
}

function writeCollectionCache(root: CollectionCacheRoot): void {
  collectionCacheRoot = root;
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(COLLECTION_CACHE_KEY, JSON.stringify(root));
  } catch {
    // ignore storage failures
  }
}

function getCachedCollection(
  userId: string
): { bySet: Map<string, string[]>; meta: Map<string, RbSetRow> } | null {
  const root = readCollectionCache();
  const entry = root[userId];
  if (!entry) return null;
  return {
    bySet: new Map(entry.bySet),
    meta: new Map(entry.meta),
  };
}

function setCachedCollection(
  userId: string,
  bySet: Map<string, string[]>,
  meta: Map<string, RbSetRow>
): void {
  const root = readCollectionCache();
  root[userId] = {
    bySet: Array.from(bySet.entries()),
    meta: Array.from(meta.entries()),
    updatedAt: Date.now(),
  };
  writeCollectionCache(root);
}

/**
 * Update the collection localStorage cache when a list membership changes.
 * Called from useSetLists on toggle so the next tab/page load reflects changes.
 */
export function updateCollectionCacheForToggle(
  userId: string,
  setNum: string,
  listId: string,
  added: boolean
): void {
  const root = readCollectionCache();
  const entry = root[userId];
  if (!entry) return; // no cache to update

  const bySet = new Map(entry.bySet);
  const key = normalizeKey(setNum);
  const existing = bySet.get(key) ?? [];

  if (added) {
    if (!existing.includes(listId)) {
      bySet.set(key, [...existing, listId]);
    }
  } else {
    const filtered = existing.filter(id => id !== listId);
    if (filtered.length > 0) {
      bySet.set(key, filtered);
    } else {
      bySet.delete(key);
    }
  }

  root[userId] = {
    ...entry,
    bySet: Array.from(bySet.entries()),
    updatedAt: Date.now(),
  };
  writeCollectionCache(root);
}

function mapsEqual(
  a: Map<string, string[]>,
  b: Map<string, string[]>
): boolean {
  if (a.size !== b.size) return false;
  for (const [key, val] of a) {
    const other = b.get(key);
    if (!other || other.length !== val.length) return false;
    for (let i = 0; i < val.length; i++) {
      if (val[i] !== other[i]) return false;
    }
  }
  return true;
}

function metaMapsEqual(
  a: Map<string, RbSetRow>,
  b: Map<string, RbSetRow>
): boolean {
  if (a.size !== b.size) return false;
  for (const [key, val] of a) {
    const other = b.get(key);
    if (!other) return false;
    if (
      val.set_num !== other.set_num ||
      val.name !== other.name ||
      val.year !== other.year ||
      val.num_parts !== other.num_parts
    )
      return false;
  }
  return true;
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

  // Hydrate from localStorage cache on first render (before effects run)
  const initialCache = useMemo(
    () => (user ? getCachedCollection(user.id) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user?.id]
  );

  const [listItemsBySet, setListItemsBySet] = useState<Map<string, string[]>>(
    () => initialCache?.bySet ?? new Map()
  );
  const [listOnlyMeta, setListOnlyMeta] = useState<Map<string, RbSetRow>>(
    () => initialCache?.meta ?? new Map()
  );
  const [isLoadingItems, setIsLoadingItems] = useState(!!user && !initialCache);
  const [error, setError] = useState<string | null>(null);

  const [listFilter, setListFilter] = useState<ListFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch user_list_items where item_type = 'set'.
  // Only re-fetches on login/logout — the merge useMemo handles owned-set
  // reactivity without re-querying Supabase.
  // When cache is available, data is shown immediately and this runs as a
  // background refresh.
  useEffect(() => {
    if (!user) {
      setListItemsBySet(new Map());
      setListOnlyMeta(new Map());
      setIsLoadingItems(false);
      setError(null);
      return;
    }

    const hadCache = !!getCachedCollection(user.id);

    let cancelled = false;
    const supabase = getSupabaseBrowserClient();

    async function fetchListItems() {
      if (!hadCache) {
        setIsLoadingItems(true);
      }
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

        // Fetch metadata for all list set numbers from rb_sets.
        // The merge step will skip entries that already have owned-store metadata,
        // but we fetch them all here since we don't read storeSets in this effect.
        const metaMap = new Map<string, RbSetRow>();
        if (allListSetNums.length > 0) {
          const CHUNK_SIZE = 200;

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
        }

        if (cancelled) return;

        // Update cache
        setCachedCollection(user!.id, bySet, metaMap);

        // Only update state if data actually changed from what's currently shown
        setListItemsBySet(prev => (mapsEqual(prev, bySet) ? prev : bySet));
        setListOnlyMeta(prev =>
          metaMapsEqual(prev, metaMap) ? prev : metaMap
        );
        setIsLoadingItems(false);
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
