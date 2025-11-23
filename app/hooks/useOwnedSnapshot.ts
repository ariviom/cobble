'use client';

import { useMemo } from 'react';
import { useOwnedStore } from '@/app/store/owned';

export function useOwnedSnapshot(
  setNumber: string,
  keys: string[]
): Record<string, number> {
  const version = useOwnedStore(state => state._version);
  const getOwned = useOwnedStore(state => state.getOwned);

  const ownedByKey = useMemo(() => {
    const result: Record<string, number> = {};
    for (const key of keys) {
      result[key] = getOwned(setNumber, key);
    }
    return result;
  }, [getOwned, setNumber, keys, version]);

  return ownedByKey;
}



