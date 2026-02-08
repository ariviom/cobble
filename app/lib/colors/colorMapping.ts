import 'server-only';

import { getCatalogReadClient } from '@/app/lib/db/catalogAccess';
import { logger } from '@/lib/metrics';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ColorMaps = {
  /** Rebrickable color ID → BrickLink color ID */
  rbToBl: Map<number, number>;
  /** BrickLink color ID → Rebrickable color ID */
  blToRb: Map<number, number>;
};

// ---------------------------------------------------------------------------
// Cache (24hr TTL, same as the old API-based cache)
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
let cache: { at: number; maps: ColorMaps } | null = null;

// ---------------------------------------------------------------------------
// Core: build color maps from rb_colors table
// ---------------------------------------------------------------------------

/**
 * Parse `external_ids` JSON from an `rb_colors` row to extract BrickLink IDs.
 *
 * Expected shape: `{ "BrickLink": { "ext_ids": [11], "ext_descrs": [...] }, ... }`
 */
function extractBlColorIds(externalIds: unknown): number[] {
  if (typeof externalIds !== 'object' || externalIds == null) return [];
  const bl = (externalIds as Record<string, unknown>)['BrickLink'];
  if (typeof bl !== 'object' || bl == null) return [];
  const extIds = (bl as Record<string, unknown>)['ext_ids'];
  if (!Array.isArray(extIds)) return [];
  return extIds.filter((id): id is number => typeof id === 'number');
}

/**
 * Build both RB→BL and BL→RB color maps from the `rb_colors` table.
 *
 * Uses the anon-readable `rb_colors` table (no service role needed).
 * Returns empty maps on DB error (graceful degradation — same as the old
 * API-based approach).
 */
async function buildColorMapsFromDb(): Promise<ColorMaps> {
  const rbToBl = new Map<number, number>();
  const blToRb = new Map<number, number>();

  try {
    const supabase = getCatalogReadClient();
    const { data, error } = await supabase
      .from('rb_colors')
      .select('id, external_ids');

    if (error) {
      logger.warn('colorMapping.build_failed', { error: error.message });
      return { rbToBl, blToRb };
    }

    for (const row of data ?? []) {
      const blIds = extractBlColorIds(row.external_ids);
      if (blIds.length > 0) {
        // Use the first BL color ID as the canonical mapping
        rbToBl.set(row.id, blIds[0]!);
        for (const blId of blIds) {
          // First RB mapping wins (consistent with old API-based behavior)
          if (!blToRb.has(blId)) {
            blToRb.set(blId, row.id);
          }
        }
      }
    }
  } catch (err) {
    logger.warn('colorMapping.build_error', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return { rbToBl, blToRb };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get both color maps (cached 24hr). Sources from `rb_colors.external_ids`.
 *
 * Zero external API calls — purely DB-backed.
 */
export async function getColorMaps(): Promise<ColorMaps> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_TTL_MS) {
    return cache.maps;
  }

  const maps = await buildColorMapsFromDb();
  cache = { at: now, maps };
  return maps;
}

/** Convenience: BL→RB direction only. */
export async function getBlToRbColorMap(): Promise<Map<number, number>> {
  const { blToRb } = await getColorMaps();
  return blToRb;
}

/** Convenience: RB→BL direction only (replaces old API-based function). */
export async function getRbToBlColorMapFromDb(): Promise<Map<number, number>> {
  const { rbToBl } = await getColorMaps();
  return rbToBl;
}

/** Reset cache (for testing). */
export function _resetColorMapCache(): void {
  cache = null;
}
