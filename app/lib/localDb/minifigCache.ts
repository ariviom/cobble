/**
 * Minifigure cache operations for IndexedDB.
 *
 * Provides local-first caching for minifig metadata and RB→BL mappings so that
 * subsequent lookups can avoid network/database round-trips.
 */

import {
  getLocalDb,
  isIndexedDBAvailable,
  type CatalogMinifig,
} from './schema';

const MINIFIG_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h, aligned with catalog TTLs

function isFresh(entry: CatalogMinifig | undefined | null): entry is CatalogMinifig {
  if (!entry) return false;
  const now = Date.now();
  return now - entry.cachedAt <= MINIFIG_CACHE_TTL_MS;
}

/**
 * Get a cached minifig by Rebrickable fig_num.
 */
export async function getCachedMinifig(figNum: string): Promise<CatalogMinifig | null> {
  if (!isIndexedDBAvailable()) return null;
  const trimmed = figNum.trim();
  if (!trimmed) return null;

  try {
    const db = getLocalDb();
    const row = await db.catalogMinifigs.get(trimmed);
    if (isFresh(row)) return row;
    return null;
  } catch (error) {
    console.warn('Failed to read minifig from cache:', error);
    return null;
  }
}

/**
 * Get a cached minifig by BrickLink ID (secondary index).
 */
export async function getCachedMinifigByBlId(blId: string): Promise<CatalogMinifig | null> {
  if (!isIndexedDBAvailable()) return null;
  const trimmed = blId.trim();
  if (!trimmed) return null;

  try {
    const db = getLocalDb();
    const row = await db.catalogMinifigs.where('blId').equals(trimmed).first();
    if (isFresh(row)) return row;
    return null;
  } catch (error) {
    console.warn('Failed to read minifig by BL ID from cache:', error);
    return null;
  }
}

/**
 * Cache a single minifig entry.
 */
export async function setCachedMinifig(minifig: Omit<CatalogMinifig, 'cachedAt'>): Promise<void> {
  if (!isIndexedDBAvailable()) return;
  try {
    const db = getLocalDb();
    await db.catalogMinifigs.put({ ...minifig, cachedAt: Date.now() });
  } catch (error) {
    console.warn('Failed to cache minifig:', error);
  }
}

/**
 * Bulk cache minifigs (no-op when empty).
 */
export async function bulkSetCachedMinifigs(
  minifigs: Array<Omit<CatalogMinifig, 'cachedAt'>>
): Promise<void> {
  if (!isIndexedDBAvailable()) return;
  if (!minifigs.length) return;

  try {
    const db = getLocalDb();
    const now = Date.now();
    await db.catalogMinifigs.bulkPut(
      minifigs.map(m => ({
        ...m,
        cachedAt: now,
      }))
    );
  } catch (error) {
    console.warn('Failed to bulk cache minifigs:', error);
  }
}


