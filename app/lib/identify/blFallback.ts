// Clean rewritten BL fallback with cache, subset-intersection, and structured sources.
import 'server-only';

import {
  blGetPart,
  blGetPartColors,
  blGetPartSubsets,
  blGetPartSupersets,
  type BLSupersetItem,
} from '@/app/lib/bricklink';
import { EXTERNAL } from '@/app/lib/constants';
import { logger } from '@/lib/metrics';
import {
  getSetsForPart,
  resolvePartIdToRebrickable,
} from '@/app/lib/rebrickable';
import {
  buildBlAvailableColors,
  enrichSetsWithRebrickable,
} from './enrichment';
import {
  ExternalCallBudget,
  isBudgetError,
  withBudget,
  type BLFallbackResult,
  type BLSet,
  type BLSource,
} from './types';
import { getSupabaseServiceRoleClient } from '../supabaseServiceRoleClient';

type FetchOptions = {
  initialImage?: string | null;
  initialName?: string;
  colorVariantLimit?: number;
  supersetLimit?: number;
  enrichLimit?: number;
  componentLimit?: number;
  blColorId?: number;
};

const BL_FALLBACK_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function normalizeBLImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith('//')) return `https:${url}`;
  return url;
}

function toBLSet(entries: BLSupersetItem[]): BLSet[] {
  return entries.map(s => ({
    setNumber: s.setNumber,
    name: s.name,
    year: 0,
    imageUrl: normalizeBLImageUrl(s.imageUrl),
    quantity: s.quantity,
    numParts: null,
    themeId: null,
    themeName: null,
  }));
}

