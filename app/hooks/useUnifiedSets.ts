'use client';

import { useCollectionSets } from '@/app/hooks/useCollectionSets';
import { useCompletionStats } from '@/app/hooks/useCompletionStats';
import { useRecentSets } from '@/app/hooks/useRecentSets';
import { useSupabaseUser } from '@/app/hooks/useSupabaseUser';
import { useUserLists } from '@/app/hooks/useUserLists';
import {
  getStoredGroupSessions,
  clearStoredGroupSession,
  clearAllStoredGroupSessions,
  type StoredGroupSession,
} from '@/app/store/group-sessions';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export type UnifiedSet = {
  setNumber: string;
  name: string;
  year: number;
  imageUrl: string | null;
  numParts: number;
  themeId: number | null;
  /** Present in recently viewed list */
  isRecentlyViewed: boolean;
  lastViewedAt: number;
  /** Tracked owned piece count (0 = not tracked) */
  ownedCount: number;
  /** Total parts for progress bar */
  totalParts: number;
  /** User has marked this set as owned in collection */
  isOwned: boolean;
  /** List IDs this set belongs to (collection) */
  listIds: string[];
};

export type UnifiedFilter =
  | 'recent'
  | 'continue'
  | 'search-parties'
  | 'all'
  | 'owned'
  | 'wishlist'
  | `list:${string}`;

export type UnifiedFilterOption = {
  key: UnifiedFilter;
  label: string;
  count: number;
};

function normalizeKey(setNumber: string): string {
  return setNumber.trim().toLowerCase();
}

