'use client';

import { useQuery } from '@tanstack/react-query';

type GapCloserSet = {
  setNum: string;
  name: string;
  imageUrl: string | null;
  numParts: number;
  coverageGainPct: number;
};

type GapCloserResult = {
  targetSetNum: string;
  missingPartsCount: number;
  totalPartsCount: number;
  gaps: GapCloserSet[];
};

async function fetchGapClosers(
  setNum: string,
  signal?: AbortSignal
): Promise<GapCloserResult> {
  const res = await fetch(`/api/can-build/${encodeURIComponent(setNum)}/gap`, {
    signal: signal ?? null,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? 'gap_closers_failed');
  }

  return res.json() as Promise<GapCloserResult>;
}

export type { GapCloserSet, GapCloserResult };

export function useGapClosers(setNum: string | null) {
  return useQuery<GapCloserResult>({
    queryKey: ['gap-closers', setNum],
    queryFn: ({ signal }) => fetchGapClosers(setNum!, signal),
    staleTime: 5 * 60_000,
    gcTime: 15 * 60_000,
    enabled: !!setNum,
  });
}
