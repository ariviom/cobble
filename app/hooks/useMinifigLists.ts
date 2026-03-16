'use client';

import {
  useListMembership,
  type UseListMembershipResult,
} from '@/app/hooks/useListMembership';

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
  renameList: (listId: string, newName: string) => void;
  deleteList: (listId: string) => void;
  showUpgradeModal: boolean;
  dismissUpgradeModal: () => void;
};

type UseMinifigListsArgs = {
  figNum: string;
};

export function useMinifigLists({
  figNum,
}: UseMinifigListsArgs): UseMinifigListsResult {
  const membership: UseListMembershipResult = useListMembership(
    'minifig',
    figNum,
    'minifig_id'
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
