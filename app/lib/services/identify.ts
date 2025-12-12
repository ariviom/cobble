import 'server-only';

import { getSetsForPartLocal, getSetSummaryLocal } from '@/app/lib/catalog';
import { EXTERNAL } from '@/app/lib/constants';
import { fetchBLSupersetsFallback } from '@/app/lib/identify/blFallback';
import {
  ExternalCallBudget,
  isBudgetError,
  type BLFallbackResult,
} from '@/app/lib/identify/types';
import {
  getPartColorsForPart,
  getSetsForPart,
  getSetSummary,
  resolvePartIdToRebrickable,
  type PartAvailableColor,
  type PartInSet,
} from '@/app/lib/rebrickable';
import { logger } from '@/lib/metrics';

type CacheKey = string;
type CacheEntry = { sets: PartInSet[]; fetchedAt: number };
const IDENTIFY_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const IDENTIFY_CACHE_MAX = 200;
const identifyCache = new Map<CacheKey, CacheEntry>();

function cacheKey(partNum: string, colorId?: number) {
  return `${partNum}::${typeof colorId === 'number' ? colorId : 'any'}`;
}

function getCachedSets(partNum: string, colorId?: number): PartInSet[] | null {
  const key = cacheKey(partNum, colorId);
  const entry = identifyCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > IDENTIFY_CACHE_TTL_MS) {
    identifyCache.delete(key);
    return null;
  }
  return entry.sets;
}

function setCachedSets(
  partNum: string,
  colorId: number | undefined,
  sets: PartInSet[]
) {
  const key = cacheKey(partNum, colorId);
  identifyCache.set(key, { sets, fetchedAt: Date.now() });
  if (identifyCache.size > IDENTIFY_CACHE_MAX) {
    const oldest = [...identifyCache.entries()].sort(
      (a, b) => a[1].fetchedAt - b[1].fetchedAt
    )[0]?.[0];
    if (oldest) identifyCache.delete(oldest);
  }
}

export type IdentifyCandidate = {
  partNum: string;
  bricklinkId?: string;
  confidence?: number;
  colorId?: number;
  colorName?: string;
  imageUrl?: string;
};
export type ResolvedCandidate = {
  partNum: string;
  name: string;
  imageUrl: string | null;
  confidence: number;
  colorId?: number;
  colorName?: string;
  bricklinkId?: string;
  /**
   * True when we could not resolve to Rebrickable but have a BrickLink ID; skip RB lookups.
   */
  isBricklinkOnly?: boolean;
};

export async function resolveCandidates(
  raw: IdentifyCandidate[]
): Promise<ResolvedCandidate[]> {
  const resolved = await Promise.all(
    raw.map(async candidate => {
      const blId =
        typeof candidate.bricklinkId === 'string'
          ? candidate.bricklinkId
          : undefined;
      const base = await resolvePartIdToRebrickable(
        candidate.partNum,
        blId ? { bricklinkId: blId } : undefined
      );
      const resolvedPart =
        base ?? (await resolvePartIdToRebrickable(candidate.partNum));
      if (resolvedPart) {
        return {
          partNum: resolvedPart.partNum,
          name: resolvedPart.name,
          imageUrl: resolvedPart.imageUrl,
          confidence: candidate.confidence ?? 0,
          colorId: candidate.colorId,
          colorName: candidate.colorName,
          bricklinkId: blId,
          isBricklinkOnly: false,
        };
      }
      // If we could not resolve to Rebrickable but have a BL ID, return a BL-only candidate for fallback.
      if (blId) {
        return {
          partNum: candidate.partNum,
          name: candidate.partNum, // fallback to part number; BL fallback will enrich name/image
          imageUrl: candidate.imageUrl ?? null,
          confidence: candidate.confidence ?? 0,
          colorId: candidate.colorId,
          colorName: candidate.colorName,
          bricklinkId: blId,
          isBricklinkOnly: true,
        };
      }
      return null;
    })
  );
  return resolved.filter(Boolean) as ResolvedCandidate[];
}

