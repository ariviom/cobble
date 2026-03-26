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
  // Select a boolean for this specific set — avoids re-renders when other sets hydrate.
  const isHydrated = useOwnedStore(
    (state: OwnedState) => setNumber in state._hydratedSets
  );
  const storageAvailable = useOwnedStore(
    (state: OwnedState) => state._storageAvailable
  );
  const hydrateFromIndexedDB = useOwnedStore(
    (state: OwnedState) => state.hydrateFromIndexedDB
  );

  // Trigger IndexedDB hydration on mount (or retry after epoch abort).
  // Depends on `version` so that if hydration is aborted by an epoch change
  // (e.g. resetOwnedCache during auth), the version bump re-triggers this effect.
  useEffect(() => {
    if (isHydrated) return;
    void hydrateFromIndexedDB(setNumber);
  }, [setNumber, hydrateFromIndexedDB, isHydrated, version]);

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
