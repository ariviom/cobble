'use client';

import { useSupabaseUser } from '@/app/hooks/useSupabaseUser';
import { getSupabaseBrowserClient } from '@/app/lib/supabaseClient';
import type { Tables } from '@/supabase/types';
import { useEffect, useMemo, useState } from 'react';

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
};

type UseSetListsArgs = {
  setNumber: string;
};

const LIST_CACHE_TTL_MS = 5 * 60 * 1000;
const MEMBERSHIP_CACHE_LIMIT = 40;
const STORAGE_KEY = 'brick_party_set_lists_cache_v1';
const SET_ITEM_TYPE = 'set' as const;

type ListCacheEntry = {
  lists: UserList[];
  selectedIds: string[];
  updatedAt: number;
};

type PersistedMembership = {
  ids: string[];
  updatedAt: number;
};

type PersistedUserState = {
  lists: UserList[];
  listsUpdatedAt: number;
  memberships: Record<string, PersistedMembership>;
};

type PersistedRoot = Record<string, PersistedUserState>;

const listCache = new Map<string, ListCacheEntry>();
let persistedRoot: PersistedRoot | null = null;

function makeCacheKey(userId: string, setNumber: string): string {
  return `${userId}::${setNumber}`;
}

function readPersistedRoot(): PersistedRoot {
  if (persistedRoot) return persistedRoot;
  if (typeof window === 'undefined') {
    persistedRoot = {};
    return persistedRoot;
  }
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    persistedRoot = raw ? (JSON.parse(raw) as PersistedRoot) : {};
  } catch {
    persistedRoot = {};
  }
  return persistedRoot!;
}

function writePersistedRoot(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(persistedRoot ?? {})
    );
  } catch {
    // Swallow storage failures (private browsing, quota, etc.).
  }
}

function getPersistedUserState(userId: string): PersistedUserState | null {
  if (!userId) return null;
  const root = readPersistedRoot();
  return root[userId] ?? null;
}

function updatePersistedUserState(
  userId: string,
  updater: (prev: PersistedUserState | null) => PersistedUserState | null
): void {
  if (!userId) return;
  const root = readPersistedRoot();
  const prev = root[userId] ?? null;
  const next = updater(prev);
  if (next) {
    root[userId] = next;
  } else {
    delete root[userId];
  }
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

function getCachedEntry(key: string | null): ListCacheEntry | null {
  if (!key) return null;
  const entry = listCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.updatedAt > LIST_CACHE_TTL_MS) {
    listCache.delete(key);
    return null;
  }
  return entry;
}

function writeCacheEntry(key: string, entry: ListCacheEntry) {
  listCache.set(key, entry);
}