async function fetchCandidateSets(
  partNum: string,
  preferredColorId?: number
): Promise<PartInSet[]> {
  const cached = getCachedSets(partNum, preferredColorId);
  if (cached) return cached;

  try {
    const local = await getSetsForPartLocal(
      partNum,
      typeof preferredColorId === 'number' ? preferredColorId : null
    );
    if (local.length) return local;
    if (typeof preferredColorId === 'number') {
      const localAll = await getSetsForPartLocal(partNum, null);
      if (localAll.length) return localAll;
    }
  } catch (err) {
    logger.warn('identify.fetch_candidate_sets_local_failed', {
      partNum,
      preferredColorId,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  if (typeof preferredColorId === 'number') {
    try {
      const remoteWithColor = await getSetsForPart(partNum, preferredColorId);
      if (remoteWithColor.length) {
        setCachedSets(partNum, preferredColorId, remoteWithColor);
        return remoteWithColor;
      }
    } catch (err) {
      if (isBudgetError(err)) throw err;
    }
  }

  try {
    const remote = await getSetsForPart(partNum, undefined);
    setCachedSets(partNum, preferredColorId, remote);
    return remote;
  } catch (err) {
    if (isBudgetError(err)) throw err;
    return [];
  }
}

export async function selectCandidateWithSets(
  candidates: ResolvedCandidate[],
  colorHint: number | undefined
): Promise<{
  chosen: ResolvedCandidate;
  sets: PartInSet[];
  selectedColorId: number | undefined;
  availableColors: PartAvailableColor[];
}> {
  let chosen = candidates[0]!;

  let availableColors: PartAvailableColor[] = [];
  try {
    availableColors = await getPartColorsForPart(chosen.partNum);
  } catch (err) {
    if (isBudgetError(err)) throw err;
  }

  let selectedColorId =
    (availableColors.length === 1 ? availableColors[0]!.id : undefined) ??
    colorHint ??
    chosen.colorId;

  let sets = await fetchCandidateSets(chosen.partNum, selectedColorId);
  if (!sets.length && candidates.length > 1) {
    for (let i = 1; i < Math.min(candidates.length, 5); i++) {
      const candidate = candidates[i]!;
      const nextColor = colorHint ?? candidate.colorId ?? undefined;
      const candidateSets = await fetchCandidateSets(
        candidate.partNum,
        nextColor
      );
      if (candidateSets.length) {
        chosen = candidate;
        selectedColorId = nextColor;
        sets = candidateSets;
        break;
      }
    }
  }

  if (sets.length) {
    sets = [...sets].sort((a, b) => {
      if (b.quantity !== a.quantity) return b.quantity - a.quantity;
      return b.year - a.year;
    });
  }

  return { chosen, sets, selectedColorId, availableColors };
}

export function needsEnrichment(sets: PartInSet[]): boolean {
  return sets.some(
    s =>
      !s.name ||
      s.name.trim() === '' ||
      s.year === 0 ||
      s.numParts == null ||
      s.themeName == null
  );
}

export async function enrichSetsIfNeeded(
  sets: PartInSet[]
): Promise<PartInSet[]> {
  if (!needsEnrichment(sets)) return sets;

  const summaries = await Promise.all(
    sets.slice(0, EXTERNAL.ENRICH_LIMIT).map(async set => {
      try {
        const summary =
          (await getSetSummaryLocal(set.setNumber)) ??
          (await getSetSummary(set.setNumber));
        return { setNumber: set.setNumber.toLowerCase(), summary };
      } catch (err) {
        logger.warn('identify.enrichment_failed', {
          set: set.setNumber,
          error: err instanceof Error ? err.message : String(err),
        });
        return null;
      }
    })
  );

  const summaryBySet = new Map<
    string,
    Awaited<ReturnType<typeof getSetSummary>>
  >();
  for (const entry of summaries) {
    if (entry?.summary) summaryBySet.set(entry.setNumber, entry.summary);
  }

  return sets.map(s => {
    const summary = summaryBySet.get(s.setNumber.toLowerCase());
    return {
      ...s,
      name: summary?.name ?? s.name ?? s.setNumber,
      year: summary?.year ?? s.year,
      imageUrl: summary?.imageUrl ?? s.imageUrl,
      numParts: summary?.numParts ?? s.numParts ?? null,
      themeId: summary?.themeId ?? s.themeId ?? null,
      themeName: summary?.themeName ?? s.themeName ?? null,
    };
  });
}

export type IdentifyResolved =
  | {
      status: 'resolved';
      payload: {
        part: {
          partNum: string;
          name: string;
          imageUrl: string | null;
          confidence: number;
          colorId: number | null;
          colorName: string | null;
        };
        candidates: ResolvedCandidate[];
        availableColors: PartAvailableColor[];
        selectedColorId: number | null;
        sets: PartInSet[];
      };
    }
  | {
      status: 'fallback';
      payload: {
        part: {
          partNum: string;
          name: string;
          imageUrl: string | null;
          confidence: number;
        };
        blPartId: string;
        blAvailableColors: BLFallbackResult['blAvailableColors'];
        candidates: ResolvedCandidate[];
        availableColors: PartAvailableColor[];
        selectedColorId: number | null;
        sets: BLFallbackResult['sets'];
        source: BLFallbackResult['source'];
      };
    }
  | { status: 'no_match' }
  | { status: 'no_valid_candidate' };

export async function resolveIdentifyResult(opts: {
  candidates: ResolvedCandidate[];
  colorHint?: number;
  budget: ExternalCallBudget;
}): Promise<IdentifyResolved> {
  const { candidates, colorHint, budget } = opts;

  if (!candidates.length) {
    return { status: 'no_valid_candidate' };
  }

  const rbCandidates = candidates.filter(c => !c.isBricklinkOnly);

  // If nothing resolved to Rebrickable but we have BL-only candidates, go straight to BL fallback.
  if (!rbCandidates.length) {
    const blCand = candidates.find(c => c.bricklinkId);
    if (blCand?.bricklinkId) {
      const fallback = await fetchBLSupersetsFallback(
        blCand.bricklinkId,
        budget,
        {
          initialImage: blCand.imageUrl,
          initialName: blCand.name,
        }
      );
      return {
        status: 'fallback',
        payload: {
          part: {
            partNum: blCand.partNum,
            name: fallback.partName,
            imageUrl: fallback.partImage,
            confidence: blCand.confidence,
          },
          blPartId: blCand.bricklinkId,
          blAvailableColors: fallback.blAvailableColors,
          candidates: candidates.slice(0, 5),
          availableColors: [],
          selectedColorId: null,
          sets: fallback.sets,
          source: fallback.source,
        },
      };
    }
    return { status: 'no_valid_candidate' };
  }

  const { chosen, sets, selectedColorId, availableColors } =
    await selectCandidateWithSets(rbCandidates, colorHint);

  if (!sets.length) {
    const blCand = candidates.find(c => c.bricklinkId);
    if (blCand?.bricklinkId) {
      const fallback = await fetchBLSupersetsFallback(
        blCand.bricklinkId,
        budget,
        {
          initialImage: chosen.imageUrl,
          initialName: chosen.name,
        }
      );
      // Always return a fallback payload when we have a BL candidate, even if sets are empty.
      return {
        status: 'fallback',
        payload: {
          part: {
            partNum: chosen.partNum,
            name: fallback.partName,
            imageUrl: fallback.partImage,
            confidence: chosen.confidence,
          },
          blPartId: blCand.bricklinkId,
          blAvailableColors: fallback.blAvailableColors,
          candidates: candidates.slice(0, 5),
          availableColors: [],
          selectedColorId: null,
          sets: fallback.sets,
          source: fallback.source,
        },
      };
    }
    return { status: 'no_valid_candidate' };
  }

  const enrichedSets = await enrichSetsIfNeeded(sets);
  const finalSets = enrichedSets.map(s => ({
    ...s,
    name: s.name && s.name.trim() ? s.name : s.setNumber,
  }));

  return {
    status: 'resolved',
    payload: {
      part: {
        partNum: chosen.partNum,
        name: chosen.name,
        imageUrl: chosen.imageUrl,
        confidence: chosen.confidence,
        colorId: selectedColorId ?? null,
        colorName: chosen.colorName ?? null,
      },
      candidates: candidates.slice(0, 5),
      availableColors,
      selectedColorId: selectedColorId ?? null,
      sets: finalSets,
    },
  };
}
