'use client';

import { useEntitlements } from '@/app/components/providers/entitlements-provider';
import { emitListToast } from '@/app/components/providers/list-toast-provider';
import { useSupabaseUser } from '@/app/hooks/useSupabaseUser';
import {
  optimisticUpdateUserLists,
  useUserLists,
  type UserListSummary,
} from '@/app/hooks/useUserLists';
import { FREE_LIST_LIMIT } from '@/app/lib/domain/limits';
import { getSupabaseBrowserClient } from '@/app/lib/supabaseClient';
import type { Tables } from '@/supabase/types';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { logger } from '@/lib/metrics';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type UserList = {
  id: string;
  name: string;
  isSystem: boolean;
};

type ItemType = 'set' | 'minifig';

/**
 * The column in user_list_items that stores the item identifier.
 * - sets use `set_num`
 * - minifigs use `minifig_id`
 */
type ItemColumn = 'set_num' | 'minifig_id';

export type UseListMembershipResult = {
  lists: UserList[];
  selectedListIds: string[];
  listsLoading: boolean;
  listsError: string | null;
  createList: (name: string) => void;
  renameList: (listId: string, newName: string) => void;
  deleteList: (listId: string) => void;
  toggleList: (listId: string) => void;
  showListUpgradeModal: boolean;
  dismissListUpgradeModal: () => void;
};

// ---------------------------------------------------------------------------
// Per-item membership persistence (localStorage)
// ---------------------------------------------------------------------------

const MEMBERSHIP_CACHE_LIMIT = 40;
const STORAGE_KEY = 'brick_party_list_membership_cache_v1';

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
  itemKey: string
): string[] | null {
  if (!userId) return null;
  const root = readPersistedRoot();
  return root[userId]?.memberships[itemKey]?.ids ?? null;
}

