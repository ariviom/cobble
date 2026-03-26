/**
 * Owned quantities store for IndexedDB.
 *
 * Provides local-first storage for user's owned part quantities.
 * This replaces the localStorage-backed store with IndexedDB for:
 * - Larger storage capacity
 * - Better performance with large datasets
 * - Structured querying
 * - Transaction support
 */

import { getLocalDb, isIndexedDBAvailable, type LocalOwned } from './schema';
import { logger } from '@/lib/metrics';

/**
 * Detect IndexedDB QuotaExceededError.
 * Defined locally until schema.ts exports this helper.
 */
function isQuotaExceeded(err: unknown): boolean {
  return (
    err instanceof DOMException &&
    (err.name === 'QuotaExceededError' || err.code === 22)
  );
}

// ============================================================================
// Read Operations
// ============================================================================

/**
 * Get all owned quantities for a set.
 * Returns a map of inventoryKey -> quantity.
 */
export async function getOwnedForSet(
  setNumber: string
): Promise<Record<string, number>> {
  if (!isIndexedDBAvailable()) return {};

  try {
    const db = getLocalDb();
    const rows = await db.localOwned
      .where('setNumber')
      .equals(setNumber)
      .toArray();

    const result: Record<string, number> = {};
    for (const row of rows) {
      if (row.quantity > 0) {
        result[row.inventoryKey] = row.quantity;
      }
    }
    return result;
  } catch (error) {
    logger.warn('localdb.owned_read_failed', {
      error: String(error),
      setNumber,
    });
    return {};
  }
}

/**
 * Get owned quantity for a specific part in a set.
 */
export async function getOwnedQuantity(
  setNumber: string,
  inventoryKey: string
): Promise<number> {
  if (!isIndexedDBAvailable()) return 0;

  try {
    const db = getLocalDb();
    const row = await db.localOwned
      .where('[setNumber+inventoryKey]')
      .equals([setNumber, inventoryKey])
      .first();

    return row?.quantity ?? 0;
  } catch {
    return 0;
  }
}

// ============================================================================
// Write Operations
// ============================================================================

/**
 * Set owned quantities for an entire set.
 * Replaces all existing quantities for the set.
 * Uses a transaction so delete+insert is atomic — no data loss on crash.
 */
export async function setOwnedForSet(
  setNumber: string,
  quantities: Record<string, number>
): Promise<void> {
  if (!isIndexedDBAvailable()) return;

  try {
    const db = getLocalDb();
    const now = Date.now();

    await db.transaction('rw', db.localOwned, async () => {
      const existing = await db.localOwned
        .where('setNumber')
        .equals(setNumber)
        .toArray();
      const existingByKey = new Map(existing.map(r => [r.inventoryKey, r]));
      await db.localOwned.where('setNumber').equals(setNumber).delete();

      const entries: Omit<LocalOwned, 'id'>[] = [];
      for (const [inventoryKey, quantity] of Object.entries(quantities)) {
        if (quantity > 0) {
          const prev = existingByKey.get(inventoryKey);
          entries.push({
            setNumber,
            inventoryKey,
            quantity,
            updatedAt:
              prev && prev.quantity === quantity ? prev.updatedAt : now,
          });
        }
      }
      if (entries.length > 0) await db.localOwned.bulkPut(entries);
    });
  } catch (error) {
    if (isQuotaExceeded(error)) {
      logger.error('localdb.quota_exceeded', {
        context: 'setOwnedForSet',
        setNumber,
      });
    } else {
      logger.warn('localdb.owned_write_failed', {
        error: String(error),
        setNumber,
      });
    }
    throw error;
  }
}

/**
 * Set owned quantity for a specific part in a set.
 */
export async function setOwnedQuantity(
  setNumber: string,
  inventoryKey: string,
  quantity: number
): Promise<void> {
  if (!isIndexedDBAvailable()) return;

  try {
    const db = getLocalDb();
    const now = Date.now();
    const normalizedQty = Math.max(0, Math.floor(quantity ?? 0));

    await db.transaction('rw', db.localOwned, async () => {
      // Find existing entry
      const existing = await db.localOwned
        .where('[setNumber+inventoryKey]')
        .equals([setNumber, inventoryKey])
        .first();

      if (normalizedQty === 0) {
        // Delete if quantity is zero
        if (existing?.id) {
          await db.localOwned.delete(existing.id);
        }
      } else if (existing?.id) {
        // Update existing
        await db.localOwned.update(existing.id, {
          quantity: normalizedQty,
          updatedAt: now,
        });
      } else {
        // Insert new
        await db.localOwned.add({
          setNumber,
          inventoryKey,
          quantity: normalizedQty,
          updatedAt: now,
        });
      }
    });
  } catch (error) {
    if (isQuotaExceeded(error)) {
      logger.error('localdb.quota_exceeded', {
        context: 'setOwnedQuantity',
        setNumber,
        inventoryKey,
      });
    } else {
      logger.warn('localdb.owned_quantity_write_failed', {
        error: String(error),
        setNumber,
        inventoryKey,
      });
    }
    throw error;
  }
}

