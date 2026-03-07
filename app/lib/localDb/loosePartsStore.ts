/**
 * Loose parts store for IndexedDB.
 *
 * Provides local-first storage for user's loose parts (not tied to any set).
 * These are parts the user owns independently, e.g., from bulk purchases
 * or BrickScan imports.
 *
 * Table uses compound PK [partNum+colorId] — each part+color combo is unique.
 */

import {
  getLocalDb,
  isIndexedDBAvailable,
  type LocalLoosePart,
} from './schema';

// Max retries before an operation is considered failed (matches syncQueue.ts)
const MAX_RETRY_COUNT = 5;

// ============================================================================
// Read Operations
// ============================================================================

/**
 * Get all loose parts from IndexedDB.
 */
export async function getAllLooseParts(): Promise<LocalLoosePart[]> {
  if (!isIndexedDBAvailable()) return [];

  try {
    const db = getLocalDb();
    return await db.localLooseParts.toArray();
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('Failed to read loose parts from IndexedDB:', error);
    }
    return [];
  }
}

/**
 * Get the total quantity across all loose part entries.
 * Returns the sum of all `quantity` fields, not the row count.
 */
export async function getLoosePartsCount(): Promise<number> {
  if (!isIndexedDBAvailable()) return 0;

  try {
    const db = getLocalDb();
    let total = 0;
    await db.localLooseParts.each(row => {
      total += row.quantity;
    });
    return total;
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('Failed to count loose parts in IndexedDB:', error);
    }
    return 0;
  }
}

// ============================================================================
// Write Operations
// ============================================================================

/**
 * Bulk upsert loose parts.
 *
 * @param parts - Array of loose parts to upsert
 * @param mode - 'merge' keeps max(existing, imported) quantity;
 *               'replace' overwrites existing quantity
 */
export async function bulkUpsertLooseParts(
  parts: Array<{ partNum: string; colorId: number; quantity: number }>,
  mode: 'merge' | 'replace'
): Promise<void> {
  if (!isIndexedDBAvailable()) return;
  if (parts.length === 0) return;

  try {
    const db = getLocalDb();
    const now = Date.now();

    await db.transaction('rw', db.localLooseParts, async () => {
      for (const part of parts) {
        const normalizedQty = Math.max(0, Math.floor(part.quantity || 0));

        const existing = await db.localLooseParts
          .where('[partNum+colorId]')
          .equals([part.partNum, part.colorId])
          .first();

        if (normalizedQty === 0) {
          // In replace mode, remove existing entries for explicitly-zeroed parts
          if (mode === 'replace' && existing) {
            await db.localLooseParts
              .where('[partNum+colorId]')
              .equals([part.partNum, part.colorId])
              .delete();
          }
          continue;
        }

        const newQty =
          existing && mode === 'merge'
            ? Math.max(existing.quantity, normalizedQty)
            : normalizedQty;

        // put() upserts by compound PK [partNum+colorId]
        await db.localLooseParts.put({
          partNum: part.partNum,
          colorId: part.colorId,
          quantity: newQty,
          updatedAt: now,
        });
      }
    });
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('Failed to bulk upsert loose parts in IndexedDB:', error);
    }
  }
}

/**
 * Clear all loose parts from IndexedDB.
 */
export async function clearAllLooseParts(): Promise<void> {
  if (!isIndexedDBAvailable()) return;

  try {
    const db = getLocalDb();
    await db.localLooseParts.clear();
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('Failed to clear loose parts from IndexedDB:', error);
    }
  }
}

// ============================================================================
// Sync Enqueue
// ============================================================================

/**
 * Enqueue multiple loose part changes in a single IndexedDB transaction.
 * More efficient than calling enqueueLoosePartChange in a loop for bulk imports.
 */
export async function bulkEnqueueLoosePartChanges(
  userId: string,
  clientId: string,
  parts: Array<{ partNum: string; colorId: number; quantity: number }>
): Promise<void> {
  if (!isIndexedDBAvailable() || parts.length === 0) return;

  try {
    const db = getLocalDb();
    const now = Date.now();

    await db.transaction('rw', db.syncQueue, async () => {
      // Load all pending loose part ops for this user in one query
      const allPending = await db.syncQueue
        .where('table')
        .equals('user_loose_parts')
        .filter(op => op.retryCount < MAX_RETRY_COUNT && op.userId === userId)
        .toArray();

      // Index by part_num:color_id for fast lookup
      const pendingByKey = new Map<string, (typeof allPending)[number]>();
      for (const op of allPending) {
        const p = op.payload as Record<string, unknown>;
        pendingByKey.set(`${p.part_num}:${p.color_id}`, op);
      }

      for (const part of parts) {
        const key = `${part.partNum}:${part.colorId}`;
        const payload = {
          part_num: part.partNum,
          color_id: part.colorId,
          loose_quantity: part.quantity,
        };
        const operation = part.quantity > 0 ? 'upsert' : 'delete';
        const existing = pendingByKey.get(key);

        if (existing) {
          await db.syncQueue.update(existing.id!, {
            payload,
            operation,
            userId,
            createdAt: now,
            retryCount: 0,
            lastError: null,
          });
        } else {
          const id = await db.syncQueue.add({
            table: 'user_loose_parts',
            operation,
            payload,
            clientId,
            userId,
            createdAt: now,
            retryCount: 0,
            lastError: null,
          });
          // Track newly added op so subsequent parts in this batch can consolidate
          pendingByKey.set(key, {
            id: id as number,
            table: 'user_loose_parts',
            operation,
            payload,
            clientId,
            userId,
            createdAt: now,
            retryCount: 0,
            lastError: null,
          });
        }
      }
    });
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('Failed to bulk enqueue loose part changes:', error);
    }
  }
}

/**
 * Enqueue a loose part quantity change for sync to Supabase.
 * Consolidates multiple changes to the same part+color into a single operation.
 */
export async function enqueueLoosePartChange(
  userId: string,
  clientId: string,
  partNum: string,
  colorId: number,
  quantity: number
): Promise<void> {
  if (!isIndexedDBAvailable()) return;

  try {
    const db = getLocalDb();

    // Check if there's already a pending operation for this exact key
    const existingOps = await db.syncQueue
      .where('table')
      .equals('user_loose_parts')
      .filter(
        op =>
          op.retryCount < MAX_RETRY_COUNT &&
          op.userId === userId &&
          (op.payload as Record<string, unknown>).part_num === partNum &&
          (op.payload as Record<string, unknown>).color_id === colorId
      )
      .toArray();

    const now = Date.now();
    const payload = {
      part_num: partNum,
      color_id: colorId,
      loose_quantity: quantity,
    };

    if (existingOps.length > 0) {
      // Update the most recent existing operation
      const mostRecent = existingOps[existingOps.length - 1]!;
      await db.syncQueue.update(mostRecent.id!, {
        payload,
        operation: quantity > 0 ? 'upsert' : 'delete',
        userId,
        createdAt: now,
        retryCount: 0,
        lastError: null,
      });
    } else {
      // Create new operation
      await db.syncQueue.add({
        table: 'user_loose_parts',
        operation: quantity > 0 ? 'upsert' : 'delete',
        payload,
        clientId,
        userId,
        createdAt: now,
        retryCount: 0,
        lastError: null,
      });
    }
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('Failed to enqueue loose part change:', error);
    }
  }
}
