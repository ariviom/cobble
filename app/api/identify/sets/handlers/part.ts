import { getSetsForPartLocal } from '@/app/lib/catalog';
import { EXTERNAL } from '@/app/lib/constants';
import { getCatalogReadClient } from '@/app/lib/db/catalogAccess';
import { fetchBLSupersetsFallback } from '@/app/lib/identify/blFallback';
import { PipelineBudget } from '@/app/lib/identify/budget';
import {
  getPart,
  getPartColorsForPart,
  getSetsForPart,
  mapBrickLinkColorIdToRebrickableColorId,
  resolvePartIdToRebrickable,
  type PartAvailableColor,
  type PartInSet,
} from '@/app/lib/rebrickable';
import { logEvent, logger } from '@/lib/metrics';

import {
  enrichSets,
  ensureSetNames,
  setsNeedEnrichment,
  sortSets,
} from './enrichment';

export type PartIdentifyResult = {
  part: {
    partNum: string;
    name: string;
    imageUrl: string | null;
    /** Authoritative BrickLink part ID from catalog. */
    bricklinkPartId?: string | null;
  };
  availableColors: PartAvailableColor[];
  selectedColorId: number | null;
  sets: PartInSet[];
};

type PartIdentifyOptions = {
  colorId?: number | undefined;
  blColorId?: number | undefined;
};

/**
 * Identify a part and find sets containing it.
 *
 * @param part - The part ID to identify
 * @param options - Optional color filters
 * @returns Identification result with part info, available colors, and containing sets
 */
