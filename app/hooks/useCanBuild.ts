'use client';

import { useQuery } from '@tanstack/react-query';

// Types duplicated from canBuild service (server-only module)
type CanBuildFilters = {
  minParts: number;
  maxParts: number;
  minCoverage: number;
  theme: string | null;
  excludeMinifigs: boolean;
  page: number;
  limit: number;
};

type CanBuildSet = {
  setNum: string;
  name: string;
  year: number | null;
  imageUrl: string | null;
  numParts: number;
  themeId: number | null;
  themeName: string | null;
  coveragePct: number;
};

type CanBuildResult = {
  sets: CanBuildSet[];
  total: number;
  totalPieces: number;
};

async function fetchCanBuild(
  filters: CanBuildFilters,
  signal?: AbortSignal
): Promise<CanBuildResult> {
  const params = new URLSearchParams({
    minParts: String(filters.minParts),
    maxParts: String(filters.maxParts),
    minCoverage: String(filters.minCoverage),
    excludeMinifigs: String(filters.excludeMinifigs),
    page: String(filters.page),
    limit: String(filters.limit),
  });
  if (filters.theme) {
    params.set('theme', filters.theme);
  }

  const res = await fetch(`/api/can-build?${params}`, {
    signal: signal ?? null,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? 'can_build_failed');
  }

  return res.json() as Promise<CanBuildResult>;
}

export type { CanBuildFilters, CanBuildSet, CanBuildResult };

export function useCanBuild(filters: CanBuildFilters, enabled = true) {
  return useQuery<CanBuildResult>({
    queryKey: ['can-build', filters],
    queryFn: ({ signal }) => fetchCanBuild(filters, signal),
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    enabled,
  });
}
