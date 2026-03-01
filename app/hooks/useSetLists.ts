'use client';

import { useEntitlements } from '@/app/components/providers/entitlements-provider';
import { useSupabaseUser } from '@/app/hooks/useSupabaseUser';
import { updateCollectionCacheForToggle } from '@/app/hooks/useCollectionSets';
import {
  optimisticUpdateUserLists,
  useUserLists,
  type UserListSummary,
} from '@/app/hooks/useUserLists';
import { getSupabaseBrowserClient } from '@/app/lib/supabaseClient';
import { FREE_LIST_LIMIT } from '@/app/lib/domain/limits';
import type { Tables } from '@/supabase/types';
import { useCallback, useEffect, useMemo, useState } from 'react';

export type UserList = {
  id: string;
  name: string;
  isSystem: boolean;
};

export type UseSetListsResult = {
  lists: UserList[];
  selectedListIds: string[];
  isLoading: boolean;
  error: string | null;
  toggleList: (listId: string) => void;
  createList: (name: string) => void;
  renameList: (listId: string, newName: string) => void;
  deleteList: (listId: string) => void;
  showUpgradeModal: boolean;
  dismissUpgradeModal: () => void;
};

type UseSetListsArgs = {
  setNumber: string;
};

const MEMBERSHIP_CACHE_LIMIT = 40;
const STORAGE_KEY = 'brick_party_set_lists_cache_v1';
const SET_ITEM_TYPE = 'set' as const;

// --- Per-set membership persistence (sessionStorage) ---

type PersistedMembership = {
  ids: string[];
  updatedAt: number;
};

type PersistedUserState = {
  memberships: Record<string, PersistedMembership>;
};

type PersistedRoot = Record<string, PersistedUserState>;

let persistedRoot: PersistedRoot | null = null;

function readPersistedRoot(): PersistedRoot {
  if (persistedRoot) return persistedRoot;
  if (typeof window === 'undefined') {
    persistedRoot = {};
    return persistedRoot;
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    persistedRoot = raw ? (JSON.parse(raw) as PersistedRoot) : {};
  } catch {
    persistedRoot = {};
  }
  return persistedRoot!;
}

function writePersistedRoot(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(persistedRoot ?? {})
    );
  } catch {
    // Swallow storage failures (private browsing, quota, etc.).
  }
}

function getPersistedMembership(
  userId: string,
  setNum: string
): string[] | null {
  if (!userId) return null;
  const root = readPersistedRoot();
  return root[userId]?.memberships[setNum]?.ids ?? null;
}

function updatePersistedMembership(
  userId: string,
  setNum: string,
  ids: string[]
): void {
  if (!userId) return;
  const root = readPersistedRoot();
  const prev = root[userId] ?? { memberships: {} };
  const memberships = {
    ...prev.memberships,
    [setNum]: { ids, updatedAt: Date.now() },
  };
  root[userId] = { memberships: trimMemberships(memberships) };
  writePersistedRoot();
}

function trimMemberships(
  memberships: Record<string, PersistedMembership>
): Record<string, PersistedMembership> {
  const entries = Object.entries(memberships);
  if (entries.length <= MEMBERSHIP_CACHE_LIMIT) {
    return memberships;
  }
  entries.sort((a, b) => a[1].updatedAt - b[1].updatedAt);
  const trimmed = entries.slice(entries.length - MEMBERSHIP_CACHE_LIMIT);
  return trimmed.reduce<Record<string, PersistedMembership>>(
    (acc, [key, value]) => {
      acc[key] = value;
      return acc;
    },
    {}
  );
}

// --- In-memory membership cache (keyed by userId::setNumber) ---

type MembershipCacheEntry = {
  selectedIds: string[];
  updatedAt: number;
};

const MEMBERSHIP_TTL_MS = 5 * 60 * 1000;
const membershipCache = new Map<string, MembershipCacheEntry>();

function makeCacheKey(userId: string, setNumber: string): string {
  return `${userId}::${setNumber}`;
}

function getCachedMembership(key: string | null): string[] | null {
  if (!key) return null;
  const entry = membershipCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.updatedAt > MEMBERSHIP_TTL_MS) {
    membershipCache.delete(key);
    return null;
  }
  return entry.selectedIds;
}

function toUserList(summary: UserListSummary): UserList {
  return { id: summary.id, name: summary.name, isSystem: summary.isSystem };
}

