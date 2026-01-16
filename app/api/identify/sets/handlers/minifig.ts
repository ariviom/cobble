import {
  getSetsForMinifigBl,
  mapBlToRbFigId,
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
 * Accepts both BrickLink IDs (e.g., "sw0001") and RB IDs (e.g., "fig-000001").
 * Uses BrickLink ID as primary; maps to RB ID for set lookups if needed.
 *
 * @param part - The minifig ID (may include fig: prefix)
 * @returns Identification result with minifig info and containing sets
 */
export async function handleMinifigIdentify(
  part: string
): Promise<MinifigIdentifyResult> {
  const tokenRaw = part.startsWith('fig:') ? part.slice(4) : part;
  const token = tokenRaw.trim();

  const supabase = getCatalogWriteClient();

  let bricklinkFigId: string | null = null;
  let rbFigNum: string | null = null;

  // Determine if this is a BL ID or RB ID
  const looksLikeRbId = token.toLowerCase().startsWith('fig-');

  if (looksLikeRbId) {
    // Input is RB ID - find BL mapping
    rbFigNum = token;

    // Check bl_set_minifigs for RB→BL mapping
    const { data: setMapping } = await supabase
      .from('bl_set_minifigs')
      .select('minifig_no')
      .eq('rb_fig_id', rbFigNum)
      .not('minifig_no', 'is', null)
      .limit(1)
      .maybeSingle();

    if (setMapping?.minifig_no) {
      bricklinkFigId = setMapping.minifig_no;
    } else {
      // Try explicit mappings table
      const { data: explicitMapping } = await supabase
        .from('bricklink_minifig_mappings')
        .select('bl_item_id')
        .eq('rb_fig_id', rbFigNum)
        .maybeSingle();

      if (explicitMapping?.bl_item_id) {
        bricklinkFigId = explicitMapping.bl_item_id;
      }
    }
  } else {
    // Input is BL ID - find RB mapping for set lookups
    bricklinkFigId = token;
    rbFigNum = await mapBlToRbFigId(token);
  }

  // Get sets containing this minifig (using BL data)
  let sets: PartInSet[] = [];
  if (bricklinkFigId) {
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
  }

  // Get display name from BL catalog
  let displayName: string = bricklinkFigId ?? rbFigNum ?? token;

  if (bricklinkFigId) {
    const { data: blMeta } = await supabase
      .from('bricklink_minifigs')
      .select('name')
      .eq('item_id', bricklinkFigId)
      .maybeSingle();

    if (blMeta?.name) {
      displayName = blMeta.name;
    }
  }

  // Fallback to RB catalog if no BL name
  if (displayName === (bricklinkFigId ?? token) && rbFigNum) {
    const { data: rbMeta } = await supabase
      .from('rb_minifigs')
      .select('name')
      .eq('fig_num', rbFigNum)
      .maybeSingle();

    if (rbMeta?.name) {
      displayName = rbMeta.name;
    }
  }

  if (process.env.NODE_ENV !== 'production') {
    logEvent('identify.sets.minifig.debug', {
      inputPart: part,
      bricklinkFigId,
      rbFigNum,
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
      rbFigNum,
      setsCount: sets.length,
      usedLocal: sets.some(
        s => s.numParts != null || s.themeName != null || s.year !== 0
      ),
    });
  }

  return {
    part: {
      partNum: bricklinkFigId ?? rbFigNum ?? token,
      name: displayName,
      imageUrl: null,
      confidence: 0,
      colorId: null,
      colorName: null,
      isMinifig: true,
      rebrickableFigId: rbFigNum,
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
