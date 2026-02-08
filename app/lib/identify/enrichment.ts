import 'server-only';

import { blGetPartColors, type BLColorEntry } from '@/app/lib/bricklink';
import { EXTERNAL } from '@/app/lib/constants';
import { getColors, getSetSummary } from '@/app/lib/rebrickable';
import { logger } from '@/lib/metrics';

import { PipelineBudget } from './budget';
import { type BLAvailableColor, type BLSet } from './types';

export async function buildBlAvailableColors(
  blPartId: string,
  budget: PipelineBudget
): Promise<BLAvailableColor[]> {
  const cols: BLColorEntry[] | null = await budget.withBudget(() =>
    blGetPartColors(blPartId)
  );
  if (!cols?.length) return [];

  // Map BL color ids to human-readable names via Rebrickable colors (cached in getColors()).
  const nameByBlId = new Map<number, string>();
  try {
    const rbColors = await getColors();
    for (const c of rbColors) {
      const bl = (
        c.external_ids as { BrickLink?: { ext_ids?: number[] } } | undefined
      )?.BrickLink;
      const ids: number[] | undefined = Array.isArray(bl?.ext_ids)
        ? bl.ext_ids
        : undefined;
      if (!ids) continue;
      for (const blId of ids) {
        if (!nameByBlId.has(blId)) {
          nameByBlId.set(blId, c.name);
        }
      }
    }
  } catch (err) {
    logger.warn('identify.rb_colors_mapping_failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return cols.map(c => ({
    id: c.color_id,
    name: nameByBlId.get(c.color_id) ?? String(c.color_id),
  }));
}

export async function enrichSetsWithRebrickable(
  sets: BLSet[],
  budget: PipelineBudget,
  limit: number = EXTERNAL.ENRICH_LIMIT
): Promise<BLSet[]> {
  const top = sets.slice(0, limit);
  const enriched = await Promise.all(
    top.map(async set => {
      const summary = await budget.withBudget(() =>
        getSetSummary(set.setNumber)
      );
      if (summary === null) return set; // budget exhausted
      return {
        ...set,
        year: summary.year ?? set.year,
        imageUrl: summary.imageUrl ?? set.imageUrl,
        numParts: summary.numParts ?? set.numParts ?? null,
        themeId: summary.themeId ?? set.themeId ?? null,
        themeName: summary.themeName ?? set.themeName ?? null,
      };
    })
  );
  return [...enriched, ...sets.slice(top.length)];
}
