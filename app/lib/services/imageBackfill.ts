import 'server-only';

import type { InventoryRow } from '@/app/components/set/types';
import { blGetPart, normalizeBLImageUrl } from '@/app/lib/bricklink';
import { getCatalogWriteClient } from '@/app/lib/db/catalogAccess';
import { logger } from '@/lib/metrics';

const BL_IMAGE_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours (BL ToS compliant)
const MAX_BL_IMAGE_FETCHES = 10;
const BATCH_SIZE = 200;

/**
 * Resolve the BrickLink part ID for a row, using the identity chain:
 * identity.blPartId (most accurate) → bricklinkPartId → partId (same-by-default)
 */
function getBlPartId(row: InventoryRow): string {
  return row.identity?.blPartId ?? row.bricklinkPartId ?? row.partId;
}

type CachedImage = {
  bl_part_id: string;
  image_url: string | null;
  last_fetched_at: string;
};

/**
 * Batch-query bl_parts cache for image URLs within TTL.
 * Returns a map of blPartId → imageUrl (null means "no image on BL").
 */
async function lookupCachedImages(
  blPartIds: string[]
): Promise<Map<string, string | null>> {
  const result = new Map<string, string | null>();
  if (blPartIds.length === 0) return result;

  const supabase = getCatalogWriteClient();
  const cutoff = new Date(Date.now() - BL_IMAGE_CACHE_TTL_MS).toISOString();

  for (let i = 0; i < blPartIds.length; i += BATCH_SIZE) {
    const batch = blPartIds.slice(i, i + BATCH_SIZE);
    const { data, error } = await supabase
      .from('bl_parts')
      .select('bl_part_id, image_url, last_fetched_at')
      .in('bl_part_id', batch)
      .gte('last_fetched_at', cutoff);

    if (error) {
      logger.warn('imageBackfill.cache_lookup_failed', {
        error: error.message,
        batchStart: i,
      });
      continue;
    }

    for (const row of (data as CachedImage[]) ?? []) {
      result.set(row.bl_part_id, normalizeBLImageUrl(row.image_url));
    }
  }

  return result;
}

/**
 * Fetch a single part's image from BL API and upsert to bl_parts cache.
 * Returns the normalized image URL (or null if BL has no image).
 */
async function fetchAndCacheImage(blPartId: string): Promise<string | null> {
  const part = await blGetPart(blPartId);
  const imageUrl = normalizeBLImageUrl(part.image_url);

  const supabase = getCatalogWriteClient();
  await supabase.from('bl_parts').upsert({
    bl_part_id: blPartId,
    name: part.name ?? null,
    image_url: imageUrl,
    last_fetched_at: new Date().toISOString(),
  });

  return imageUrl;
}

/**
 * Backfill missing part images from BrickLink.
 *
 * Runs after identity resolution and rarity enrichment. Collects rows with
 * null imageUrl (skipping minifig parents), checks the bl_parts DB cache,
 * then fetches up to MAX_BL_IMAGE_FETCHES from the BL API for cache misses.
 * Mutates rows in-place. Fully graceful — BL failures never block inventory.
 */
export async function backfillBLImages(rows: InventoryRow[]): Promise<void> {
  // 1. Collect rows needing images, dedup by BL part ID
  const rowsByBlId = new Map<string, InventoryRow[]>();
  for (const row of rows) {
    if (row.imageUrl != null) continue;
    if (row.partId.startsWith('fig:')) continue;

    const blPartId = getBlPartId(row);
    const existing = rowsByBlId.get(blPartId);
    if (existing) {
      existing.push(row);
    } else {
      rowsByBlId.set(blPartId, [row]);
    }
  }

  if (rowsByBlId.size === 0) return;

  // 2. Batch-query cache
  const blPartIds = Array.from(rowsByBlId.keys());
  const cached = await lookupCachedImages(blPartIds);

  // 3. Apply cached images and collect misses
  const misses: string[] = [];
  for (const [blPartId, rowGroup] of rowsByBlId) {
    if (cached.has(blPartId)) {
      const imageUrl = cached.get(blPartId)!;
      if (imageUrl) {
        for (const row of rowGroup) {
          row.imageUrl = imageUrl;
        }
      }
    } else {
      misses.push(blPartId);
    }
  }

  if (misses.length === 0) return;

  // 4. Fetch from BL API (capped, parallel, error-isolated)
  const toFetch = misses.slice(0, MAX_BL_IMAGE_FETCHES);
  const results = await Promise.allSettled(
    toFetch.map(async blPartId => {
      const imageUrl = await fetchAndCacheImage(blPartId);
      return { blPartId, imageUrl };
    })
  );

  // 5. Apply fetched images
  for (const result of results) {
    if (result.status !== 'fulfilled') continue;
    const { blPartId, imageUrl } = result.value;
    if (!imageUrl) continue;
    const rowGroup = rowsByBlId.get(blPartId);
    if (!rowGroup) continue;
    for (const row of rowGroup) {
      row.imageUrl = imageUrl;
    }
  }

  const fetchedCount = results.filter(r => r.status === 'fulfilled').length;
  const failedCount = results.filter(r => r.status === 'rejected').length;
  if (failedCount > 0) {
    logger.warn('imageBackfill.partial_fetch_failures', {
      fetched: fetchedCount,
      failed: failedCount,
      remaining: misses.length - toFetch.length,
    });
  }
}
