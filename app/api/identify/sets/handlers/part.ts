import { blGetPartSupersets, type BLSupersetItem } from '@/app/lib/bricklink';
import { getSetsForPartLocal } from '@/app/lib/catalog';
import {
  getPart,
  getPartColorsForPart,
  getSetsForPart,
  getSetSummary,
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

  // Get part metadata
  const {
    name: partMetaName,
    imageUrl: partMetaImage,
    blPartId,
  } = await getPartMetadata(rbPart);

  // BrickLink fallback for parts not found in Rebrickable
  if (!sets.length && blPartId) {
    sets = await fetchBrickLinkSupersets(blPartId);
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
    },
    availableColors,
    selectedColorId: selectedColorId ?? null,
    sets: finalSets,
  };
}

/**
 * Resolve a part ID to its Rebrickable equivalent.
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
      // keep original
    }
    return part;
  }
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
 */
async function getPartMetadata(rbPart: string): Promise<{
  name: string;
  imageUrl: string | null;
  blPartId: string | null;
}> {
  let name = '';
  let imageUrl: string | null = null;
  let blPartId: string | null = null;

  try {
    const partMeta = await getPart(rbPart);
    name = partMeta.name;
    imageUrl = partMeta.part_img_url;

    const external = (
      partMeta.external_ids as
        | {
            BrickLink?: { ext_ids?: unknown[] };
          }
        | undefined
    )?.BrickLink;

    const extIds: unknown[] = Array.isArray(external?.ext_ids)
      ? external!.ext_ids!
      : [];

    const firstId = extIds.find(
      id => typeof id === 'string' || typeof id === 'number'
    );

    if (firstId !== undefined && firstId !== null) {
      blPartId = String(firstId);
    }
  } catch {
    // tolerate missing metadata
  }

  return { name, imageUrl, blPartId };
}

/**
 * Fetch sets from BrickLink supersets API and enrich with Rebrickable metadata.
 */
async function fetchBrickLinkSupersets(blPartId: string): Promise<PartInSet[]> {
  try {
    let supersets: BLSupersetItem[] = [];
    try {
      supersets = await blGetPartSupersets(blPartId);
    } catch {
      supersets = [];
    }

    let blSets: PartInSet[] = (supersets ?? []).map(s => ({
      setNumber: s.setNumber,
      name: s.name,
      year: 0,
      imageUrl: s.imageUrl,
      quantity: s.quantity,
      numParts: null,
      themeId: null,
      themeName: null,
    }));

    // Enrich BL-derived sets with Rebrickable set metadata
    try {
      const top = blSets.slice(0, 20);
      const enriched = await Promise.all(
        top.map(async set => {
          try {
            const summary = await getSetSummary(set.setNumber);
            return {
              ...set,
              year: summary.year ?? set.year,
              imageUrl: summary.imageUrl ?? set.imageUrl,
              numParts: summary.numParts ?? set.numParts ?? null,
              themeId: summary.themeId ?? set.themeId ?? null,
              themeName: summary.themeName ?? set.themeName ?? null,
            };
          } catch {
            return set;
          }
        })
      );
      blSets = [...enriched, ...blSets.slice(top.length)];
    } catch {
      // best-effort enrichment; ignore failures
    }

    return blSets;
  } catch {
    return [];
  }
}
