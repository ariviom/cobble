import { getSetSummaryLocal } from '@/app/lib/catalog';
import { getSetSummary, type PartInSet } from '@/app/lib/rebrickable';
import { logEvent } from '@/lib/metrics';

/**
 * Enrich sets with full metadata (numParts, theme, year, etc.)
 * Uses local catalog first, falls back to Rebrickable API.
 */
export async function enrichSets(
  sets: PartInSet[],
  limit: number = 30
): Promise<PartInSet[]> {
  const targets = sets.slice(0, limit);

  const summaries = await Promise.all(
    targets.map(async set => {
      try {
        const summary =
          (await getSetSummaryLocal(set.setNumber)) ??
          (await getSetSummary(set.setNumber));
        return { setNumber: set.setNumber.toLowerCase(), summary };
      } catch (err) {
        if (process.env.NODE_ENV !== 'production') {
          logEvent('identify.sets.enrichment_failed', {
            set: set.setNumber,
            error: err instanceof Error ? err.message : String(err),
          });
        }
        return null;
      }
    })
  );

  const summaryBySet = new Map<
    string,
    Awaited<ReturnType<typeof getSetSummary>>
  >();
  for (const item of summaries) {
    if (item?.summary) summaryBySet.set(item.setNumber, item.summary);
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

/**
 * Ensure all sets have a displayable name (fallback to setNumber).
 */
export function ensureSetNames(sets: PartInSet[]): PartInSet[] {
  return sets.map(s => ({
    ...s,
    name: s.name && s.name.trim() ? s.name : s.setNumber,
  }));
}

/**
 * Check if sets need enrichment (missing key metadata).
 */
export function setsNeedEnrichment(sets: PartInSet[]): boolean {
  return sets.some(
    s =>
      !s.name ||
      s.name.trim() === '' ||
      s.year === 0 ||
      s.numParts == null ||
      s.themeName == null
  );
}

/**
 * Sort sets by quantity (descending), then year (descending).
 */
export function sortSets(sets: PartInSet[]): PartInSet[] {
  return [...sets].sort((a, b) => {
    if (b.quantity !== a.quantity) return b.quantity - a.quantity;
    return b.year - a.year;
  });
}
