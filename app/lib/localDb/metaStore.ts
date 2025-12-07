/**
 * Metadata store operations for IndexedDB.
 *
 * Provides key-value storage for sync state, versions, and other metadata.
 */

import { getLocalDb, isIndexedDBAvailable } from './schema';

// ============================================================================
// Generic Key-Value Operations
// ============================================================================

/**
 * Get a metadata value by key.
 */
export async function getMeta<T extends string | number | boolean | null>(
  key: string
): Promise<T | null> {
  if (!isIndexedDBAvailable()) return null;

  try {
    const db = getLocalDb();
    const entry = await db.meta.get(key);
    return (entry?.value as T) ?? null;
  } catch {
    return null;
  }
}

/**
 * Set a metadata value.
 */
export async function setMeta(
  key: string,
  value: string | number | boolean | null
): Promise<void> {
  if (!isIndexedDBAvailable()) return;

  try {
    const db = getLocalDb();
    await db.meta.put({
      key,
      value,
      updatedAt: Date.now(),
    });
  } catch (error) {
    console.warn('Failed to set meta value:', error);
  }
}

/**
 * Delete a metadata entry.
 */
export async function deleteMeta(key: string): Promise<void> {
  if (!isIndexedDBAvailable()) return;

  try {
    const db = getLocalDb();
    await db.meta.delete(key);
  } catch (error) {
    console.warn('Failed to delete meta value:', error);
  }
}

// ============================================================================
// Sync Timestamps
// ============================================================================

const LAST_SYNC_PREFIX = 'last_sync_';

/**
 * Get the last sync time for a specific scope (e.g., 'user_set_parts', 'user_set_parts:21322').
 */
export async function getLastSyncTime(scope: string): Promise<number | null> {
  return getMeta<number>(`${LAST_SYNC_PREFIX}${scope}`);
}

/**
 * Set the last sync time for a specific scope.
 */
export async function setLastSyncTime(
  scope: string,
  timestamp: number
): Promise<void> {
  await setMeta(`${LAST_SYNC_PREFIX}${scope}`, timestamp);
}

// ============================================================================
// Catalog Versioning
// ============================================================================

const CATALOG_VERSION_KEY = 'catalog_version';
const CATALOG_VERSION_CHECKED_KEY = 'catalog_version_checked_at';

/**
 * Get the cached catalog version.
 */
export async function getCatalogVersion(): Promise<string | null> {
  return getMeta<string>(CATALOG_VERSION_KEY);
}

/**
 * Set the catalog version.
 */
export async function setCatalogVersion(version: string): Promise<void> {
  await setMeta(CATALOG_VERSION_KEY, version);
  await setMeta(CATALOG_VERSION_CHECKED_KEY, Date.now());
}

/**
 * Get when the catalog version was last checked.
 */
export async function getCatalogVersionCheckedAt(): Promise<number | null> {
  return getMeta<number>(CATALOG_VERSION_CHECKED_KEY);
}

// ============================================================================
// User Session State
// ============================================================================

const USER_ID_KEY = 'current_user_id';
const LAST_PULL_PREFIX = 'last_pull_';

/**
 * Get the current user ID stored locally.
 */
export async function getStoredUserId(): Promise<string | null> {
  return getMeta<string>(USER_ID_KEY);
}

/**
 * Set the current user ID.
 */
export async function setStoredUserId(userId: string | null): Promise<void> {
  if (userId) {
    await setMeta(USER_ID_KEY, userId);
  } else {
    await deleteMeta(USER_ID_KEY);
  }
}

/**
 * Get the last time we pulled data from Supabase for a user.
 */
export async function getLastPullTime(userId: string): Promise<number | null> {
  return getMeta<number>(`${LAST_PULL_PREFIX}${userId}`);
}

/**
 * Set the last pull time for a user.
 */
export async function setLastPullTime(
  userId: string,
  timestamp: number
): Promise<void> {
  await setMeta(`${LAST_PULL_PREFIX}${userId}`, timestamp);
}

// ============================================================================
// Migration State
// ============================================================================

const MIGRATION_PREFIX = 'migration_';

/**
 * Check if a migration has been completed.
 */
export async function isMigrationComplete(
  migrationId: string
): Promise<boolean> {
  const value = await getMeta<boolean>(`${MIGRATION_PREFIX}${migrationId}`);
  return value === true;
}

/**
 * Mark a migration as complete.
 */
export async function setMigrationComplete(
  migrationId: string
): Promise<void> {
  await setMeta(`${MIGRATION_PREFIX}${migrationId}`, true);
}







