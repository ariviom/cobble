'use client';

import { useEffect, useMemo } from 'react';
import { useOwnedStore, type OwnedState } from '@/app/store/owned';

export type UseOwnedSnapshotResult = {
  ownedByKey: Record<string, number>;
  isHydrated: boolean;
  isStorageAvailable: boolean;
};

export function useOwnedSnapshot(
  setNumber: string,
  keys: string[]
): UseOwnedSnapshotResult {
  const version = useOwnedStore((state: OwnedState) => state._version);
  const hydratedSets = useOwnedStore(
    (state: OwnedState) => state._hydratedSets
  );
  const storageAvailable = useOwnedStore(
    (state: OwnedState) => state._storageAvailable
  );
  const getOwned = useOwnedStore((state: OwnedState) => state.getOwned);
  const hydrateFromIndexedDB = useOwnedStore(
    (state: OwnedState) => state.hydrateFromIndexedDB
  );

  // Trigger IndexedDB hydration on mount
  useEffect(() => {
    void hydrateFromIndexedDB(setNumber);
  }, [setNumber, hydrateFromIndexedDB]);

  const isHydrated = hydratedSets.has(setNumber);

  const ownedByKey = useMemo(() => {
    // Touch version so React Hooks exhaustive-deps understands this dependency
    // is intentional: we want to recompute whenever the owned store changes.
    void version;
    const result: Record<string, number> = {};
    for (const key of keys) {
      result[key] = getOwned(setNumber, key);
    }
    return result;
  }, [getOwned, setNumber, keys, version]);

  return {
    ownedByKey,
    isHydrated,
    isStorageAvailable: storageAvailable,
  };
}
