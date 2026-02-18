'use client';

import { useEffect, useMemo } from 'react';
import {
  useOwnedStore,
  readOwnedCache,
  type OwnedState,
} from '@/app/store/owned';

export type UseOwnedSnapshotResult = {
  ownedByKey: Record<string, number>;
  isHydrated: boolean;
  isStorageAvailable: boolean;
};

export function useOwnedSnapshot(setNumber: string): UseOwnedSnapshotResult {
  const version = useOwnedStore((state: OwnedState) => state._version);
  const hydratedSets = useOwnedStore(
    (state: OwnedState) => state._hydratedSets
  );
  const storageAvailable = useOwnedStore(
    (state: OwnedState) => state._storageAvailable
  );
  const hydrateFromIndexedDB = useOwnedStore(
    (state: OwnedState) => state.hydrateFromIndexedDB
  );

  // Trigger IndexedDB hydration on mount
  useEffect(() => {
    void hydrateFromIndexedDB(setNumber);
  }, [setNumber, hydrateFromIndexedDB]);

  const isHydrated = hydratedSets.has(setNumber);

  // O(1) — direct Map lookup instead of O(n) key-by-key rebuild
  const ownedByKey = useMemo(() => {
    // Touch version so React understands this dependency is intentional:
    // we want to recompute whenever the owned store changes.
    void version;
    return readOwnedCache(setNumber);
  }, [setNumber, version]);

  return {
    ownedByKey,
    isHydrated,
    isStorageAvailable: storageAvailable,
  };
}
