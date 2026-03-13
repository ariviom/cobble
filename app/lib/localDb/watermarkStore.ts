/**
 * Sync watermark operations for IndexedDB.
 *
 * Tracks the highest sync_version seen from the server per (user, set).
 * Used by delta pull to fetch only rows changed since the last pull.
 */

import { getLocalDb, isIndexedDBAvailable } from './schema';

/**
 * Get the sync watermark for a (user, set) pair.
 * Returns 0 if no watermark exists (triggers full pull).
 */
export async function getWatermark(
  userId: string,
  setNumber: string
): Promise<number> {
  if (!isIndexedDBAvailable()) return 0;

  try {
    const db = getLocalDb();
    const entry = await db.syncWatermarks.get([userId, setNumber]);
    return entry?.lastSyncVersion ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Set the sync watermark for a (user, set) pair.
 */
export async function setWatermark(
  userId: string,
  setNumber: string,
  lastSyncVersion: number
): Promise<void> {
  if (!isIndexedDBAvailable()) return;

  try {
    const db = getLocalDb();
    await db.syncWatermarks.put({ userId, setNumber, lastSyncVersion });
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('Failed to set sync watermark:', error);
    }
  }
}

/**
 * Bulk update watermarks from a versions map (returned by POST /api/sync).
 * Safe to call with any versions — the server sequence is monotonic so
 * values returned from the API are always >= existing watermarks.
 */
export async function updateWatermarks(
  userId: string,
  versions: Record<string, number>
): Promise<void> {
  if (!isIndexedDBAvailable()) return;

  const entries = Object.entries(versions);
  if (entries.length === 0) return;

  try {
    const db = getLocalDb();
    await db.syncWatermarks.bulkPut(
      entries.map(([setNumber, lastSyncVersion]) => ({
        userId,
        setNumber,
        lastSyncVersion,
      }))
    );
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('Failed to update sync watermarks:', error);
    }
  }
}
