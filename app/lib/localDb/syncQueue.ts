/**
 * Sync queue operations for IndexedDB.
 *
 * Manages the queue of pending write operations that need to be
 * synchronized to Supabase. Operations are batched and sent via
 * the /api/sync endpoint.
 */

import { getLocalDb, isIndexedDBAvailable, type SyncQueueItem } from './schema';

// Maximum retries before an operation is considered failed
const MAX_RETRY_COUNT = 5;

// ============================================================================
// Queue Operations
// ============================================================================

/**
 * Add an operation to the sync queue.
 */
export async function enqueueSyncOperation(
  operation: Omit<SyncQueueItem, 'id' | 'createdAt' | 'retryCount' | 'lastError'>
): Promise<number | undefined> {
  if (!isIndexedDBAvailable()) return undefined;

  try {
    const db = getLocalDb();
    const id = await db.syncQueue.add({
      ...operation,
      createdAt: Date.now(),
      retryCount: 0,
      lastError: null,
    });
    return id;
  } catch (error) {
    console.warn('Failed to enqueue sync operation:', error);
    return undefined;
  }
}

/**
 * Get pending sync operations, optionally limited to a batch size.
 * Returns operations ordered by creation time (oldest first).
 */
export async function getPendingSyncOperations(
  limit?: number
): Promise<SyncQueueItem[]> {
  if (!isIndexedDBAvailable()) return [];

  try {
    const db = getLocalDb();
    const results = await db.syncQueue
      .where('retryCount')
      .below(MAX_RETRY_COUNT)
      .sortBy('createdAt');

    return limit ? results.slice(0, limit) : results;
  } catch (error) {
    console.warn('Failed to get pending sync operations:', error);
    return [];
  }
}

/**
 * Remove sync operations by their IDs (after successful sync).
 */
export async function removeSyncOperations(ids: number[]): Promise<void> {
  if (!isIndexedDBAvailable()) return;
  if (ids.length === 0) return;

  try {
    const db = getLocalDb();
    await db.syncQueue.bulkDelete(ids);
  } catch (error) {
    console.warn('Failed to remove sync operations:', error);
  }
}

/**
 * Mark a sync operation as failed (increment retry count, store error).
 */
export async function markSyncOperationFailed(
  id: number,
  error: string
): Promise<void> {
  if (!isIndexedDBAvailable()) return;

  try {
    const db = getLocalDb();
    const item = await db.syncQueue.get(id);
    if (item) {
      await db.syncQueue.update(id, {
        retryCount: item.retryCount + 1,
        lastError: error,
      });
    }
  } catch (err) {
    console.warn('Failed to mark sync operation as failed:', err);
  }
}

/**
 * Get the count of pending sync operations.
 */
export async function getSyncQueueCount(): Promise<number> {
  if (!isIndexedDBAvailable()) return 0;

  try {
    const db = getLocalDb();
    return await db.syncQueue.where('retryCount').below(MAX_RETRY_COUNT).count();
  } catch {
    return 0;
  }
}

/**
 * Get failed operations (exceeded retry count).
 */
export async function getFailedSyncOperations(): Promise<SyncQueueItem[]> {
  if (!isIndexedDBAvailable()) return [];

  try {
    const db = getLocalDb();
    return await db.syncQueue
      .where('retryCount')
      .aboveOrEqual(MAX_RETRY_COUNT)
      .toArray();
  } catch {
    return [];
  }
}

/**
 * Clear all failed operations.
 */
export async function clearFailedSyncOperations(): Promise<void> {
  if (!isIndexedDBAvailable()) return;

  try {
    const db = getLocalDb();
    await db.syncQueue
      .where('retryCount')
      .aboveOrEqual(MAX_RETRY_COUNT)
      .delete();
  } catch (error) {
    console.warn('Failed to clear failed sync operations:', error);
  }
}

/**
 * Clear all sync operations (use with caution).
 */
export async function clearSyncQueue(): Promise<void> {
  if (!isIndexedDBAvailable()) return;

  try {
    const db = getLocalDb();
    await db.syncQueue.clear();
  } catch (error) {
    console.warn('Failed to clear sync queue:', error);
  }
}

// ============================================================================
// Batch Operations for Owned Parts
// ============================================================================

/**
 * Enqueue an owned quantity change for sync.
 * Consolidates multiple changes to the same key into a single operation.
 */
export async function enqueueOwnedChange(
  clientId: string,
  setNumber: string,
  partNum: string,
  colorId: number,
  isSpare: boolean,
  quantity: number
): Promise<void> {
  if (!isIndexedDBAvailable()) return;

  try {
    const db = getLocalDb();

    // Check if there's already a pending operation for this exact key
    // If so, update it instead of creating a new one
    const existingOps = await db.syncQueue
      .where('table')
      .equals('user_set_parts')
      .filter(
        op =>
          op.retryCount < MAX_RETRY_COUNT &&
          (op.payload as Record<string, unknown>).set_num === setNumber &&
          (op.payload as Record<string, unknown>).part_num === partNum &&
          (op.payload as Record<string, unknown>).color_id === colorId &&
          (op.payload as Record<string, unknown>).is_spare === isSpare
      )
      .toArray();

    const now = Date.now();
    const payload = {
      set_num: setNumber,
      part_num: partNum,
      color_id: colorId,
      is_spare: isSpare,
      owned_quantity: quantity,
    };

    if (existingOps.length > 0) {
      // Update the most recent existing operation
      const mostRecent = existingOps[existingOps.length - 1]!;
      await db.syncQueue.update(mostRecent.id!, {
        payload,
        createdAt: now,
        retryCount: 0, // Reset retry count since this is a new value
        lastError: null,
      });
    } else {
      // Create new operation
      await db.syncQueue.add({
        table: 'user_set_parts',
        operation: quantity > 0 ? 'upsert' : 'delete',
        payload,
        clientId,
        createdAt: now,
        retryCount: 0,
        lastError: null,
      });
    }
  } catch (error) {
    console.warn('Failed to enqueue owned change:', error);
  }
}

