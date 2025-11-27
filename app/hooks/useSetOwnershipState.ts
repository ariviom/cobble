'use client';

import { useHydrateUserSets } from '@/app/hooks/useHydrateUserSets';
import {
  useSetCollections,
  type UserCollection,
} from '@/app/hooks/useSetCollections';
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
  collections: UserCollection[];
  selectedCollectionIds: string[];
  collectionsLoading: boolean;
  collectionsError: string | null;
  toggleCollection: (collectionId: string) => void;
  createCollection: (name: string) => void;
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
    year,
    imageUrl,
    numParts,
    themeId,
  });
  const {
    collections,
    selectedCollectionIds,
    isLoading: collectionsLoading,
    error: collectionsError,
    toggleCollection,
    createCollection,
  } = useSetCollections({ setNumber });

  return {
    status,
    toggleStatus,
    collections,
    selectedCollectionIds,
    collectionsLoading,
    collectionsError,
    toggleCollection,
    createCollection,
    isAuthenticated: !!user,
    isAuthenticating: isLoading,
  };
}

