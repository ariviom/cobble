import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { MinifigEnrichmentResult } from '@/app/lib/services/minifigEnrichment';

type ExistingData = Map<
  string,
  {
    imageUrl: string | null;
    hasSubparts: boolean;
    hasSubpartImages: boolean;
  }
>;

type UseMinifigEnrichmentOptions = {
  figNums: string[];
  existingData: ExistingData;
  enabled?: boolean;
};

type UseMinifigEnrichmentResult = {
  enrichedData: Map<string, MinifigEnrichmentResult>;
  isEnriching: boolean;
  error: string | null;
  enrichFigs: (figNums: string[]) => Promise<void>;
};

const BATCH_SIZE = 15;
const BATCH_DELAY_MS = 500;

function computeTargets(
  figNums: string[],
  existingData: ExistingData
): string[] {
  return figNums.filter(figNum => {
    const existing = existingData.get(figNum);
    return (
      !existing?.imageUrl ||
      existing.imageUrl.includes('cdn.rebrickable.com/media/sets/') ||
      !existing.hasSubparts ||
      !existing.hasSubpartImages
    );
  });
}

export function useMinifigEnrichment(
  options: UseMinifigEnrichmentOptions
): UseMinifigEnrichmentResult {
  const { figNums, existingData, enabled = true } = options;
  const [enrichedData, setEnrichedData] = useState<
    Map<string, MinifigEnrichmentResult>
  >(new Map());
  const [isEnriching, setIsEnriching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<{ aborted: boolean }>({ aborted: false });

  const targets = useMemo(
    () => computeTargets(figNums, existingData),
    [figNums, existingData]
  );

  const enrichFigs = useCallback(async (requested: string[]) => {
    const unique = Array.from(new Set(requested)).filter(Boolean);
    if (!unique.length) return;
    setIsEnriching(true);
    setError(null);

    try {
      for (let i = 0; i < unique.length; i += BATCH_SIZE) {
        if (abortRef.current.aborted) break;
        const batch = unique.slice(i, i + BATCH_SIZE);
        const res = await fetch('/api/minifigs/enrich', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ figNums: batch, includeSubparts: true }),
        });
        if (!res.ok) {
          const msg = `Enrichment failed (${res.status})`;
          setError(msg);
          break;
        }
        const payload = (await res.json()) as {
          results?: Record<string, MinifigEnrichmentResult>;
        };
        const entries = payload.results ? Object.entries(payload.results) : [];
        if (entries.length) {
          setEnrichedData(prev => {
            const next = new Map(prev);
            for (const [fig, value] of entries) {
              next.set(fig, value);
            }
            return next;
          });
        }
        if (i + BATCH_SIZE < unique.length) {
          await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsEnriching(false);
    }
  }, []);

  useEffect(() => {
    const ref = abortRef.current;
    ref.aborted = false;
    if (!enabled) return () => undefined;
    if (!targets.length) return () => undefined;
    void enrichFigs(targets);
    return () => {
      ref.aborted = true;
    };
  }, [enabled, targets, enrichFigs]);

  return {
    enrichedData,
    isEnriching,
    error,
    enrichFigs,
  };
}
