import 'server-only';

import { getBricklinkColorNames } from '@/app/lib/bricklink/colors';
import {
  getBlMinifigImageUrl,
  getBlPartImageUrl,
  getMinifigPartsBl,
} from '@/app/lib/bricklink/minifigs';
import { LRUCache } from '@/app/lib/cache/lru';
import { getCatalogWriteClient } from '@/app/lib/db/catalogAccess';
import { logger } from '@/lib/metrics';

/**
 * Tracks failed enrichment attempts for exponential backoff retry scheduling.
 */
type FailedEnrichmentEntry = {
  failedAt: number;
  attempts: number;
};

// Track failed enrichments with LRU eviction (1000 entries, 24h TTL)
const failedEnrichments = new LRUCache<string, FailedEnrichmentEntry>(
  1000,
  24 * 60 * 60 * 1000
);

// Backoff intervals: 1h, 4h, 24h
const BACKOFF_INTERVALS_MS = [
  1 * 60 * 60 * 1000,
  4 * 60 * 60 * 1000,
  24 * 60 * 60 * 1000,
];

const MAX_RETRY_ATTEMPTS = BACKOFF_INTERVALS_MS.length;

function shouldSkipDueToBackoff(key: string): boolean {
  const entry = failedEnrichments.get(key);
  if (!entry) return false;
  if (entry.attempts >= MAX_RETRY_ATTEMPTS) return true;
  const backoffMs = BACKOFF_INTERVALS_MS[entry.attempts - 1] ?? 0;
  return Date.now() < entry.failedAt + backoffMs;
}

function recordFailedEnrichment(key: string): void {
  const existing = failedEnrichments.get(key);
  failedEnrichments.set(key, {
    failedAt: Date.now(),
    attempts: (existing?.attempts ?? 0) + 1,
  });
}

function clearFailedEnrichment(key: string): void {
  failedEnrichments.delete(key);
}

export type MinifigSubpart = {
  partId: string;
  name: string;
  colorId: number;
  colorName: string;
  quantity: number;
  imageUrl: string | null;
  bricklinkPartId: string | null;
};

export type MinifigEnrichmentResult = {
  /** BrickLink minifig ID (primary) */
  blMinifigNo: string;
  /** @deprecated Alias for blMinifigNo, for backward compatibility */
  blId: string;
  imageUrl: string | null;
  name: string | null;
  numParts: number | null;
  subparts: MinifigSubpart[] | null;
  enrichedAt: number;
};

/**
 * Enrich minifigs using BrickLink data only.
 *
 * This is the BL-only replacement for the old RB-based enrichment.
 * Data comes from:
 * - bl_set_minifigs (images, names)
 * - bricklink_minifigs (catalog metadata)
 * - bl_minifig_parts (component parts, self-healing)
 */
