'use client';

import { useHydrateUserSets } from '@/app/hooks/useHydrateUserSets';
import { useSetLists, type UserList } from '@/app/hooks/useSetLists';
import { useSetStatus } from '@/app/hooks/useSetStatus';
import { useSupabaseUser } from '@/app/hooks/useSupabaseUser';
import type { SetStatus } from '@/app/store/user-sets';

type UseSetOwnershipStateArgs = {
  setNumber: string;
  name: string;
  year?: number;
  imageUrl: string | null;
  numParts?: number;
  themeId?: number | null;
};

export type SetOwnershipState = {
  status: SetStatus;
  toggleOwned: () => void;
  lists: UserList[];
  selectedListIds: string[];
  listsLoading: boolean;
  listsError: string | null;
  toggleList: (listId: string) => void;
  createList: (name: string) => void;
  renameList: (listId: string, newName: string) => void;
  deleteList: (listId: string) => void;
  isAuthenticated: boolean;
  isAuthenticating: boolean;
  showListUpgradeModal: boolean;
  dismissListUpgradeModal: () => void;
};

export function useSetOwnershipState({
  setNumber,
  name,
  year,
  imageUrl,
  numParts,
  themeId,
}: UseSetOwnershipStateArgs): SetOwnershipState {
  useHydrateUserSets();
  const { user, isLoading } = useSupabaseUser();
  const { status, toggleOwned } = useSetStatus({
    setNumber,
    name,
    imageUrl,
    ...(typeof year === 'number' ? { year } : {}),
    ...(typeof numParts === 'number' ? { numParts } : {}),
    ...(typeof themeId === 'number' ? { themeId } : {}),
  });
  const {
    lists,
    selectedListIds,
    isLoading: listsLoading,
    error: listsError,
    toggleList,
    createList,
    renameList,
    deleteList,
    showUpgradeModal: showListUpgradeModal,
    dismissUpgradeModal: dismissListUpgradeModal,
  } = useSetLists({ setNumber });

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
    showListUpgradeModal,
    dismissListUpgradeModal,
  };
}