export function useUnifiedSets(isActive = true) {
  const { user } = useSupabaseUser();
  const { sets: recentSets, remove: removeRecent } = useRecentSets(isActive);
  const { sets: completionSets, isLoading: completionLoading } =
    useCompletionStats(isActive);
  const {
    allSets: collectionSets,
    filterOptions: collectionFilterOptions,
    isLoading: collectionLoading,
    isEmpty: collectionEmpty,
  } = useCollectionSets();
  const { wishlist } = useUserLists();

  const [activeFilter, setActiveFilter] = useState<UnifiedFilter>('recent');
  const [searchQuery, setSearchQuery] = useState('');

  // Read stored SP sessions (re-read on tab activation)
  const [storedSessions, setStoredSessions] = useState<StoredGroupSession[]>(
    () => getStoredGroupSessions()
  );
  const prevActiveRef2 = useRef(isActive);
  useEffect(() => {
    if (isActive && !prevActiveRef2.current) {
      setStoredSessions(getStoredGroupSessions());
    }
    prevActiveRef2.current = isActive;
  }, [isActive]);

  const removeSearchParty = useCallback((slug: string) => {
    clearStoredGroupSession(slug);
    setStoredSessions(prev => prev.filter(s => s.slug !== slug));
  }, []);

  const clearAllSearchParties = useCallback(() => {
    clearAllStoredGroupSessions();
    setStoredSessions([]);
    setActiveFilter('recent');
  }, []);

  // Reset to "recent" if user logs out while on a collection filter
  const prevUserRef = useRef(user?.id ?? null);
  useEffect(() => {
    const currentUserId = user?.id ?? null;
    if (prevUserRef.current && !currentUserId) {
      // User logged out
      if (activeFilter !== 'recent' && activeFilter !== 'continue') {
        setActiveFilter('recent');
      }
    }
    prevUserRef.current = currentUserId;
  }, [user, activeFilter]);

  // Build unified map: merge all data sources
  const unified = useMemo(() => {
    const map = new Map<string, UnifiedSet>();

    // 1. Seed from recent sets (synchronous, instant)
    for (const r of recentSets) {
      const key = normalizeKey(r.setNumber);
      map.set(key, {
        setNumber: r.setNumber,
        name: r.name,
        year: r.year,
        imageUrl: r.imageUrl,
        numParts: r.numParts,
        themeId: r.themeId ?? null,
        isRecentlyViewed: true,
        lastViewedAt: r.lastViewedAt,
        ownedCount: 0,
        totalParts: 0,
        isOwned: false,
        listIds: [],
      });
    }

    // 2. Merge completion stats
    for (const c of completionSets) {
      const key = normalizeKey(c.setNumber);
      const existing = map.get(key);
      if (existing) {
        existing.ownedCount = c.ownedCount;
        existing.totalParts = c.totalParts;
      } else {
        map.set(key, {
          setNumber: c.setNumber,
          name: c.name,
          year: c.year,
          imageUrl: c.imageUrl,
          numParts: c.numParts,
          themeId: c.themeId ?? null,
          isRecentlyViewed: false,
          lastViewedAt: 0,
          ownedCount: c.ownedCount,
          totalParts: c.totalParts,
          isOwned: false,
          listIds: [],
        });
      }
    }

    // 3. Merge collection sets (highest priority metadata)
    for (const s of collectionSets) {
      const key = normalizeKey(s.setNumber);
      const existing = map.get(key);
      if (existing) {
        // Collection has authoritative metadata
        existing.name = s.name;
        existing.year = s.year;
        existing.imageUrl = s.imageUrl;
        existing.numParts = s.numParts;
        existing.themeId = s.themeId;
        existing.isOwned = s.isOwned;
        existing.listIds = s.listIds;
      } else {
        map.set(key, {
          setNumber: s.setNumber,
          name: s.name,
          year: s.year,
          imageUrl: s.imageUrl,
          numParts: s.numParts,
          themeId: s.themeId,
          isRecentlyViewed: false,
          lastViewedAt: 0,
          ownedCount: 0,
          totalParts: 0,
          isOwned: s.isOwned,
          listIds: s.listIds,
        });
      }
    }

    return Array.from(map.values());
  }, [recentSets, completionSets, collectionSets]);

  // Build filter options
  const filterOptions = useMemo<UnifiedFilterOption[]>(() => {
    const recentCount = unified.filter(s => s.isRecentlyViewed).length;
    const continueCount = unified.filter(
      s => s.ownedCount > 0 && s.totalParts > 0 && s.ownedCount < s.totalParts
    ).length;

    const options: UnifiedFilterOption[] = [
      { key: 'recent', label: 'Recently Viewed', count: recentCount },
      { key: 'continue', label: 'Continue Building', count: continueCount },
    ];

    // Add Search Parties chip when there are stored sessions
    if (storedSessions.length > 0) {
      options.push({
        key: 'search-parties',
        label: 'Search Parties',
        count: storedSessions.length,
      });
    }

    // Add collection filters when authenticated and collection is non-empty.
    // "All" goes last so specific filters are more prominent.
    if (user && !collectionEmpty) {
      let allOpt: UnifiedFilterOption | null = null;
      for (const opt of collectionFilterOptions) {
        const mapped: UnifiedFilterOption = {
          key: opt.key as UnifiedFilter,
          label: opt.label,
          count: opt.count,
        };
        if (opt.key === 'all') {
          allOpt = mapped;
        } else {
          options.push(mapped);
        }
      }
      if (allOpt) options.push(allOpt);
    }

    return options;
  }, [unified, user, collectionEmpty, collectionFilterOptions, storedSessions]);

  // Apply filter + search
  const filteredSets = useMemo(() => {
    let result: UnifiedSet[];

    switch (activeFilter) {
      case 'recent':
        result = unified
          .filter(s => s.isRecentlyViewed)
          .sort((a, b) => b.lastViewedAt - a.lastViewedAt);
        break;
      case 'continue':
        result = unified
          .filter(
            s =>
              s.ownedCount > 0 &&
              s.totalParts > 0 &&
              s.ownedCount < s.totalParts
          )
          .sort((a, b) => {
            // Prefer recently viewed, fallback to name
            if (b.lastViewedAt !== a.lastViewedAt) {
              return b.lastViewedAt - a.lastViewedAt;
            }
            return a.name.localeCompare(b.name);
          });
        break;
      case 'search-parties':
        // Build UnifiedSet objects from stored sessions (not from unified map)
        result = storedSessions
          .sort((a, b) => b.joinedAt - a.joinedAt)
          .map(s => ({
            setNumber: s.setNumber,
            name: s.setName,
            year: s.year,
            imageUrl: s.imageUrl,
            numParts: s.numParts,
            themeId: s.themeId,
            isRecentlyViewed: false,
            lastViewedAt: s.joinedAt,
            ownedCount: 0,
            totalParts: 0,
            isOwned: false,
            listIds: [],
          }));
        break;
      case 'all':
        result = unified
          .filter(s => s.isOwned || s.listIds.length > 0)
          .sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'owned':
        result = unified
          .filter(s => s.isOwned)
          .sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'wishlist':
        result = wishlist
          ? unified
              .filter(s => s.listIds.includes(wishlist.id))
              .sort((a, b) => a.name.localeCompare(b.name))
          : [];
        break;
      default: {
        // list:ID
        if (activeFilter.startsWith('list:')) {
          const listId = activeFilter.slice(5);
          result = unified
            .filter(s => s.listIds.includes(listId))
            .sort((a, b) => a.name.localeCompare(b.name));
        } else {
          result = [];
        }
        break;
      }
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
  }, [unified, activeFilter, searchQuery, wishlist, storedSessions]);

  return {
    sets: filteredSets,
    activeFilter,
    setActiveFilter,
    searchQuery,
    setSearchQuery,
    filterOptions,
    removeRecent,
    removeSearchParty,
    clearAllSearchParties,
    storedSessions,
    isLoading: completionLoading || collectionLoading,
  };
}