export async function enrichMinifigs(
  blMinifigNos: string[],
  options: { includeSubparts?: boolean; forceRefresh?: boolean } = {}
): Promise<Map<string, MinifigEnrichmentResult>> {
  const trimmed = Array.from(
    new Set(blMinifigNos.map(f => f.trim()).filter(Boolean))
  );
  const includeSubparts = options.includeSubparts ?? true;
  if (!trimmed.length) return new Map();

  const supabase = getCatalogWriteClient();
  const results = new Map<string, MinifigEnrichmentResult>();

  // Batch fetch from bl_set_minifigs for images/names
  const { data: blSetMinifigs, error: setMinifigsErr } = await supabase
    .from('bl_set_minifigs')
    .select('minifig_no, name, image_url')
    .in('minifig_no', trimmed);

  if (setMinifigsErr) {
    logger.warn('minifig_enrich.bl_set_minifigs_read_failed', {
      error: setMinifigsErr.message,
    });
  }

  // Build lookup map (take first non-null values for each minifig)
  const blDataByMinifig = new Map<
    string,
    { name: string | null; imageUrl: string | null }
  >();
  for (const row of blSetMinifigs ?? []) {
    const existing = blDataByMinifig.get(row.minifig_no);
    blDataByMinifig.set(row.minifig_no, {
      name: existing?.name ?? row.name ?? null,
      imageUrl: existing?.imageUrl ?? row.image_url ?? null,
    });
  }

  // Batch fetch from bricklink_minifigs catalog for additional metadata
  const { data: blCatalog, error: catalogErr } = await supabase
    .from('bricklink_minifigs')
    .select('item_id, name, item_year')
    .in('item_id', trimmed);

  if (catalogErr) {
    logger.warn('minifig_enrich.bricklink_minifigs_read_failed', {
      error: catalogErr.message,
    });
  }

  const catalogByMinifig = new Map<
    string,
    { name: string | null; year: number | null }
  >();
  for (const row of blCatalog ?? []) {
    catalogByMinifig.set(row.item_id, {
      name: row.name,
      year: row.item_year,
    });
  }

  // Initialize results with what we have
  for (const blMinifigNo of trimmed) {
    const setData = blDataByMinifig.get(blMinifigNo);
    const catalogData = catalogByMinifig.get(blMinifigNo);

    results.set(blMinifigNo, {
      blMinifigNo,
      blId: blMinifigNo, // Alias for backward compatibility
      // Use stored image URL or construct from BrickLink pattern
      imageUrl: setData?.imageUrl ?? getBlMinifigImageUrl(blMinifigNo),
      name: setData?.name ?? catalogData?.name ?? null,
      numParts: null, // Will be filled from parts if requested
      subparts: null,
      enrichedAt: Date.now(),
    });
  }

  // Fetch subparts if requested
  if (includeSubparts) {
    for (const blMinifigNo of trimmed) {
      // Skip if in backoff
      const backoffKey = `bl-parts:${blMinifigNo}`;
      if (shouldSkipDueToBackoff(backoffKey)) {
        logger.debug('minifig_enrich.parts_skipped_backoff', { blMinifigNo });
        continue;
      }

      try {
        // getMinifigPartsBl is self-healing - triggers BL API fetch if missing
        // Returns colorName from BL API (stored in bl_minifig_parts.color_name)
        const parts = await getMinifigPartsBl(blMinifigNo);
        clearFailedEnrichment(backoffKey);

        if (parts.length > 0) {
          // Collect color IDs that need name lookup (where BL didn't provide a name)
          // Coerce to numbers to handle potential string inputs from DB
          const missingColorIds = parts
            .filter(p => !p.colorName)
            .map(p => Number(p.blColorId));

          // Fast static lookup from BrickLink color mapping (no API call needed)
          const colorNameLookup =
            missingColorIds.length > 0
              ? getBricklinkColorNames(missingColorIds)
              : new Map<number, string>();

          const subparts: MinifigSubpart[] = parts.map(p => {
            const numColorId = Number(p.blColorId);
            return {
              partId: p.blPartId,
              name: p.name ?? p.blPartId,
              colorId: numColorId,
              // Use BL color name if available, else lookup from static map, else fallback
              colorName:
                p.colorName ??
                colorNameLookup.get(numColorId) ??
                `Color ${numColorId}`,
              quantity: p.quantity,
              imageUrl: getBlPartImageUrl(p.blPartId, numColorId),
              bricklinkPartId: p.blPartId, // Already BL ID
            };
          });

          const prev = results.get(blMinifigNo)!;
          results.set(blMinifigNo, {
            ...prev,
            blId: blMinifigNo, // Ensure alias is preserved
            numParts: parts.length,
            subparts,
            enrichedAt: Date.now(),
          });
        }
      } catch (err) {
        recordFailedEnrichment(backoffKey);
        logger.warn('minifig_enrich.parts_fetch_failed', {
          blMinifigNo,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  return results;
}

/**
 * Enrich a single minifig - convenience wrapper.
 */
export async function enrichMinifig(
  blMinifigNo: string,
  options: { includeSubparts?: boolean } = {}
): Promise<MinifigEnrichmentResult | null> {
  const results = await enrichMinifigs([blMinifigNo], options);
  return results.get(blMinifigNo) ?? null;
}
