'use client';

import { useSupabaseUser } from '@/app/hooks/useSupabaseUser';
import { getSupabaseBrowserClient } from '@/app/lib/supabaseClient';
import type { Tables } from '@/supabase/types';
import { useEffect, useState } from 'react';

export type MinifigUserList = {
  id: string;
  name: string;
  isSystem: boolean;
};

export type UseMinifigListsResult = {
  lists: MinifigUserList[];
  selectedListIds: string[];
  isLoading: boolean;
  error: string | null;
  toggleList: (listId: string) => void;
  createList: (name: string) => void;
};

type UseMinifigListsArgs = {
  figNum: string;
};

const MINIFIG_ITEM_TYPE = 'minifig' as const;

export function useMinifigLists({
  figNum,
}: UseMinifigListsArgs): UseMinifigListsResult {
  const { user } = useSupabaseUser();
  const [lists, setLists] = useState<MinifigUserList[]>([]);
  const [selectedListIds, setSelectedListIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setLists([]);
      setSelectedListIds([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    const supabase = getSupabaseBrowserClient();

    const run = async () => {
      setError(null);
      setIsLoading(true);
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
            .eq('item_type', MINIFIG_ITEM_TYPE)
            .eq('minifig_id', figNum),
        ]);

        if (cancelled) return;

        if (listsRes.error || membershipRes.error) {
          console.error('useMinifigLists query error', {
            listsError: listsRes.error,
            membershipError: membershipRes.error,
          });
          const message =
            listsRes.error?.message ??
            membershipRes.error?.message ??
            'Failed to load lists';
          setError(message);
          setLists([]);
          setSelectedListIds([]);
          setIsLoading(false);
          return;
        }

        const listRows = (listsRes.data ?? []) as Array<Tables<'user_lists'>>;
        const membershipRows = (membershipRes.data ??
          []) as Array<Tables<'user_list_items'>>;

        const normalizedLists: MinifigUserList[] = listRows
          .map(row => ({
            id: row.id,
            name: row.name,
            isSystem: row.is_system,
          }))
          .filter(list => !list.isSystem);

        const selected = membershipRows.map(row => row.list_id);

        setLists(normalizedLists);
        setSelectedListIds(selected);
        setIsLoading(false);
      } catch (err) {
        if (!cancelled) {
          console.error('useMinifigLists load failed', err);
          const message =
            (err as { message?: string })?.message ??
            'Failed to load lists';
          setError(message);
          setLists([]);
          setSelectedListIds([]);
          setIsLoading(false);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [user, figNum]);

  const toggleList = (listId: string) => {
    if (!user) return;

    const supabase = getSupabaseBrowserClient();
    const isSelected = selectedListIds.includes(listId);
    const nextSelected = isSelected
      ? selectedListIds.filter(id => id !== listId)
      : [...selectedListIds, listId];

    setSelectedListIds(nextSelected);

    if (isSelected) {
      void supabase
        .from('user_list_items')
        .delete()
        .eq('user_id', user.id)
        .eq('list_id', listId)
        .eq('item_type', MINIFIG_ITEM_TYPE)
        .eq('minifig_id', figNum)
        .then(({ error: err }) => {
          if (err) {
            console.error('Failed to remove minifig from list', err);
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
            item_type: MINIFIG_ITEM_TYPE,
            minifig_id: figNum,
          },
          { onConflict: 'user_id,list_id,item_type,minifig_id' }
        )
        .then(({ error: err }) => {
          if (err) {
            console.error('Failed to add minifig to list', err);
            setError('Failed to update lists');
          }
        });
    }
  };

  const createList = (name: string) => {
    const trimmed = name.trim();
    if (!user || !trimmed) return;

    const exists = lists.some(
      list => list.name.toLowerCase() === trimmed.toLowerCase()
    );
    if (exists) {
      setError('A list with that name already exists.');
      return;
    }

    const supabase = getSupabaseBrowserClient();
    const tempId = `temp-${Date.now().toString(36)}`;
    const optimistic: MinifigUserList = {
      id: tempId,
      name: trimmed,
      isSystem: false,
    };

    setLists(prev => [...prev, optimistic]);

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

        const created: MinifigUserList = {
          id: data.id,
          name: data.name,
          isSystem: data.is_system,
        };

        setLists(prev =>
          prev
            .filter(list => list.id !== tempId)
            .concat(created)
            .sort((a, b) => a.name.localeCompare(b.name))
        );

        setSelectedListIds(prev => [...prev, created.id]);

        const innerSupabase = getSupabaseBrowserClient();
        void innerSupabase
          .from('user_list_items')
          .upsert(
            {
              user_id: user.id,
              list_id: created.id,
              item_type: MINIFIG_ITEM_TYPE,
              minifig_id: figNum,
            },
            { onConflict: 'user_id,list_id,item_type,minifig_id' }
          )
          .then(({ error: membershipError }) => {
            if (membershipError) {
              console.error(
                'Failed to add minifig to new list',
                membershipError
              );
              setError('Failed to add minifig to new list');
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





