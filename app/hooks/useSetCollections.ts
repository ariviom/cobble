'use client';

import { useSupabaseUser } from '@/app/hooks/useSupabaseUser';
import { getSupabaseBrowserClient } from '@/app/lib/supabaseClient';
import type { Tables } from '@/supabase/types';
import { useEffect, useMemo, useState } from 'react';

export type UserCollection = {
  id: string;
  name: string;
  isSystem: boolean;
};

export type UseSetCollectionsResult = {
  collections: UserCollection[];
  selectedCollectionIds: string[];
  isLoading: boolean;
  error: string | null;
  toggleCollection: (collectionId: string) => void;
  createCollection: (name: string) => void;
};

type UseSetCollectionsArgs = {
  setNumber: string;
};

const COLLECTION_CACHE_TTL_MS = 5 * 60 * 1000;
const MEMBERSHIP_CACHE_LIMIT = 40;
const STORAGE_KEY = 'quarry_set_collections_cache_v2';

type CollectionsCacheEntry = {
  collections: UserCollection[];
  selectedIds: string[];
  updatedAt: number;
};

type PersistedMembership = {
  ids: string[];
  updatedAt: number;
};

type PersistedUserState = {
  collections: UserCollection[];
  collectionsUpdatedAt: number;
  memberships: Record<string, PersistedMembership>;
};

type PersistedRoot = Record<string, PersistedUserState>;

const collectionsCache = new Map<string, CollectionsCacheEntry>();
let persistedRoot: PersistedRoot | null = null;

function makeCacheKey(userId: string, setNumber: string): string {
  return `${userId}::${setNumber}`;
}

function getCachedEntry(key: string | null): CollectionsCacheEntry | null {
  if (!key) return null;
  const entry = collectionsCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.updatedAt > COLLECTION_CACHE_TTL_MS) {
    collectionsCache.delete(key);
    return null;
  }
  return entry;
}

function writeCacheEntry(key: string, entry: CollectionsCacheEntry) {
  collectionsCache.set(key, entry);
}

