'use client';

import { useMinifigLists } from '@/app/hooks/useMinifigLists';
import { useMinifigStatus } from '@/app/hooks/useMinifigStatus';
import { useSupabaseUser } from '@/app/hooks/useSupabaseUser';

type MinifigOwnershipStatus = 'owned' | 'want' | null;

export type MinifigOwnershipState = {
  status: MinifigOwnershipStatus;
  toggleStatus: (next: Exclude<MinifigOwnershipStatus, null>) => void;
  lists: { id: string; name: string; isSystem: boolean }[];
  selectedListIds: string[];
  listsLoading: boolean;
  listsError: string | null;
  toggleList: (listId: string) => void;
  createList: (name: string) => void;
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
  const { status, toggleStatus } = useMinifigStatus({ figNum });
  const {
    lists,
    selectedListIds,
    isLoading: listsLoading,
    error: listsError,
    toggleList,
    createList,
  } = useMinifigLists({ figNum });

  return {
    status,
    toggleStatus,
    lists,
    selectedListIds,
    listsLoading,
    listsError,
    toggleList,
    createList,
    isAuthenticated: !!user,
    isAuthenticating: isLoading,
  };
}