export async function handlePartIdentify(
  part: string,
  options: PartIdentifyOptions = {}
): Promise<PartIdentifyResult> {
  const { colorId, blColorId } = options;

  let rbPart = part;
  let selectedColorId = colorId;

  // Resolve BL part to RB if needed
  rbPart = await resolvePartToRebrickable(part);

  // Get available colors for this part
  let availableColors: PartAvailableColor[] = [];
  try {
    availableColors = await getPartColorsForPart(rbPart);
    if (selectedColorId == null && availableColors.length === 1) {
      selectedColorId = availableColors[0]!.id;
    }
  } catch {
    availableColors = [];
  }

  // Map BL color if provided and no RB color yet
  if (selectedColorId == null && blColorId != null) {
    try {
      const mapped = await mapBrickLinkColorIdToRebrickableColorId(blColorId);
      if (typeof mapped === 'number') selectedColorId = mapped;
    } catch {
      // ignore color mapping failures
    }
  }

  // Find sets containing this part
  let sets = await findSetsForPart(rbPart, selectedColorId, availableColors);

  // Get part metadata, preferring color-specific image from available colors
  const colorImage =
    typeof selectedColorId === 'number'
      ? (availableColors.find(c => c.id === selectedColorId)?.partImageUrl ??
        null)
      : null;
  const partMeta = await getPartMetadata(rbPart);
  let partMetaName = partMeta.name;
  let partMetaImage = colorImage ?? partMeta.imageUrl;
  const { blPartId } = partMeta;

  // BrickLink superset fallback: when RB has no sets for this part,
  // try BL supersets API (the part may only exist in BrickLink's catalog).
  const effectiveBlPartId = blPartId ?? part;

  if (!sets.length && effectiveBlPartId) {
    try {
      const budget = new PipelineBudget(EXTERNAL.EXTERNAL_CALL_BUDGET);
      const result = await fetchBLSupersetsFallback(effectiveBlPartId, budget, {
        initialName: partMetaName,
        initialImage: partMetaImage,
      });
      if (result.sets.length) {
        sets = result.sets.map(s => ({
          setNumber: s.setNumber,
          name: s.name,
          year: s.year,
          imageUrl: s.imageUrl,
          quantity: s.quantity,
          numParts: s.numParts ?? null,
          themeId: s.themeId ?? null,
          themeName: s.themeName ?? null,
        }));
      }
      // Use BL metadata when RB metadata was empty
      if (!partMetaName && result.partName) partMetaName = result.partName;
      if (!partMetaImage && result.partImage) partMetaImage = result.partImage;
      if (budget.isExhausted) {
        logger.warn('identify.sets.bl_fallback_budget_exhausted', {
          blPartId: effectiveBlPartId,
        });
      }
    } catch (err) {
      logger.warn('identify.sets.bl_fallback_failed', {
        blPartId: effectiveBlPartId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (process.env.NODE_ENV !== 'production') {
    logEvent('identify.sets', {
      inputPart: part,
      resolvedPart: rbPart,
      selectedColorId,
      setsCount: sets.length,
    });
  }

  // Sort and enrich sets
  let finalSets = sortSets(sets);

  if (setsNeedEnrichment(finalSets)) {
    finalSets = await enrichSets(finalSets, 30);
  }

  finalSets = ensureSetNames(finalSets);

  return {
    part: {
      partNum: rbPart,
      name: partMetaName,
      imageUrl: partMetaImage,
      bricklinkPartId: blPartId,
    },
    availableColors,
    selectedColorId: selectedColorId ?? null,
    sets: finalSets,
  };
}

/**
 * Resolve a part ID to its Rebrickable equivalent.
 *
 * Uses direct RB lookup, then bricklinkId hint for parts where BL and RB
 * use different IDs. Returns the original input unchanged if no match found.
 */
async function resolvePartToRebrickable(part: string): Promise<string> {
  try {
    await getPart(part);
    return part;
  } catch {
    try {
      const resolved = await resolvePartIdToRebrickable(part, {
        bricklinkId: part,
      });
      if (resolved?.partNum) {
        return resolved.partNum;
      }
    } catch {
      // not found in Rebrickable
    }
  }

  return part;
}

/**
 * Find sets containing a part, trying local catalog first, then Rebrickable API.
 */
async function findSetsForPart(
  rbPart: string,
  colorId: number | undefined,
  availableColors: PartAvailableColor[]
): Promise<PartInSet[]> {
  // 1) Try catalog (Supabase) first for full set metadata
  try {
    const local = await getSetsForPartLocal(rbPart, colorId ?? null);
    if (local.length) {
      return local;
    }
  } catch (err) {
    logger.warn('identify.sets.local_catalog_failed', {
      part: rbPart,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // 2) Fallback to Rebrickable when catalog is empty or failed
  if (typeof colorId === 'number') {
    // Single-color path: respect the explicit RB color id
    return await fetchSetsWithColorFallback(rbPart, colorId);
  }

  // "All colors" path
  return await fetchSetsAllColors(rbPart, availableColors);
}

/**
 * Fetch sets for a part with a specific color, falling back to no color if not found.
 */
async function fetchSetsWithColorFallback(
  rbPart: string,
  colorId: number
): Promise<PartInSet[]> {
  try {
    return await getSetsForPart(rbPart, colorId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('Rebrickable error 404')) {
      // Retry without color filter if not found
      try {
        return await getSetsForPart(rbPart, undefined);
      } catch {
        return [];
      }
    }
    return [];
  }
}

/**
 * Fetch sets for a part across all colors (union approach for small color counts).
 */
async function fetchSetsAllColors(
  rbPart: string,
  availableColors: PartAvailableColor[]
): Promise<PartInSet[]> {
  const colorList = availableColors ?? [];

  if (colorList.length > 0 && colorList.length <= 10) {
    const bySet = new Map<string, PartInSet>();

    for (const c of colorList) {
      let perColor: PartInSet[] = [];
      try {
        perColor = await getSetsForPart(rbPart, c.id);
      } catch {
        perColor = [];
      }

      for (const s of perColor) {
        const existing = bySet.get(s.setNumber);
        if (!existing) {
          bySet.set(s.setNumber, { ...s });
        } else {
          existing.quantity += s.quantity;
          if (s.year > existing.year) existing.year = s.year;
          if (!existing.imageUrl && s.imageUrl) {
            existing.imageUrl = s.imageUrl;
          }
        }
      }
    }

    return [...bySet.values()];
  }

  // Fallback: ask RB for unscoped sets when no color data or too many colors
  try {
    return await getSetsForPart(rbPart, undefined);
  } catch {
    return [];
  }
}

/**
 * Get part metadata (name, image, BrickLink ID).
 * Uses catalog (rb_parts.bl_part_id) for BL ID instead of external_ids JSON.
 */
async function getPartMetadata(rbPart: string): Promise<{
  name: string;
  imageUrl: string | null;
  blPartId: string | null;
}> {
  let name = '';
  let imageUrl: string | null = null;
  let blPartId: string | null = null;

  // Try catalog first for bl_part_id
  try {
    const supabase = getCatalogReadClient();
    const { data } = await supabase
      .from('rb_parts')
      .select('name, image_url, bl_part_id')
      .eq('part_num', rbPart)
      .maybeSingle();
    if (data) {
      name = data.name;
      imageUrl = data.image_url;
      blPartId = data.bl_part_id;
    }
  } catch {
    // fall through to API
  }

  // Fall back to Rebrickable API for metadata if catalog miss
  if (!name) {
    try {
      const partMeta = await getPart(rbPart);
      name = partMeta.name;
      if (!imageUrl) imageUrl = partMeta.part_img_url;
    } catch {
      // tolerate missing metadata
    }
  }

  return { name, imageUrl, blPartId };
}