export function useSetLists({ setNumber }: UseSetListsArgs): UseSetListsResult {
  const { user } = useSupabaseUser();
  const [lists, setLists] = useState<UserList[]>([]);
  const [selectedListIds, setSelectedListIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const normSetNum = useMemo(() => setNumber.trim(), [setNumber]);

  const cacheKey = useMemo(
    () => (user ? makeCacheKey(user.id, normSetNum) : null),
    [user, normSetNum]
  );

  useEffect(() => {
    if (!user) {
      setLists([]);
      setSelectedListIds([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    const persisted = getPersistedUserState(user.id);
    if (!persisted) {
      return;
    }

    if (persisted.lists.length > 0) {
      setLists(prev => (prev.length === 0 ? persisted.lists : prev));
      setIsLoading(false);
    }
    const membership = persisted.memberships[normSetNum];
    if (membership && membership.ids.length > 0) {
      setSelectedListIds(prev => (prev.length === 0 ? membership.ids : prev));
    }
  }, [user, normSetNum]);

  useEffect(() => {
    if (!user) {
      return;
    }

    let cancelled = false;
    const supabase = getSupabaseBrowserClient();
    const cached = getCachedEntry(cacheKey);

    if (cached) {
      setLists(cached.lists);
      setSelectedListIds(cached.selectedIds);
      setIsLoading(false);
    } else {
      setIsLoading(true);
    }

    const run = async () => {
      setError(null);
      try {
        const [listsRes, membershipRes] = await Promise.all([
          supabase
            .from('user_lists')
            .select<'id,name,is_system'>('id,name,is_system')
            .eq('user_id', user.id)
            .order('name', { ascending: true }),
          supabase
            .from('user_list_items')
            .select<'list_id'>('list_id')
            .eq('user_id', user.id)
            .eq('item_type', SET_ITEM_TYPE)
            .eq('set_num', normSetNum),
        ]);

        if (cancelled) return;

        if (listsRes.error || membershipRes.error) {
          console.error('useSetLists query error', {
            listsError: listsRes.error,
            membershipError: membershipRes.error,
          });
          const message =
            listsRes.error?.message ??
            membershipRes.error?.message ??
            'Failed to load lists';
          setError(message);
          return;
        }

        const listRows = (listsRes.data ?? []) as Array<Tables<'user_lists'>>;
        const membershipRows = (membershipRes.data ?? []) as Array<
          Tables<'user_list_items'>
        >;

        // Include system lists (like Wishlist) so they appear in the modal
        const normalizedLists = listRows.map(row => ({
          id: row.id,
          name: row.name,
          isSystem: row.is_system,
        }));
        const selected = membershipRows.map(row => row.list_id);

        setLists(normalizedLists);
        setSelectedListIds(selected);

        if (cacheKey) {
          writeCacheEntry(cacheKey, {
            lists: normalizedLists,
            selectedIds: selected,
            updatedAt: Date.now(),
          });
        }

        const now = Date.now();
        updatePersistedUserState(user.id, prev => {
          const nextMemberships = {
            ...(prev?.memberships ?? {}),
            [normSetNum]: { ids: selected, updatedAt: now },
          };
          return {
            lists: normalizedLists,
            listsUpdatedAt: now,
            memberships: trimMemberships(nextMemberships),
          };
        });
      } catch (err) {
        if (!cancelled) {
          console.error('useSetLists load failed', err);
          const message =
            (err as { message?: string })?.message ?? 'Failed to load lists';
          setError(message);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [user, normSetNum, cacheKey]);

  const toggleList = (listId: string) => {
    if (!user) return;

    const supabase = getSupabaseBrowserClient();
    const isSelected = selectedListIds.includes(listId);
    const nextSelected = isSelected
      ? selectedListIds.filter(id => id !== listId)
      : [...selectedListIds, listId];

    setSelectedListIds(nextSelected);

    if (cacheKey) {
      const existing = listCache.get(cacheKey);
      if (existing) {
        listCache.set(cacheKey, {
          ...existing,
          selectedIds: nextSelected,
          updatedAt: Date.now(),
        });
      }
    }

    const now = Date.now();
    updatePersistedUserState(user.id, prev => {
      const listsState = prev?.lists ?? lists;
      const memberships = {
        ...(prev?.memberships ?? {}),
        [normSetNum]: { ids: nextSelected, updatedAt: now },
      };
      return {
        lists: listsState,
        listsUpdatedAt: prev?.listsUpdatedAt ?? now,
        memberships: trimMemberships(memberships),
      };
    });

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

    const exists = lists.some(
      list => list.name.toLowerCase() == trimmed.toLowerCase()
    );
    if (exists) {
      setError('A list with that name already exists.');
      return;
    }

    const supabase = getSupabaseBrowserClient();
    const tempId = `temp-${Date.now().toString(36)}`;
    const optimistic: UserList = {
      id: tempId,
      name: trimmed,
      isSystem: false,
    };

    setLists(prev => {
      const next = [...prev, optimistic];
      if (cacheKey) {
        const existing = listCache.get(cacheKey);
        listCache.set(cacheKey, {
          lists: next,
          selectedIds: existing?.selectedIds ?? selectedListIds,
          updatedAt: Date.now(),
        });
      }
      if (user) {
        const now = Date.now();
        updatePersistedUserState(user.id, prevState => {
          const memberships = prevState?.memberships ?? {};
          return {
            lists: next,
            listsUpdatedAt: now,
            memberships: trimMemberships(memberships),
          };
        });
      }
      return next;
    });

    void supabase
      .from('user_lists')
      .insert({
        user_id: user.id,
        name: trimmed,
        is_system: false,
      })
      .select<'id,name,is_system'>('id,name,is_system')
      .single()
      .then(async ({ data, error: err }) => {
        if (err || !data) {
          console.error('Failed to create list', err);
          setError('Failed to create list');
          setLists(prev => prev.filter(list => list.id !== tempId));
          return;
        }

        const created: UserList = {
          id: data.id,
          name: data.name,
          isSystem: data.is_system,
        };

        setLists(prev => {
          const next = prev
            .filter(list => list.id !== tempId)
            .concat(created)
            .sort((a, b) => a.name.localeCompare(b.name));
          if (cacheKey) {
            const existing = listCache.get(cacheKey);
            listCache.set(cacheKey, {
              lists: next,
              selectedIds: existing?.selectedIds ?? selectedListIds,
              updatedAt: Date.now(),
            });
          }
          if (user) {
            const now = Date.now();
            updatePersistedUserState(user.id, prevState => {
              const memberships = prevState?.memberships ?? {};
              return {
                lists: next,
                listsUpdatedAt: now,
                memberships: trimMemberships(memberships),
              };
            });
          }
          return next;
        });

        setSelectedListIds(prev => {
          const nextSelected = [...prev, created.id];
          if (cacheKey) {
            const existing = listCache.get(cacheKey);
            listCache.set(cacheKey, {
              lists: existing?.lists ?? lists,
              selectedIds: nextSelected,
              updatedAt: Date.now(),
            });
          }
          if (user) {
            const now = Date.now();
            updatePersistedUserState(user.id, prevState => {
              const nextMemberships = {
                ...(prevState?.memberships ?? {}),
                [normSetNum]: { ids: nextSelected, updatedAt: now },
              };
              return {
                lists: prevState?.lists ?? lists,
                listsUpdatedAt: prevState?.listsUpdatedAt ?? now,
                memberships: trimMemberships(nextMemberships),
              };
            });
          }
          return nextSelected;
        });

        const innerSupabase = getSupabaseBrowserClient();
        void innerSupabase
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
      });
  };

  return {
    lists,
    selectedListIds,
    isLoading,
    error,
    toggleList,
    createList,
  };
}
