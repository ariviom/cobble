'use client';

import {
  getCachedMinifig,
  getCachedMinifigByBlId,
  setCachedMinifig,
} from '@/app/lib/localDb';
import { useEffect, useState } from 'react';

type MinifigMeta = {
  figNum: string;
  blId: string | null;
  imageUrl: string | null;
  name: string;
  numParts: number | null;
  year?: number | null;
  themeName?: string | null;
};

type UseMinifigMetaResult = {
  meta: MinifigMeta | null;
  isLoading: boolean;
  error: string | null;
};

export function useMinifigMeta(figNum: string): UseMinifigMetaResult {
  const [meta, setMeta] = useState<MinifigMeta | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const trimmed = figNum.trim();
    if (!trimmed) {
      setMeta(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;

    const run = async () => {
      setIsLoading(true);
      setError(null);
      try {
        // Local-first: try IndexedDB cache by RB fig_num or BL ID
        const cached =
          (trimmed.toLowerCase().startsWith('fig-')
            ? await getCachedMinifig(trimmed)
            : await getCachedMinifigByBlId(trimmed)) ??
          (await getCachedMinifig(trimmed));

        if (cached) {
          if (cancelled) return;
          setMeta({
            figNum: cached.figNum,
            blId: cached.blId,
            imageUrl: cached.imageUrl,
            name: cached.name,
            numParts: cached.numParts,
            year: cached.year,
            themeName: cached.themeName,
          });
          setIsLoading(false);
          return;
        }

        const res = await fetch(
          `/api/minifigs/${encodeURIComponent(trimmed)}?includeSubparts=false&includePricing=false`,
          { cache: 'force-cache' }
        );
        if (!res.ok) {
          const payload = (await res.json().catch(() => null)) as {
            error?: string;
          } | null;
          const code = payload?.error ?? 'minifig_meta_failed';
          throw new Error(code);
        }
        const data = (await res.json()) as MinifigMeta;
        if (cancelled) return;
        setMeta(data);

        // Cache the response for future lookups
        void setCachedMinifig({
          figNum: data.figNum,
          blId: data.blId ?? null,
          name: data.name,
          imageUrl: data.imageUrl,
          numParts: data.numParts ?? null,
          year: data.year ?? null,
          themeName: data.themeName ?? null,
        });
      } catch (err) {
        if (cancelled) return;
        console.error('useMinifigMeta failed', err);
        setError(
          err instanceof Error ? err.message : 'Failed to load minifig meta'
        );
        setMeta(null);
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
  }, [figNum]);

  return { meta, isLoading, error };
}
