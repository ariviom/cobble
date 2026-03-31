'use client';

import { useQuery } from '@tanstack/react-query';

export type SetPriceData = {
  total: number | null;
  minPrice: number | null;
  maxPrice: number | null;
  currency: string | null;
  pricingSource: string | null;
};

async function fetchSetPrice(setNumber: string): Promise<SetPriceData> {
  const res = await fetch('/api/prices/bricklink-set', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ setNumber }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/**
 * Fetches BrickLink set price with client-side caching via TanStack Query.
 * Cached for 30 minutes to avoid redundant API calls when re-opening set cards.
 */
export function useSetPrice(setNumber: string, enabled = true) {
  return useQuery<SetPriceData>({
    queryKey: ['set-price', setNumber],
    queryFn: () => fetchSetPrice(setNumber),
    enabled,
    staleTime: 30 * 60 * 1000, // 30 minutes
    gcTime: 60 * 60 * 1000, // keep in cache for 1 hour
  });
}
