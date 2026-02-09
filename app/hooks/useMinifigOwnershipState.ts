'use client';

import { useMinifigLists } from '@/app/hooks/useMinifigLists';
import { useMinifigStatus } from '@/app/hooks/useMinifigStatus';
import { useSupabaseUser } from '@/app/hooks/useSupabaseUser';

export type MinifigOwnershipState = {
  status: { owned: boolean };
  toggleOwned: () => void;
  lists: { id: string; name: string; isSystem: boolean }[];
  selectedListIds: string[];
  listsLoading: boolean;
  listsError: string | null;
  toggleList: (listId: string) => void;
  createList: (name: string) => void;
  renameList: (listId: string, newName: string) => void;
  deleteList: (listId: string) => void;
  isAuthenticated: boolean;
  isAuthenticating: boolean;
};

type UseMinifigOwnershipStateArgs = {
  figNum: string;
};

export function useMinifigOwnershipState({
  figNum,
}: UseMinifigOwnershipStateArgs): MinifigOwnershipState {
  const { user, isLoading } = useSupabaseUser();
  const { status, toggleOwned } = useMinifigStatus({ figNum });
  const {
    lists,
    selectedListIds,
    isLoading: listsLoading,
    error: listsError,
    toggleList,
    createList,
    renameList,
    deleteList,
  } = useMinifigLists({ figNum });

  return {
    status,
    toggleOwned,
    lists,
    selectedListIds,
    listsLoading,
    listsError,
    toggleList,
    createList,
    renameList,
    deleteList,
    isAuthenticated: !!user,
    isAuthenticating: isLoading,
  };
}
