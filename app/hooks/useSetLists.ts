'use client';

import { useCallback, useMemo } from 'react';
import { updateCollectionCacheForToggle } from '@/app/hooks/useCollectionSets';
import {
  useListMembership,
  type UserList,
  type UseListMembershipResult,
} from '@/app/hooks/useListMembership';
import { getSupabaseBrowserClient } from '@/app/lib/supabaseClient';
import { logger } from '@/lib/metrics';

export type { UserList } from '@/app/hooks/useListMembership';

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

/**
 * When a set is added to a list, also add its minifigs to the same list.
 * Best-effort — errors are logged but don't surface to the user.
 */
async function syncSetMinifigsToList(
  userId: string,
  setNum: string,
  listId: string
): Promise<void> {
  const supabase = getSupabaseBrowserClient();

  // Find the latest inventory for this set
  const { data: inventories, error: invErr } = await supabase
    .from('rb_inventories')
    .select('id, version')
    .eq('set_num', setNum)
    .not('set_num', 'like', 'fig-%');

  if (invErr || !inventories?.length) return;

  // Pick the latest version
  let latest = inventories[0];
  for (const inv of inventories) {
    if ((inv.version ?? -1) > (latest.version ?? -1)) latest = inv;
  }

  // Get minifigs from that inventory
  const { data: invMinifigs, error: imErr } = await supabase
    .from('rb_inventory_minifigs')
    .select('fig_num')
    .eq('inventory_id', latest.id);

  if (imErr || !invMinifigs?.length) return;

  const figNums = [...new Set(invMinifigs.map(im => im.fig_num))];

  // Map RB fig_num → BL minifig ID
  const { data: rbMinifigs } = await supabase
    .from('rb_minifigs')
    .select('fig_num, bl_minifig_id')
    .in('fig_num', figNums);

  const blIds = new Set<string>();
  for (const m of rbMinifigs ?? []) {
    blIds.add(m.bl_minifig_id ?? m.fig_num);
  }
  // Include any fig_nums that didn't have an rb_minifigs row
  for (const fn of figNums) {
    if (!(rbMinifigs ?? []).some(m => m.fig_num === fn)) {
      blIds.add(fn);
    }
  }

  if (blIds.size === 0) return;

  const rows = [...blIds].map(minifigId => ({
    user_id: userId,
    list_id: listId,
    item_type: 'minifig' as const,
    minifig_id: minifigId,
  }));

  const CHUNK_SIZE = 200;
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    const { error: upsertErr } = await supabase
      .from('user_list_items')
      .upsert(chunk, {
        onConflict: 'user_id,list_id,item_type,minifig_id',
        ignoreDuplicates: true,
      });

    if (upsertErr) {
      logger.error('list.sync_minifigs_failed', { error: upsertErr.message });
    }
  }
}

export function useSetLists({ setNumber }: UseSetListsArgs): UseSetListsResult {
  const normSetNum = useMemo(() => setNumber.trim(), [setNumber]);

  const onToggleAdd = useCallback(
    (userId: string, itemId: string, listId: string) => {
      updateCollectionCacheForToggle(userId, itemId, listId, true);
      void syncSetMinifigsToList(userId, itemId, listId);
    },
    []
  );

  const onToggleRemove = useCallback(
    (userId: string, itemId: string, listId: string) => {
      updateCollectionCacheForToggle(userId, itemId, listId, false);
    },
    []
  );

  const membership: UseListMembershipResult = useListMembership(
    'set',
    normSetNum,
    'set_num',
    onToggleAdd,
    onToggleRemove
  );

  return {
    lists: membership.lists,
    selectedListIds: membership.selectedListIds,
    isLoading: membership.listsLoading,
    error: membership.listsError,
    toggleList: membership.toggleList,
    createList: membership.createList,
    renameList: membership.renameList,
    deleteList: membership.deleteList,
    showUpgradeModal: membership.showListUpgradeModal,
    dismissUpgradeModal: membership.dismissListUpgradeModal,
  };
}