function updatePersistedMembership(
  userId: string,
  itemKey: string,
  ids: string[]
): void {
  if (!userId) return;
  const root = readPersistedRoot();
  const prev = root[userId] ?? { memberships: {} };
  const memberships = {
    ...prev.memberships,
    [itemKey]: { ids, updatedAt: Date.now() },
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

// ---------------------------------------------------------------------------
// In-memory membership cache (keyed by userId::itemType::itemId)
// ---------------------------------------------------------------------------

type MembershipCacheEntry = {
  selectedIds: string[];
  updatedAt: number;
};

const MEMBERSHIP_TTL_MS = 5 * 60 * 1000;
const membershipCache = new Map<string, MembershipCacheEntry>();

function makeCacheKey(
  userId: string,
  itemType: ItemType,
  itemId: string
): string {
  return `${userId}::${itemType}::${itemId}`;
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

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Shared list membership CRUD for both sets and minifigs.
 *
 * @param itemType - 'set' or 'minifig'
 * @param itemId - the set number or minifig fig_num
 * @param itemColumn - the DB column name ('set_num' or 'minifig_id')
 * @param onToggleAdd - optional callback fired after a successful add (e.g. sync minifigs)
 * @param onToggleRemove - optional callback fired after a successful remove
 */
export function useListMembership(
  itemType: ItemType,
  itemId: string,
  itemColumn: ItemColumn,
  onToggleAdd?: (userId: string, itemId: string, listId: string) => void,
  onToggleRemove?: (userId: string, itemId: string, listId: string) => void
): UseListMembershipResult {
  const { user } = useSupabaseUser();
  const { allLists, isLoading: listsLoading } = useUserLists();
  const { hasFeature } = useEntitlements();

  const lists: UserList[] = useMemo(() => allLists.map(toUserList), [allLists]);
  const [showListUpgradeModal, setShowListUpgradeModal] = useState(false);
  const dismissListUpgradeModal = useCallback(
    () => setShowListUpgradeModal(false),
    []
  );

  const [selectedListIds, setSelectedListIds] = useState<string[]>([]);
  const [membershipLoading, setMembershipLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const normItemId = useMemo(() => itemId.trim(), [itemId]);

  const cacheKey = useMemo(
    () => (user ? makeCacheKey(user.id, itemType, normItemId) : null),
    [user, itemType, normItemId]
  );

  // Persist key combines itemType and itemId so set and minifig caches don't collide
  const persistKey = useMemo(
    () => `${itemType}::${normItemId}`,
    [itemType, normItemId]
  );

  // Fetch per-item membership (user_list_items)
  useEffect(() => {
    if (!user) {
      setSelectedListIds([]);
      setError(null);
      return;
    }

    // In-memory cache hit
    const cached = getCachedMembership(cacheKey);
    if (cached) {
      setSelectedListIds(cached);
      setMembershipLoading(false);
      return;
    }

    // Promote persisted (localStorage) data to in-memory cache
    const persisted = getPersistedMembership(user.id, persistKey);
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
          .eq('item_type', itemType)
          .eq(itemColumn, normItemId);

        if (cancelled) return;

        if (membershipError) {
          logger.error('list.membership_query_failed', {
            error: membershipError.message,
          });
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

        updatePersistedMembership(user.id, persistKey, selected);
      } catch (err) {
        if (!cancelled) {
          logger.error('list.membership_load_failed', {
            error: (err as Error)?.message ?? String(err),
          });
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
  }, [user, normItemId, cacheKey, persistKey, itemType, itemColumn]);

  const listsLoadingCombined = listsLoading || membershipLoading;

  // --- Build the upsert row for a list item ---
  function makeUpsertRow(userId: string, listId: string) {
    const base = {
      user_id: userId,
      list_id: listId,
      item_type: itemType,
    };
    if (itemColumn === 'set_num') {
      return { ...base, set_num: normItemId };
    }
    return { ...base, minifig_id: normItemId };
  }

  function upsertConflict(): string {
    return `user_id,list_id,item_type,${itemColumn}`;
  }

  // --- Shared cache update helpers ---

  /**
   * Read-modify-write update of both the in-memory membership cache and
   * localStorage. Use this instead of capturing state snapshots when multiple
   * calls may race (rapid create/toggle).
   *
   * The `updater` MUST be a pure function: it is invoked twice per call (once
   * against the in-memory cache, once against localStorage). Side-effectful
   * updaters (logging, random values, telemetry) will behave unpredictably.
   */
  function updateCachesFunctional(updater: (prev: string[]) => string[]): void {
    if (cacheKey) {
      const prev = membershipCache.get(cacheKey)?.selectedIds ?? [];
      membershipCache.set(cacheKey, {
        selectedIds: updater(prev),
        updatedAt: Date.now(),
      });
    }
    if (user) {
      const prev = getPersistedMembership(user.id, persistKey) ?? [];
      updatePersistedMembership(user.id, persistKey, updater(prev));
    }
  }

  // --- CRUD operations ---

  const toggleList = (listId: string) => {
    if (!user) return;

    const supabase = getSupabaseBrowserClient();
    const wasSelected = selectedListIds.includes(listId);

    // Optimistic state update (functional)
    setSelectedListIds(prev =>
      wasSelected ? prev.filter(id => id !== listId) : [...prev, listId]
    );
    updateCachesFunctional(prev =>
      wasSelected ? prev.filter(id => id !== listId) : [...prev, listId]
    );

    if (wasSelected) {
      void supabase
        .from('user_list_items')
        .delete()
        .eq('user_id', user.id)
        .eq('list_id', listId)
        .eq('item_type', itemType)
        .eq(itemColumn, normItemId)
        .then(({ error: err }) => {
          if (err) {
            logger.error('list.toggle_remove_failed', {
              listId,
              itemType,
              error: err.message,
            });
            // Rollback: add the id back if it's still absent
            setSelectedListIds(prev =>
              prev.includes(listId) ? prev : [...prev, listId]
            );
            updateCachesFunctional(prev =>
              prev.includes(listId) ? prev : [...prev, listId]
            );
            emitListToast('Failed to update lists');
          } else {
            onToggleRemove?.(user.id, normItemId, listId);
          }
        });
    } else {
      void supabase
        .from('user_list_items')
        .upsert(makeUpsertRow(user.id, listId), {
          onConflict: upsertConflict(),
        })
        .then(({ error: err }) => {
          if (err) {
            logger.error('list.toggle_add_failed', {
              listId,
              itemType,
              error: err.message,
            });
            // Rollback: remove the id if it's still present
            setSelectedListIds(prev => prev.filter(id => id !== listId));
            updateCachesFunctional(prev => prev.filter(id => id !== listId));
            emitListToast('Failed to update lists');
          } else {
            onToggleAdd?.(user.id, normItemId, listId);
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
      setShowListUpgradeModal(true);
      return;
    }

    const exists = lists.some(
      list => list.name.toLowerCase() === trimmed.toLowerCase()
    );
    if (exists) {
      setError('A list with that name already exists.');
      return;
    }

    const tempId = `temp-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 6)}`;
    const optimistic: UserListSummary = {
      id: tempId,
      name: trimmed,
      isSystem: false,
    };

    // 1. Optimistic add to userLists (existing helper, already functional)
    optimisticUpdateUserLists(user.id, prev => [...prev, optimistic]);

    // 2. Optimistic add to selectedListIds (functional)
    setSelectedListIds(prev =>
      prev.includes(tempId) ? prev : [...prev, tempId]
    );

    // 3. Optimistic add to in-memory + localStorage caches (functional)
    updateCachesFunctional(prev =>
      prev.includes(tempId) ? prev : [...prev, tempId]
    );

    void (async () => {
      try {
        const res = await fetch('/api/lists', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: trimmed }),
        });

        if (res.status === 403) {
          const body = (await res.json().catch(() => null)) as {
            error?: string;
            message?: string;
          } | null;
          // Rollback all optimistic state
          optimisticUpdateUserLists(user.id, prev =>
            prev.filter(list => list.id !== tempId)
          );
          setSelectedListIds(prev => prev.filter(id => id !== tempId));
          updateCachesFunctional(prev => prev.filter(id => id !== tempId));
          if (body?.error === 'feature_unavailable') {
            setShowListUpgradeModal(true);
          } else {
            emitListToast(body?.message || 'Failed to create list');
          }
          return;
        }

        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as {
            error?: string;
            message?: string;
          } | null;
          logger.error('list.create_failed', {
            error: body?.message || body?.error,
          });
          optimisticUpdateUserLists(user.id, prev =>
            prev.filter(list => list.id !== tempId)
          );
          setSelectedListIds(prev => prev.filter(id => id !== tempId));
          updateCachesFunctional(prev => prev.filter(id => id !== tempId));
          emitListToast(
            body?.message || body?.error || 'Failed to create list'
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

        // 4. Swap tempId -> realId in userLists (functional, with sort)
        optimisticUpdateUserLists(user.id, prev =>
          prev
            .map(list => (list.id === tempId ? created : list))
            .sort((a, b) => a.name.localeCompare(b.name))
        );

        // 5. Swap tempId -> realId in selectedListIds (functional)
        setSelectedListIds(prev =>
          prev.map(id => (id === tempId ? created.id : id))
        );

        // 6. Swap tempId -> realId in caches (functional)
        updateCachesFunctional(prev =>
          prev.map(id => (id === tempId ? created.id : id))
        );

        // 7. Persist the item-to-list association
        const supabase = getSupabaseBrowserClient();
        void supabase
          .from('user_list_items')
          .upsert(makeUpsertRow(user.id, created.id), {
            onConflict: upsertConflict(),
          })
          .then(({ error: membershipError }) => {
            if (membershipError) {
              logger.error('list.add_to_new_list_failed', {
                itemType,
                error: membershipError.message,
              });
              // List was created successfully; roll back only the item-to-list link
              setSelectedListIds(prev => prev.filter(id => id !== created.id));
              updateCachesFunctional(prev =>
                prev.filter(id => id !== created.id)
              );
              emitListToast(
                `List created, but failed to add this ${itemType}. Try again.`
              );
            } else {
              onToggleAdd?.(user.id, normItemId, created.id);
            }
          });
      } catch (err) {
        logger.error('list.create_failed', {
          error: (err as Error)?.message ?? String(err),
        });
        optimisticUpdateUserLists(user.id, prev =>
          prev.filter(list => list.id !== tempId)
        );
        setSelectedListIds(prev => prev.filter(id => id !== tempId));
        updateCachesFunctional(prev => prev.filter(id => id !== tempId));
        emitListToast('Failed to create list');
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

    const prevName = lists.find(l => l.id === listId)?.name;

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
          logger.error('list.rename_failed', { listId, error: err.message });
          if (prevName !== undefined) {
            optimisticUpdateUserLists(user.id, prev =>
              prev.map(l => (l.id === listId ? { ...l, name: prevName } : l))
            );
          }
          emitListToast('Failed to rename list');
        }
      });
  };

  const deleteList = (listId: string) => {
    if (!user) return;

    // Snapshot only for userLists rollback on failure (useUserLists store
    // doesn't expose a functional "restore" helper, so we capture the full
    // previous list and restore from it if the delete fails).
    const prevLists = allLists;

    optimisticUpdateUserLists(user.id, prev =>
      prev.filter(l => l.id !== listId)
    );

    setSelectedListIds(prev => prev.filter(id => id !== listId));
    updateCachesFunctional(prev => prev.filter(id => id !== listId));

    const supabase = getSupabaseBrowserClient();
    void supabase
      .from('user_lists')
      .delete()
      .eq('id', listId)
      .eq('user_id', user.id)
      .then(({ error: err }) => {
        if (err) {
          logger.error('list.delete_failed', { listId, error: err.message });
          optimisticUpdateUserLists(user.id, () => prevLists);
          setSelectedListIds(prev =>
            prev.includes(listId) ? prev : [...prev, listId]
          );
          updateCachesFunctional(prev =>
            prev.includes(listId) ? prev : [...prev, listId]
          );
          emitListToast('Failed to delete list');
        }
      });
  };

  return {
    lists,
    selectedListIds,
    listsLoading: listsLoadingCombined,
    listsError: error,
    createList,
    renameList,
    deleteList,
    toggleList,
    showListUpgradeModal,
    dismissListUpgradeModal,
  };
}