export function useSetLists({ setNumber }: UseSetListsArgs): UseSetListsResult {
  const { user } = useSupabaseUser();
  const { allLists, isLoading: listsLoading } = useUserLists();
  const { hasFeature } = useEntitlements();

  const lists: UserList[] = useMemo(() => allLists.map(toUserList), [allLists]);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const dismissUpgradeModal = useCallback(() => setShowUpgradeModal(false), []);

  const [selectedListIds, setSelectedListIds] = useState<string[]>([]);
  const [membershipLoading, setMembershipLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const normSetNum = useMemo(() => setNumber.trim(), [setNumber]);

  const cacheKey = useMemo(
    () => (user ? makeCacheKey(user.id, normSetNum) : null),
    [user, normSetNum]
  );

  // Fetch per-set membership (user_list_items) only
  useEffect(() => {
    if (!user) {
      setSelectedListIds([]);
      setError(null);
      return;
    }

    // In-memory cache hit — use cached data, skip network request
    const cached = getCachedMembership(cacheKey);
    if (cached) {
      setSelectedListIds(cached);
      setMembershipLoading(false);
      return;
    }

    // Promote persisted (sessionStorage) data to in-memory cache if available,
    // avoiding a network request when the data was saved from a previous page load
    const persisted = getPersistedMembership(user.id, normSetNum);
    if (persisted && cacheKey) {
      membershipCache.set(cacheKey, {
        selectedIds: persisted,
        updatedAt: Date.now(),
      });
      setSelectedListIds(persisted);
      setMembershipLoading(false);
      return;
    }

    let cancelled = false;
    setMembershipLoading(true);

    const run = async () => {
      setError(null);
      try {
        const supabase = getSupabaseBrowserClient();
        const { data, error: membershipError } = await supabase
          .from('user_list_items')
          .select<'list_id'>('list_id')
          .eq('user_id', user.id)
          .eq('item_type', SET_ITEM_TYPE)
          .eq('set_num', normSetNum);

        if (cancelled) return;

        if (membershipError) {
          console.error('useSetLists membership query error', membershipError);
          setError(membershipError.message ?? 'Failed to load list membership');
          return;
        }

        const membershipRows = (data ?? []) as Array<Tables<'user_list_items'>>;
        const selected = membershipRows.map(row => row.list_id);

        setSelectedListIds(selected);

        if (cacheKey) {
          membershipCache.set(cacheKey, {
            selectedIds: selected,
            updatedAt: Date.now(),
          });
        }

        updatePersistedMembership(user.id, normSetNum, selected);
      } catch (err) {
        if (!cancelled) {
          console.error('useSetLists load failed', err);
          const message =
            (err as { message?: string })?.message ?? 'Failed to load lists';
          setError(message);
        }
      } finally {
        if (!cancelled) {
          setMembershipLoading(false);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [user, normSetNum, cacheKey]);

  const isLoading = listsLoading || membershipLoading;

  const toggleList = (listId: string) => {
    if (!user) return;

    const supabase = getSupabaseBrowserClient();
    const isSelected = selectedListIds.includes(listId);
    const nextSelected = isSelected
      ? selectedListIds.filter(id => id !== listId)
      : [...selectedListIds, listId];

    setSelectedListIds(nextSelected);

    if (cacheKey) {
      membershipCache.set(cacheKey, {
        selectedIds: nextSelected,
        updatedAt: Date.now(),
      });
    }

    updatePersistedMembership(user.id, normSetNum, nextSelected);
    updateCollectionCacheForToggle(user.id, normSetNum, listId, !isSelected);

    if (isSelected) {
      void supabase
        .from('user_list_items')
        .delete()
        .eq('user_id', user.id)
        .eq('list_id', listId)
        .eq('item_type', SET_ITEM_TYPE)
        .eq('set_num', normSetNum)
        .then(({ error: err }) => {
          if (err) {
            console.error('Failed to remove set from list', err);
            setError('Failed to update lists');
          }
        });
    } else {
      void supabase
        .from('user_list_items')
        .upsert(
          {
            user_id: user.id,
            list_id: listId,
            item_type: SET_ITEM_TYPE,
            set_num: normSetNum,
          },
          { onConflict: 'user_id,list_id,item_type,set_num' }
        )
        .then(({ error: err }) => {
          if (err) {
            console.error('Failed to add set to list', err);
            setError('Failed to update lists');
          }
        });
    }
  };

  const createList = (name: string) => {
    const trimmed = name.trim();
    if (!user || !trimmed) return;

    // Client-side pre-check for fast UX rejection (server enforces authoritatively)
    const customListCount = lists.filter(l => !l.isSystem).length;
    if (customListCount >= FREE_LIST_LIMIT && !hasFeature('lists.unlimited')) {
      setShowUpgradeModal(true);
      return;
    }

    const exists = lists.some(
      list => list.name.toLowerCase() == trimmed.toLowerCase()
    );
    if (exists) {
      setError('A list with that name already exists.');
      return;
    }

    const tempId = `temp-${Date.now().toString(36)}`;
    const optimistic: UserListSummary = {
      id: tempId,
      name: trimmed,
      isSystem: false,
    };

    optimisticUpdateUserLists(user.id, prev => [...prev, optimistic]);

    void (async () => {
      try {
        const res = await fetch('/api/lists', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: trimmed }),
        });

        if (res.status === 403) {
          const body = await res.json();
          if (body.error === 'feature_unavailable') {
            optimisticUpdateUserLists(user.id, prev =>
              prev.filter(list => list.id !== tempId)
            );
            setShowUpgradeModal(true);
            return;
          }
        }

        if (!res.ok) {
          const body = await res.json().catch(() => null);
          console.error('Failed to create list', body);
          setError(
            (body as { message?: string })?.message ?? 'Failed to create list'
          );
          optimisticUpdateUserLists(user.id, prev =>
            prev.filter(list => list.id !== tempId)
          );
          return;
        }

        const data = (await res.json()) as {
          id: string;
          name: string;
          is_system: boolean;
        };
        const created: UserListSummary = {
          id: data.id,
          name: data.name,
          isSystem: data.is_system,
        };

        optimisticUpdateUserLists(user.id, prev =>
          prev
            .filter(list => list.id !== tempId)
            .concat(created)
            .sort((a, b) => a.name.localeCompare(b.name))
        );

        const nextSelected = [...selectedListIds, created.id];
        setSelectedListIds(nextSelected);

        if (cacheKey) {
          membershipCache.set(cacheKey, {
            selectedIds: nextSelected,
            updatedAt: Date.now(),
          });
        }

        updatePersistedMembership(user.id, normSetNum, nextSelected);

        const supabase = getSupabaseBrowserClient();
        void supabase
          .from('user_list_items')
          .upsert(
            {
              user_id: user.id,
              list_id: created.id,
              item_type: SET_ITEM_TYPE,
              set_num: normSetNum,
            },
            { onConflict: 'user_id,list_id,item_type,set_num' }
          )
          .then(({ error: membershipError }) => {
            if (membershipError) {
              console.error('Failed to add set to new list', membershipError);
              setError('Failed to add set to new list');
            }
          });
      } catch (err) {
        console.error('Failed to create list', err);
        setError('Failed to create list');
        optimisticUpdateUserLists(user.id, prev =>
          prev.filter(list => list.id !== tempId)
        );
      }
    })();
  };

  const renameList = (listId: string, newName: string) => {
    const trimmed = newName.trim();
    if (!user || !trimmed) return;

    const exists = lists.some(
      l => l.id !== listId && l.name.toLowerCase() === trimmed.toLowerCase()
    );
    if (exists) {
      setError('A list with that name already exists.');
      return;
    }

    optimisticUpdateUserLists(user.id, prev =>
      prev.map(l => (l.id === listId ? { ...l, name: trimmed } : l))
    );

    const supabase = getSupabaseBrowserClient();
    void supabase
      .from('user_lists')
      .update({ name: trimmed })
      .eq('id', listId)
      .eq('user_id', user.id)
      .then(({ error: err }) => {
        if (err) {
          console.error('Failed to rename list', err);
          setError('Failed to rename list');
        }
      });
  };

  const deleteList = (listId: string) => {
    if (!user) return;

    optimisticUpdateUserLists(user.id, prev =>
      prev.filter(l => l.id !== listId)
    );

    setSelectedListIds(prev => prev.filter(id => id !== listId));

    if (cacheKey) {
      const existing = membershipCache.get(cacheKey);
      if (existing) {
        membershipCache.set(cacheKey, {
          selectedIds: existing.selectedIds.filter(id => id !== listId),
          updatedAt: Date.now(),
        });
      }
    }

    updatePersistedMembership(
      user.id,
      normSetNum,
      selectedListIds.filter(id => id !== listId)
    );

    const supabase = getSupabaseBrowserClient();
    void supabase
      .from('user_lists')
      .delete()
      .eq('id', listId)
      .eq('user_id', user.id)
      .then(({ error: err }) => {
        if (err) {
          console.error('Failed to delete list', err);
          setError('Failed to delete list');
        }
      });
  };

  return {
    lists,
    selectedListIds,
    isLoading,
    error,
    toggleList,
    createList,
    renameList,
    deleteList,
    showUpgradeModal,
    dismissUpgradeModal,
  };
}
