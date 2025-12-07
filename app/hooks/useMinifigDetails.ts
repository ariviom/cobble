'use client';

import { useEffect, useState } from 'react';

export type MinifigSubpart = {
  partId: string;
  name: string;
  colorId: number;
  colorName: string;
  quantity: number;
  imageUrl: string | null;
  bricklinkPartId: string | null;
};

export type MinifigPriceGuide = {
  used: {
    unitPrice: number | null;
    minPrice: number | null;
    maxPrice: number | null;
    currency: string | null;
  };
  new: {
    unitPrice: number | null;
    minPrice: number | null;
    maxPrice: number | null;
    currency: string | null;
  };
};

export type MinifigSetItem = {
  setNumber: string;
  name: string;
  year: number;
  quantity: number;
  imageUrl: string | null;
};

export type MinifigDetails = {
  figNum: string;
  blId: string | null;
  imageUrl: string | null;
  name: string;
  numParts: number | null;
  year: number | null | undefined;
  themeName: string | null | undefined;
  sets: { count: number; items: MinifigSetItem[] } | undefined;
  priceGuide: MinifigPriceGuide | undefined;
  subparts: MinifigSubpart[] | undefined;
};

export type UseMinifigDetailsResult = {
  details: MinifigDetails | null;
  isLoading: boolean;
  error: string | null;
};

type UseMinifigDetailsOptions = {
  includeSubparts?: boolean;
  includePricing?: boolean;
  enabled?: boolean;
  cache?: RequestCache;
};

export function useMinifigDetails(
  figNum: string,
  {
    includeSubparts = false,
    includePricing = false,
    enabled = true,
    cache = 'no-store',
  }: UseMinifigDetailsOptions = {}
): UseMinifigDetailsResult {
  const [details, setDetails] = useState<MinifigDetails | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const trimmed = figNum.trim();
    if (!trimmed) {
      setDetails(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    if (!enabled) {
      return;
    }

    let cancelled = false;

    const run = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (includeSubparts) params.set('includeSubparts', 'true');
        if (includePricing) params.set('includePricing', 'true');
        const res = await fetch(
          `/api/minifigs/${encodeURIComponent(trimmed)}${
            params.toString() ? `?${params.toString()}` : ''
          }`,
          { cache }
        );
        if (!res.ok) {
          const payload = (await res.json().catch(() => null)) as
            | { error?: string }
            | null;
          const code = payload?.error ?? 'minifig_details_failed';
          throw new Error(code);
        }
        const data = (await res.json()) as MinifigDetails;
        if (cancelled) return;
        setDetails(data);
      } catch (err) {
        if (cancelled) return;
        console.error('useMinifigDetails failed', err);
        setError(
          err instanceof Error
            ? err.message
            : 'Failed to load minifig details'
        );
        setDetails(null);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [figNum, includeSubparts, includePricing, enabled, cache]);

  return { details, isLoading, error };
}


