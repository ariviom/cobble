'use client';

import { useHydrateUserSets } from '@/app/hooks/useHydrateUserSets';
import {
  useSetLists,
  type UserList,
} from '@/app/hooks/useSetLists';
import { useSetStatus } from '@/app/hooks/useSetStatus';
import { useSupabaseUser } from '@/app/hooks/useSupabaseUser';
import type { SetStatus, SetStatusKey } from '@/app/store/user-sets';

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
  toggleStatus: (key: SetStatusKey) => void;
  lists: UserList[];
  selectedListIds: string[];
  listsLoading: boolean;
  listsError: string | null;
  toggleList: (listId: string) => void;
  createList: (name: string) => void;
  isAuthenticated: boolean;
  isAuthenticating: boolean;
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
  const { status, toggleStatus } = useSetStatus({
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
  } = useSetLists({ setNumber });

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

