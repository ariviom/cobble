import {
  getSetsForMinifigBl,
  type MinifigSetInfo,
} from '@/app/lib/bricklink/minifigs';
import { getCatalogWriteClient } from '@/app/lib/db/catalogAccess';
import { type PartAvailableColor, type PartInSet } from '@/app/lib/rebrickable';
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
    bricklinkFigId: string | null;
  };
  availableColors: PartAvailableColor[];
  selectedColorId: null;
  sets: PartInSet[];
};

/**
 * Identify a minifigure and find sets containing it.
 *
 * Accepts BrickLink minifig IDs (e.g., "sw0001", "cty1234").
 * Legacy Rebrickable IDs (fig-XXXXX) are not supported as there is no
 * deterministic mapping between RB and BL minifig IDs.
 *
 * @param part - The BrickLink minifig ID (may include fig: prefix)
 * @returns Identification result with minifig info and containing sets
 */
export async function handleMinifigIdentify(
  part: string
): Promise<MinifigIdentifyResult> {
  const tokenRaw = part.startsWith('fig:') ? part.slice(4) : part;
  const token = tokenRaw.trim();

  const supabase = getCatalogWriteClient();

  // Treat input as BrickLink ID (source of truth for minifigs)
  const bricklinkFigId = token;

  // Get sets containing this minifig (using BL data)
  let sets: PartInSet[] = [];
  try {
    const blSets = await getSetsForMinifigBl(bricklinkFigId);
    // Map MinifigSetInfo to PartInSet for compatibility
    sets = blSets.map(
      (s: MinifigSetInfo): PartInSet => ({
        setNumber: s.setNumber,
        name: s.name,
        year: s.year,
        imageUrl: s.imageUrl,
        quantity: s.quantity,
      })
    );
  } catch {
    sets = [];
  }

  // Get display name from BL catalog
  let displayName: string = bricklinkFigId;

  const { data: blMeta } = await supabase
    .from('bricklink_minifigs')
    .select('name')
    .eq('item_id', bricklinkFigId)
    .maybeSingle();

  if (blMeta?.name) {
    displayName = blMeta.name;
  }

  if (process.env.NODE_ENV !== 'production') {
    logEvent('identify.sets.minifig.debug', {
      inputPart: part,
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
      bricklinkFigId,
      setsCount: sets.length,
      usedLocal: sets.some(
        s => s.numParts != null || s.themeName != null || s.year !== 0
      ),
    });
  }

  return {
    part: {
      partNum: bricklinkFigId,
      name: displayName,
      imageUrl: null,
      confidence: 0,
      colorId: null,
      colorName: null,
      isMinifig: true,
      bricklinkFigId,
    },
    availableColors: [],
    selectedColorId: null,
    sets: ensureSetNames(sets),
  };
}

/**
 * Check if a part ID looks like a BrickLink minifig ID (e.g., "sw0001").
 */
export function looksLikeBricklinkFig(part: string): boolean {
  return /^[a-z]{2,3}\d{3,}$/i.test(part.trim());
}