function readPersistedRoot(): PersistedRoot {
  if (persistedRoot) {
    return persistedRoot;
  }
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

function writePersistedRoot() {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(persistedRoot ?? {})
    );
  } catch {
    // ignore storage errors
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
) {
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

export function useSetCollections({
  setNumber,
}: UseSetCollectionsArgs): UseSetCollectionsResult {
  const { user } = useSupabaseUser();
  const [collections, setCollections] = useState<UserCollection[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const normSetNum = useMemo(
    () => setNumber.trim(),
    [setNumber]
  );

  const cacheKey = useMemo(
    () => (user ? makeCacheKey(user.id, normSetNum) : null),
    [user, normSetNum]
  );

  useEffect(() => {
    if (!user) {
      return;
    }
    const persisted = getPersistedUserState(user.id);
    if (!persisted) {
      return;
    }
    if (persisted.collections.length > 0 && collections.length === 0) {
      setCollections(persisted.collections);
      setIsLoading(false);
    }
    const membership = persisted.memberships[normSetNum];
    if (membership && membership.ids.length > 0 && selectedIds.length === 0) {
      setSelectedIds(membership.ids);
    }
  }, [user, normSetNum, collections.length, selectedIds.length]);

  useEffect(() => {
    if (!user) {
      setCollections([]);
      setSelectedIds([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    const supabase = getSupabaseBrowserClient();
    const cached = getCachedEntry(cacheKey);
    if (cached) {
      setCollections(cached.collections);
      setSelectedIds(cached.selectedIds);
      setIsLoading(false);
    } else {
      setIsLoading(true);
    }

    const run = async () => {
      setError(null);
      try {
        const [collectionsRes, membershipRes] = await Promise.all([
          supabase
            .from('user_collections')
            .select<'id,name,is_system'>('id,name,is_system')
            .eq('user_id', user.id)
            .order('name', { ascending: true }),
          supabase
            .from('user_collection_sets')
            .select<'collection_id'>('collection_id')
            .eq('user_id', user.id)
            .eq('set_num', normSetNum),
        ]);

        if (cancelled) return;

        if (collectionsRes.error || membershipRes.error) {
          const details = {
            collectionsError: collectionsRes.error ?? null,
            membershipError: membershipRes.error ?? null,
          };
          console.error('useSetCollections query error', details);
          const message =
            collectionsRes.error?.message ??
            membershipRes.error?.message ??
            'Failed to load collections';
          setError(message);
          return;
        }

        const colRows = (collectionsRes.data ??
          []) as Array<Tables<'user_collections'>>;
        const memRows = (membershipRes.data ??
          []) as Array<Tables<'user_collection_sets'>>;

        const normalizedCollections = colRows.map(row => ({
          id: row.id,
          name: row.name,
          isSystem: row.is_system,
        }));
        const selected = memRows.map(row => row.collection_id);

        setCollections(normalizedCollections);
        setSelectedIds(selected);
        if (cacheKey) {
          writeCacheEntry(cacheKey, {
            collections: normalizedCollections,
            selectedIds: selected,
            updatedAt: Date.now(),
          });
        }
        if (user) {
          const now = Date.now();
          updatePersistedUserState(user.id, prev => {
            const nextMemberships = {
              ...(prev?.memberships ?? {}),
              [normSetNum]: { ids: selected, updatedAt: now },
            };
            return {
              collections: normalizedCollections,
              collectionsUpdatedAt: now,
              memberships: trimMemberships(nextMemberships),
            };
          });
        }
      } catch (err) {
        if (!cancelled) {
          console.error('useSetCollections load failed', err);
          const message =
            (err as { message?: string })?.message ??
            'Failed to load collections';
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

  const toggleCollection = (collectionId: string) => {
    if (!user) return;

    const supabase = getSupabaseBrowserClient();
    const isSelected = selectedIds.includes(collectionId);
    const nextSelected = isSelected
      ? selectedIds.filter(id => id !== collectionId)
      : [...selectedIds, collectionId];
    setSelectedIds(nextSelected);
    if (cacheKey) {
      const existing = collectionsCache.get(cacheKey);
      if (existing) {
        collectionsCache.set(cacheKey, {
          ...existing,
          selectedIds: nextSelected,
          updatedAt: Date.now(),
        });
      }
    }
    if (user) {
      const now = Date.now();
      updatePersistedUserState(user.id, prev => {
        const collectionsState = prev?.collections ?? collections;
        const memberships = {
          ...(prev?.memberships ?? {}),
          [normSetNum]: { ids: nextSelected, updatedAt: now },
        };
        return {
          collections: collectionsState,
          collectionsUpdatedAt: prev?.collectionsUpdatedAt ?? now,
          memberships: trimMemberships(memberships),
        };
      });
    }

    if (isSelected) {
      // Optimistic remove
      void supabase
        .from('user_collection_sets')
        .delete()
        .eq('user_id', user.id)
        .eq('collection_id', collectionId)
        .eq('set_num', normSetNum)
        .then(({ error: err }) => {
          if (err) {
            console.error('Failed to remove from collection', err);
            setError('Failed to update collections');
          }
        });
    } else {
      // Optimistic add
      void supabase
        .from('user_collection_sets')
        .upsert(
          {
            user_id: user.id,
            collection_id: collectionId,
            set_num: normSetNum,
          },
          { onConflict: 'collection_id,set_num' }
        )
        .then(({ error: err }) => {
          if (err) {
            console.error('Failed to add to collection', err);
            setError('Failed to update collections');
          }
        });
    }
  };

  const createCollection = (name: string) => {
    const trimmed = name.trim();
    if (!user || !trimmed) return;

    const exists = collections.some(
      c => c.name.toLowerCase() === trimmed.toLowerCase()
    );
    if (exists) {
      setError('A collection with that name already exists.');
      return;
    }

    const supabase = getSupabaseBrowserClient();
    // Optimistic local add with temporary id
    const tempId = `temp-${Date.now().toString(36)}`;
    const optimistic: UserCollection = {
      id: tempId,
      name: trimmed,
      isSystem: false,
    };
    setCollections(prev => {
      const next = [...prev, optimistic];
      if (cacheKey) {
        const existing = collectionsCache.get(cacheKey);
        collectionsCache.set(cacheKey, {
          collections: next,
          selectedIds: existing?.selectedIds ?? selectedIds,
          updatedAt: Date.now(),
        });
      }
      if (user) {
        const now = Date.now();
        updatePersistedUserState(user.id, prevState => {
          const memberships = prevState?.memberships ?? {};
          return {
            collections: next,
            collectionsUpdatedAt: now,
            memberships: trimMemberships(memberships),
          };
        });
      }
      return next;
    });

    void supabase
      .from('user_collections')
      .insert({
        user_id: user.id,
        name: trimmed,
        is_system: false,
      })
      .select<'id,name,is_system'>('id,name,is_system')
      .single()
      .then(async ({ data, error: err }) => {
        if (err || !data) {
          console.error('Failed to create collection', err);
          setError('Failed to create collection');
          // Roll back optimistic entry
          setCollections(prev =>
            prev.filter(c => c.id !== tempId)
          );
          return;
        }

        const created: UserCollection = {
          id: data.id,
          name: data.name,
          isSystem: data.is_system,
        };

        setCollections(prev => {
          const next = prev
            .filter(c => c.id !== tempId)
            .concat(created)
            .sort((a, b) => a.name.localeCompare(b.name));
          if (cacheKey) {
            const existing = collectionsCache.get(cacheKey);
            collectionsCache.set(cacheKey, {
              collections: next,
              selectedIds: existing?.selectedIds ?? selectedIds,
              updatedAt: Date.now(),
            });
          }
          if (user) {
            const now = Date.now();
            updatePersistedUserState(user.id, prevState => {
              const memberships = prevState?.memberships ?? {};
              return {
                collections: next,
                collectionsUpdatedAt: now,
                memberships: trimMemberships(memberships),
              };
            });
          }
          return next;
        });

        // Automatically add current set to the new collection.
        setSelectedIds(prev => {
          const nextSelected = [...prev, created.id];
          if (cacheKey) {
            const existing = collectionsCache.get(cacheKey);
            collectionsCache.set(cacheKey, {
              collections: existing?.collections ?? collections,
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
                collections: prevState?.collections ?? collections,
                collectionsUpdatedAt: prevState?.collectionsUpdatedAt ?? now,
                memberships: trimMemberships(nextMemberships),
              };
            });
          }
          return nextSelected;
        });
        const supabaseInner = getSupabaseBrowserClient();
        void supabaseInner
          .from('user_collection_sets')
          .upsert(
            {
              user_id: user.id,
              collection_id: created.id,
              set_num: normSetNum,
            },
            { onConflict: 'collection_id,set_num' }
          )
          .then(({ error: membershipError }) => {
            if (membershipError) {
              console.error(
                'Failed to add set to new collection',
                membershipError
              );
              setError('Failed to add set to new collection');
            }
          });
      });
  };

  return {
    collections,
    selectedCollectionIds: selectedIds,
    isLoading,
    error,
    toggleCollection,
    createCollection,
  };
}