/**
 * Clear all owned quantities for a set.
 */
export async function clearOwnedForSet(setNumber: string): Promise<void> {
  if (!isIndexedDBAvailable()) return;

  try {
    const db = getLocalDb();
    await db.localOwned.where('setNumber').equals(setNumber).delete();
  } catch (error) {
    logger.warn('localdb.owned_clear_failed', {
      error: String(error),
      setNumber,
    });
  }
}

/**
 * Mark all parts as owned for a set (bulk operation).
 * Takes parallel arrays of keys and quantities for efficiency.
 * Uses a transaction so delete+insert is atomic — no data loss on crash.
 */
export async function markAllOwnedForSet(
  setNumber: string,
  keys: string[],
  quantities: number[]
): Promise<void> {
  if (!isIndexedDBAvailable()) return;
  if (keys.length !== quantities.length) {
    logger.warn('localdb.mark_all_owned_mismatch', {
      keysLength: keys.length,
      quantitiesLength: quantities.length,
    });
    return;
  }

  try {
    const db = getLocalDb();
    const now = Date.now();

    const entries: Omit<LocalOwned, 'id'>[] = [];
    for (let i = 0; i < keys.length; i++) {
      const qty = Math.max(0, Math.floor(quantities[i] ?? 0));
      if (qty > 0) {
        entries.push({
          setNumber,
          inventoryKey: keys[i]!,
          quantity: qty,
          updatedAt: now,
        });
      }
    }

    await db.transaction('rw', db.localOwned, async () => {
      // Delete existing entries for this set
      await db.localOwned.where('setNumber').equals(setNumber).delete();

      // Insert new entries using bulkPut for crash-safe upsert
      if (entries.length > 0) {
        await db.localOwned.bulkPut(entries);
      }
    });
  } catch (error) {
    if (isQuotaExceeded(error)) {
      logger.error('localdb.quota_exceeded', {
        context: 'markAllOwnedForSet',
        setNumber,
      });
    } else {
      logger.warn('localdb.mark_all_owned_failed', {
        error: String(error),
        setNumber,
      });
    }
    throw error;
  }
}

// ============================================================================
// Migration Helpers
// ============================================================================

/**
 * Migrate owned data from legacy keys to canonical keys.
 *
 * For each migration: if canonical key has no owned data, check legacy keys,
 * copy first match to canonical key, delete the old entry.
 * Idempotent — safe to run multiple times.
 *
 * @returns Number of keys migrated
 */
export async function migrateOwnedKeys(
  setNumber: string,
  keyMigrations: Array<{ canonicalKey: string; legacyKeys: string[] }>
): Promise<number> {
  if (!isIndexedDBAvailable()) return 0;

  try {
    const db = getLocalDb();
    let migrated = 0;

    await db.transaction('rw', db.localOwned, async () => {
      for (const { canonicalKey, legacyKeys } of keyMigrations) {
        // Check if canonical key already has data
        const existing = await db.localOwned
          .where('[setNumber+inventoryKey]')
          .equals([setNumber, canonicalKey])
          .first();
        if (existing && existing.quantity > 0) continue; // Already migrated

        // Find first legacy key with data
        for (const legacyKey of legacyKeys) {
          if (legacyKey === canonicalKey) continue;
          const legacy = await db.localOwned
            .where('[setNumber+inventoryKey]')
            .equals([setNumber, legacyKey])
            .first();
          if (legacy && legacy.quantity > 0) {
            // Copy to canonical key
            if (existing?.id) {
              await db.localOwned.update(existing.id, {
                quantity: legacy.quantity,
                updatedAt: Date.now(),
              });
            } else {
              await db.localOwned.add({
                setNumber,
                inventoryKey: canonicalKey,
                quantity: legacy.quantity,
                updatedAt: Date.now(),
              });
            }
            // Delete old entry
            if (legacy.id) {
              await db.localOwned.delete(legacy.id);
            }
            migrated++;
            break; // Use first match only
          }
        }
      }
    });

    return migrated;
  } catch (error) {
    logger.warn('localdb.owned_migration_failed', {
      error: String(error),
      setNumber,
    });
    return 0;
  }
}
