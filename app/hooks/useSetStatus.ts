'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  EMPTY_SET_STATUS,
  type SetStatus,
  type SetStatusKey,
  type UserSetMeta,
  useUserSetsStore,
} from '@/app/store/user-sets';

type UseSetStatusArgs = {
  setNumber: string;
  name: string;
  year?: number | undefined;
  imageUrl?: string | null | undefined;
  numParts?: number | undefined;
  themeId?: number | null | undefined;
};

type UseSetStatusResult = {
  status: SetStatus;
  toggleStatus: (key: SetStatusKey) => void;
};

export function useSetStatus({
  setNumber,
  name,
  year,
  imageUrl,
  numParts,
  themeId,
}: UseSetStatusArgs): UseSetStatusResult {
  const normKey = useMemo(
    () => setNumber.trim().toLowerCase(),
    [setNumber]
  );

  const rawStatus = useUserSetsStore(state => {
    const entry = state.sets[normKey];
    return entry?.status ?? EMPTY_SET_STATUS;
  });
  const setStatus = useUserSetsStore(state => state.setStatus);

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const status = mounted ? rawStatus : EMPTY_SET_STATUS;

  const meta: UserSetMeta = {
    setNumber,
    name,
    year: typeof year === 'number' ? year : 0,
    imageUrl: imageUrl ?? null,
    numParts: typeof numParts === 'number' ? numParts : 0,
    themeId: typeof themeId === 'number' ? themeId : null,
  };

  const toggleStatus = (key: SetStatusKey) => {
    const nextValue = !status[key];
    setStatus({
      setNumber,
      key,
      value: nextValue,
      meta,
    });
  };

  return { status, toggleStatus };
}