function dedupeSets(sets: BLSet[]): BLSet[] {
  const seen = new Set<string>();
  return sets.filter(s => {
    const key = s.setNumber.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function intersectSets(lists: BLSet[][]): BLSet[] {
  if (!lists.length) return [];
  let intersection = new Map<string, BLSet>();
  for (const s of lists[0] ?? []) {
    intersection.set(s.setNumber.toLowerCase(), { ...s });
  }
  for (let i = 1; i < lists.length; i++) {
    const next = new Map<string, BLSet>();
    for (const s of lists[i] ?? []) {
      const key = s.setNumber.toLowerCase();
      if (intersection.has(key)) {
        next.set(key, { ...s });
      }
    }
    intersection = next;
    if (!intersection.size) break;
  }
  return Array.from(intersection.values());
}

async function fetchSupersetsWithColorFallback(
  blId: string,
  budget: ExternalCallBudget,
  colorVariantLimit: number,
  supersetLimit: number,
  initialColorId?: number
): Promise<{
  sets: BLSet[];
  subsets: Awaited<ReturnType<typeof blGetPartSubsets>>;
}> {
  let setsFromBL = toBLSet(
    await withBudget(budget, () => blGetPartSupersets(blId, initialColorId))
  );
  let subsets: Awaited<ReturnType<typeof blGetPartSubsets>> = [];
  if (setsFromBL.length >= supersetLimit)
    return { sets: setsFromBL.slice(0, supersetLimit), subsets };

  try {
    const colors = await withBudget(budget, () => blGetPartColors(blId));
    for (const c of (colors ?? []).slice(0, colorVariantLimit)) {
      if (typeof c?.color_id !== 'number') continue;
      const supByColor = await withBudget(budget, () =>
        blGetPartSupersets(blId, c.color_id)
      );
      setsFromBL = setsFromBL.concat(toBLSet(supByColor));
      if (setsFromBL.length >= supersetLimit) break;
    }
    if (setsFromBL.length >= supersetLimit)
      return { sets: setsFromBL.slice(0, supersetLimit), subsets };

    subsets = await withBudget(budget, () => blGetPartSubsets(blId));
    logger.debug('identify.bl_subsets_fetch', {
      blId,
      colorId: null,
      count: subsets.length,
      sample: subsets[0] ?? null,
    });
    const uniqColorIds = new Map<number, string | undefined>();
    for (const entry of subsets ?? []) {
      if (
        typeof entry?.color_id === 'number' &&
        !uniqColorIds.has(entry.color_id)
      ) {
        uniqColorIds.set(entry.color_id, entry.color_name);
      }
    }
    for (const [colorId] of uniqColorIds) {
      const supByColor = await withBudget(budget, () =>
        blGetPartSupersets(blId, colorId)
      );
      setsFromBL = setsFromBL.concat(toBLSet(supByColor));
      if (setsFromBL.length >= supersetLimit) break;
    }
  } catch (err) {
    if (isBudgetError(err)) throw err;
    logger.warn('identify.bl_supersets_fallback_failed', {
      blId,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  logger.debug('identify.bl_supersets_fetch', {
    blId,
    initialColorId: initialColorId ?? null,
    setCount: setsFromBL.length,
    subsetCount: subsets.length,
    sample: setsFromBL[0] ?? null,
  });

  return { sets: dedupeSets(setsFromBL).slice(0, supersetLimit), subsets };
}

async function loadCachedSupersets(blId: string): Promise<{
  sets: BLSet[];
  partName: string | null;
  partImage: string | null;
  source: BLSource;
} | null> {
  try {
    const supabase = getSupabaseServiceRoleClient();
    const cutoff = new Date(Date.now() - BL_FALLBACK_TTL_MS).toISOString();
    const { data: partRow, error: partErr } = await supabase
      .from('bl_parts')
      .select('*')
      .eq('bl_part_id', blId)
      .gte('last_fetched_at', cutoff)
      .maybeSingle();
    if (partErr || !partRow) return null;

    const { data: setRows, error: setErr } = await supabase
      .from('bl_part_sets')
      .select('set_num, quantity, source, last_fetched_at')
      .eq('bl_part_id', blId)
      .gte('last_fetched_at', cutoff);
    if (setErr || !setRows || !setRows.length) return null;

    const sets: BLSet[] = setRows.map(row => ({
      setNumber: row.set_num,
      name: row.set_num,
      year: 0,
      imageUrl: null,
      quantity: row.quantity ?? 1,
      numParts: null,
      themeId: null,
      themeName: null,
    }));

    const source =
      (setRows[0]?.source as BLSource | undefined) ?? 'bl_supersets';

    return {
      sets,
      partName: partRow.name ?? null,
      partImage: partRow.image_url ?? null,
      source,
    };
  } catch {
    return null;
  }
}

async function upsertCachedSupersets(
  blId: string,
  partName: string | null,
  partImage: string | null,
  source: BLSource,
  sets: BLSet[]
) {
  try {
    const supabase = getSupabaseServiceRoleClient();
    await supabase.from('bl_parts').upsert({
      bl_part_id: blId,
      name: partName ?? null,
      image_url: partImage ?? null,
      last_fetched_at: new Date().toISOString(),
    });
    if (!sets.length) return;
    const rows = sets.map(s => ({
      bl_part_id: blId,
      set_num: s.setNumber,
      quantity: s.quantity,
      source,
      last_fetched_at: new Date().toISOString(),
    }));
    await supabase.from('bl_part_sets').upsert(rows);
  } catch (err) {
    logger.warn('identify.bl_cache_upsert_failed', {
      blId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function fetchBLSupersetsFallback(
  blId: string,
  budget: ExternalCallBudget,
  options?: FetchOptions
): Promise<BLFallbackResult> {
  const colorVariantLimit =
    options?.colorVariantLimit ?? EXTERNAL.BL_COLOR_VARIANT_LIMIT;
  const supersetLimit =
    options?.supersetLimit ?? EXTERNAL.BL_SUPERSET_TOTAL_LIMIT;
  const enrichLimit = options?.enrichLimit ?? EXTERNAL.ENRICH_LIMIT;
  const componentLimit = options?.componentLimit ?? 8;
  const blColorId = options?.blColorId;

  let setsFromBL: BLSet[] = [];
  let partImage: string | null = options?.initialImage ?? null;
  let partName = options?.initialName ?? '';
  let subsets: Awaited<ReturnType<typeof blGetPartSubsets>> = [];
  let source: BLSource = 'bl_supersets';

  const cached = await loadCachedSupersets(blId);
  if (cached) {
    setsFromBL = cached.sets;
    partName = cached.partName ?? partName;
    partImage = cached.partImage ?? partImage;
    source = cached.source;
    logger.debug('identify.bl_cache_hit', {
      blPart: blId,
      source,
      setCount: setsFromBL.length,
      sample: setsFromBL[0] ?? null,
    });
  }

  const shouldRefresh = setsFromBL.length === 0;

  try {
    if (shouldRefresh) {
      const result = await fetchSupersetsWithColorFallback(
        blId,
        budget,
        colorVariantLimit,
        supersetLimit,
        blColorId
      );
      setsFromBL = result.sets;
      subsets = result.subsets;
      logger.debug('identify.bl_supersets_raw', {
        blPart: blId,
        setCount: setsFromBL.length,
        subsetCount: subsets.length,
        sample: setsFromBL[0] ?? null,
      });
    }
  } catch (err) {
    if (isBudgetError(err)) throw err;
  }

  // Deterministic intersection using subsets and our RB catalog
  if (!setsFromBL.length && subsets.length) {
    logger.debug('identify.bl_subsets_available', {
      blPart: blId,
      subsetCount: subsets.length,
      subsetSample: subsets[0] ?? null,
    });

    const components = subsets
      .map(s => ({
        partNum: s?.item?.no,
        colorId: typeof s?.color_id === 'number' ? s.color_id : undefined,
      }))
      .filter(c => typeof c.partNum === 'string') as {
      partNum: string;
      colorId?: number;
    }[];

    const limited = components.slice(0, componentLimit);
    const perComponentSets: BLSet[][] = [];
    for (const comp of limited) {
      try {
        const resolved = await resolvePartIdToRebrickable(comp.partNum);
        if (!resolved) continue;
        const rbSets = await getSetsForPart(resolved.partNum, comp.colorId);
        const mapped = rbSets.map(s => ({
          setNumber: s.setNumber,
          name: s.name ?? s.setNumber,
          year: s.year,
          imageUrl: normalizeBLImageUrl(s.imageUrl),
          quantity: s.quantity,
          numParts: s.numParts ?? null,
          themeId: s.themeId ?? null,
          themeName: s.themeName ?? null,
        }));
        if (mapped.length) perComponentSets.push(mapped);
      } catch (err) {
        if (isBudgetError(err)) throw err;
        logger.warn('identify.bl_component_intersection_failed', {
          blId,
          component: comp.partNum,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    if (
      perComponentSets.length === limited.length &&
      perComponentSets.length > 0
    ) {
      setsFromBL = intersectSets(perComponentSets).slice(0, supersetLimit);
      if (setsFromBL.length) {
        source = 'bl_subsets_intersection';
      }
      logger.debug('identify.bl_subset_intersection', {
        blPart: blId,
        componentCount: limited.length,
        setCount: setsFromBL.length,
        sample: setsFromBL[0] ?? null,
      });
    }
  }

  // Supersets of subparts (BL) as a supplemental deterministic path
  if (!setsFromBL.length && subsets.length) {
    for (const sub of subsets.slice(
      0,
      Math.min(subsets.length, colorVariantLimit)
    )) {
      const partNo = sub?.item?.no;
      if (!partNo) continue;
      try {
        let sup = await withBudget(budget, () =>
          blGetPartSupersets(partNo, sub.color_id)
        );
        if (!sup.length) {
          sup = await withBudget(budget, () => blGetPartSupersets(partNo));
        }
        setsFromBL = setsFromBL.concat(toBLSet(sup));
        if (setsFromBL.length >= supersetLimit) {
          break;
        }
      } catch (err) {
        if (isBudgetError(err)) throw err;
        logger.warn('identify.bl_subpart_supersets_failed', {
          blId,
          subPart: partNo,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    if (setsFromBL.length) {
      source = 'bl_supersets';
      logger.debug('identify.bl_subpart_supersets', {
        blPart: blId,
        setCount: setsFromBL.length,
        sample: setsFromBL[0] ?? null,
      });
    }
  }

  // Heuristic component-based inference (last resort)
  if (!setsFromBL.length && subsets.length) {
    const components = subsets
      .map(s => ({
        partNum: s?.item?.no,
        colorId: typeof s?.color_id === 'number' ? s.color_id : undefined,
      }))
      .filter(c => typeof c.partNum === 'string') as {
      partNum: string;
      colorId?: number;
    }[];

    const limited = components.slice(0, componentLimit);
    const setHitMap = new Map<
      string,
      {
        set: BLSet;
        hits: number;
      }
    >();

    for (const comp of limited) {
      try {
        const resolved = await resolvePartIdToRebrickable(comp.partNum);
        if (!resolved) continue;
        const rbSets = await getSetsForPart(resolved.partNum, comp.colorId);
        for (const s of rbSets) {
          const key = s.setNumber.toLowerCase();
          const existing = setHitMap.get(key);
          const entry: BLSet = {
            setNumber: s.setNumber,
            name: s.name ?? s.setNumber,
            year: s.year,
            imageUrl: normalizeBLImageUrl(s.imageUrl),
            quantity: s.quantity,
            numParts: s.numParts ?? null,
            themeId: s.themeId ?? null,
            themeName: s.themeName ?? null,
          };
          if (existing) {
            existing.hits += 1;
          } else {
            setHitMap.set(key, { set: entry, hits: 1 });
          }
        }
        if (setHitMap.size >= supersetLimit) break;
      } catch (err) {
        if (isBudgetError(err)) throw err;
        logger.warn('identify.bl_component_fallback_failed', {
          blId,
          component: comp.partNum,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    if (setHitMap.size) {
      setsFromBL = Array.from(setHitMap.values())
        .sort(
          (a, b) =>
            b.hits - a.hits ||
            b.set.quantity - a.set.quantity ||
            b.set.year - a.set.year
        )
        .map(entry => entry.set)
        .slice(0, supersetLimit);
      source = 'bl_components';
      logger.debug('identify.bl_component_inference', {
        blPart: blId,
        setCount: setsFromBL.length,
        sample: setsFromBL[0] ?? null,
      });
    }
  }

  try {
    const meta = await withBudget(budget, () => blGetPart(blId));
    partName = meta?.name ?? partName;
    const metaWithImage = meta as { image_url?: unknown };
    partImage = normalizeBLImageUrl(
      typeof metaWithImage.image_url === 'string'
        ? metaWithImage.image_url
        : partImage
    );
  } catch (err) {
    if (isBudgetError(err)) throw err;
  }

  let blAvailableColors: BLFallbackResult['blAvailableColors'] = [];
  try {
    blAvailableColors = await buildBlAvailableColors(blId, budget);
  } catch (err) {
    if (isBudgetError(err)) throw err;
  }

  if (setsFromBL.length) {
    try {
      setsFromBL = await enrichSetsWithRebrickable(
        setsFromBL,
        budget,
        enrichLimit
      );
    } catch (err) {
      if (isBudgetError(err)) throw err;
    }
  }

  if (process.env.NODE_ENV !== 'production') {
    logger.debug('identify.bl_fallback', {
      blPart: blId,
      colorCount: blAvailableColors.length,
      setCount: setsFromBL.length,
      source,
    });
  }

  await upsertCachedSupersets(blId, partName, partImage, source, setsFromBL);

  return {
    sets: setsFromBL,
    partName,
    partImage,
    blAvailableColors,
    source,
  };
}
