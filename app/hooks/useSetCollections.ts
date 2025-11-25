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

    const run = async () => {
      setIsLoading(true);
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

        setCollections(
          colRows.map(row => ({
            id: row.id,
            name: row.name,
            isSystem: row.is_system,
          }))
        );
        setSelectedIds(memRows.map(row => row.collection_id));
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
  }, [user, normSetNum]);

  const toggleCollection = (collectionId: string) => {
    if (!user) return;

    const supabase = getSupabaseBrowserClient();
    const isSelected = selectedIds.includes(collectionId);
    const nextSelected = isSelected
      ? selectedIds.filter(id => id !== collectionId)
      : [...selectedIds, collectionId];
    setSelectedIds(nextSelected);

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
    setCollections(prev => [...prev, optimistic]);

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

        setCollections(prev =>
          prev
            .filter(c => c.id !== tempId)
            .concat(created)
            .sort((a, b) => a.name.localeCompare(b.name))
        );

        // Automatically add current set to the new collection.
        setSelectedIds(prev => [...prev, created.id]);
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


