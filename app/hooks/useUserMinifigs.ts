'use client';

import { useEffect, useState } from 'react';

export type UserMinifig = {
  figNum: string;
  name: string;
  numParts: number | null;
  imageUrl: string | null;
  blId: string | null;
  status: 'owned' | 'want' | null;
  quantity: number | null;
  year: number | null;
  categoryId: number | null;
  categoryName: string | null;
};

type UseUserMinifigsResult = {
  minifigs: UserMinifig[];
  isLoading: boolean;
  error: string | null;
};

export function useUserMinifigs(): UseUserMinifigsResult {
  const [minifigs, setMinifigs] = useState<UserMinifig[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setError(null);
      setIsLoading(true);
      try {
        const res = await fetch('/api/user/minifigs', {
          credentials: 'same-origin',
        });
        if (res.status === 401) {
          setMinifigs([]);
          setIsLoading(false);
          return;
        }
        if (!res.ok) {
          const payload = (await res.json().catch(() => null)) as {
            error?: string;
          } | null;
          const code = payload?.error ?? 'minifigs_fetch_failed';
          throw new Error(code);
        }
        const payload = (await res.json()) as {
          minifigs?: UserMinifig[];
        };
        if (cancelled) return;
        setMinifigs(payload.minifigs ?? []);
        setIsLoading(false);
      } catch (err) {
        if (cancelled) return;
        console.error('useUserMinifigs fetch failed', err);
        setError(
          err instanceof Error ? err.message : 'Failed to load minifigures'
        );
        setMinifigs([]);
        setIsLoading(false);
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, []);

  return { minifigs, isLoading, error };
}
