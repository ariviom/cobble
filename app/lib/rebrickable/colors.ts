import { rbFetch, rbFetchAbsolute } from '@/app/lib/rebrickable/client';
import type { RebrickableColor } from '@/app/lib/rebrickable/types';

let colorsCache: { at: number; items: RebrickableColor[] } | null = null;

export async function getColors(): Promise<RebrickableColor[]> {
  const now = Date.now();
  if (colorsCache && now - colorsCache.at < 60 * 60 * 1000) {
    return colorsCache.items;
  }
  const allColors: RebrickableColor[] = [];
  let nextUrl: string | null = null;
  let firstPage = true;

  while (firstPage || nextUrl) {
    const page: { results: RebrickableColor[]; next: string | null } = firstPage
      ? await rbFetch<{ results: RebrickableColor[]; next: string | null }>(
          '/lego/colors/',
          { page_size: 1000 }
        )
      : await rbFetchAbsolute<{
          results: RebrickableColor[];
          next: string | null;
        }>(nextUrl!);
    allColors.push(...page.results);
    nextUrl = page.next;
    firstPage = false;
  }

  colorsCache = { at: now, items: allColors };
  return allColors;
}

/**
 * Map a BrickLink color id to a Rebrickable color id, using external_ids mapping.
 * Returns null if no mapping found.
 */
export async function mapBrickLinkColorIdToRebrickableColorId(
  blColorId: number
): Promise<number | null> {
  const all = await getColors();
  for (const c of all) {
    const bl = (
      c.external_ids as { BrickLink?: { ext_ids?: number[] } } | undefined
    )?.BrickLink;
    const ids: number[] | undefined = Array.isArray(bl?.ext_ids)
      ? bl.ext_ids
      : undefined;
    if (ids && ids.includes(blColorId)) return c.id;
  }
  return null;
}

/**
 * Map a BrickLink color id to a color name using Rebrickable's external_ids mapping.
 * Returns null if no mapping found.
 *
 * Example: BL color 88 (Reddish Brown) → "Reddish Brown"
 */
export async function getColorNameFromBrickLinkId(
  blColorId: number
): Promise<string | null> {
  const all = await getColors();
  for (const c of all) {
    const bl = (
      c.external_ids as { BrickLink?: { ext_ids?: number[] } } | undefined
    )?.BrickLink;
    const ids: number[] | undefined = Array.isArray(bl?.ext_ids)
      ? bl.ext_ids
      : undefined;
    if (ids && ids.includes(blColorId)) return c.name;
  }
  return null;
}

/**
 * Batch lookup color names for multiple BrickLink color IDs.
 * Returns a Map of blColorId → colorName.
 * More efficient than calling getColorNameFromBrickLinkId multiple times.
 */
export async function getColorNamesFromBrickLinkIds(
  blColorIds: number[]
): Promise<Map<number, string>> {
  if (blColorIds.length === 0) return new Map();

  const all = await getColors();
  const uniqueIds = new Set(blColorIds);
  const result = new Map<number, string>();

  for (const c of all) {
    const bl = (
      c.external_ids as { BrickLink?: { ext_ids?: number[] } } | undefined
    )?.BrickLink;
    const ids: number[] | undefined = Array.isArray(bl?.ext_ids)
      ? bl.ext_ids
      : undefined;
    if (ids) {
      for (const blId of ids) {
        if (uniqueIds.has(blId) && !result.has(blId)) {
          result.set(blId, c.name);
        }
      }
    }
  }

  return result;
}
