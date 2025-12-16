import {
  mapBrickLinkFigToRebrickable,
  mapRebrickableFigToBrickLinkOnDemand,
} from '@/app/lib/minifigMapping';
import {
  getSetsForMinifig,
  type PartAvailableColor,
  type PartInSet,
} from '@/app/lib/rebrickable';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabaseServiceRoleClient';
import { logEvent } from '@/lib/metrics';

import { enrichSets, ensureSetNames } from './enrichment';

export type MinifigIdentifyResult = {
  part: {
    partNum: string;
    name: string;
    imageUrl: null;
    confidence: number;
    colorId: null;
    colorName: null;
    isMinifig: true;
    rebrickableFigId: string | null;
    bricklinkFigId: string | null;
  };
  availableColors: PartAvailableColor[];
  selectedColorId: null;
  sets: PartInSet[];
};

/**
 * Identify a minifigure and find sets containing it.
 *
 * @param part - The original part parameter (may include fig: prefix)
 * @returns Identification result with minifig info and containing sets
 */
export async function handleMinifigIdentify(
  part: string
): Promise<MinifigIdentifyResult> {
  const tokenRaw = part.startsWith('fig:') ? part.slice(4) : part;
  const token = tokenRaw.trim();

  let figNum: string | null = null;
  let bricklinkFigId: string | null = null;

  // Prefer treating the token as a BrickLink ID first; if that fails,
  // fall back to using it as a Rebrickable fig id.
  const mappedRb = await mapBrickLinkFigToRebrickable(token);
  if (mappedRb) {
    figNum = mappedRb;
    bricklinkFigId = token;
  } else {
    figNum = token;
    try {
      bricklinkFigId = await mapRebrickableFigToBrickLinkOnDemand(figNum);
    } catch {
      bricklinkFigId = null;
    }
  }

  let sets: PartInSet[] = [];
  if (figNum) {
    try {
      sets = await getSetsForMinifig(figNum);
    } catch {
      sets = [];
    }
  }

  // Resolve a human-friendly minifig name from the catalog when possible.
  let displayName: string = figNum ?? token;
  if (figNum) {
    try {
      const supabase = getSupabaseServiceRoleClient();
      const { data, error } = await supabase
        .from('rb_minifigs')
        .select('name')
        .eq('fig_num', figNum)
        .maybeSingle();
      if (!error && data && typeof data.name === 'string') {
        const trimmedName = data.name.trim();
        if (trimmedName) {
          displayName = trimmedName;
        }
      }
    } catch {
      // best-effort only; fall back to figNum/token
    }
  }

  if (process.env.NODE_ENV !== 'production') {
    logEvent('identify.sets.minifig.debug', {
      inputPart: part,
      figNum: figNum ?? null,
      bricklinkFigId,
      setsCount: sets.length,
    });
  }

  // Enrich sets with catalog summary
  if (sets.length) {
    sets = await enrichSets(sets, 30);
  }

  if (process.env.NODE_ENV !== 'production') {
    logEvent('identify.sets.minifig.enriched', {
      inputPart: part,
      figNum: figNum ?? null,
      bricklinkFigId,
      setsCount: sets.length,
      usedLocal: sets.some(
        s => s.numParts != null || s.themeName != null || s.year !== 0
      ),
    });
  }

  return {
    part: {
      partNum: figNum ?? token,
      name: displayName,
      imageUrl: null,
      confidence: 0,
      colorId: null,
      colorName: null,
      isMinifig: true,
      rebrickableFigId: figNum,
      bricklinkFigId,
    },
    availableColors: [],
    selectedColorId: null,
    sets: ensureSetNames(sets),
  };
}

/**
 * Check if a part ID looks like a BrickLink minifig ID (e.g., "ext014").
 */
export function looksLikeBricklinkFig(part: string): boolean {
  return /^[a-z]{3}\d{3,}$/i.test(part.trim());
}
