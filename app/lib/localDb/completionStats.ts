/**
 * Completion statistics for sets with owned parts.
 *
 * Queries localOwned and catalogSetParts to find sets where the user
 * has marked any parts as owned. Returns all such sets (including
 * fully-complete ones) so the merge layer can use local totalParts
 * instead of rb_sets.num_parts for cloud data.
 */

import { getLocalDb, isIndexedDBAvailable } from './schema';

export type SetCompletionStats = {
  setNumber: string;
  ownedCount: number;
  totalParts: number;
};

/**
 * Find sets where the user has owned any parts (partial or complete).
 * Includes complete sets so the cloud merge can use local totalParts
 * and avoid re-adding them with the wrong rb_sets.num_parts count.
 * Callers filter for partial completion (ownedCount < totalParts).
 */
export async function getPartiallyCompleteSets(): Promise<
  SetCompletionStats[]
> {
  if (!isIndexedDBAvailable()) return [];

  try {
    const db = getLocalDb();

    // Get all owned rows grouped by setNumber
    const allOwned = await db.localOwned.toArray();

    // Group and sum quantities by setNumber
    const ownedBySet = new Map<string, number>();
    for (const row of allOwned) {
      if (row.quantity > 0) {
        // Skip minifig parent rows — excluded from set page totals
        if (row.inventoryKey.startsWith('fig:')) continue;
        ownedBySet.set(
          row.setNumber,
          (ownedBySet.get(row.setNumber) ?? 0) + row.quantity
        );
      }
    }

    if (ownedBySet.size === 0) return [];

    // Count actual ownable parts from catalogSetParts, excluding minifig
    // parent rows (fig:*). This is always correct regardless of whether
    // catalogSetMeta.partCount is stale.
    const setNumbers = [...ownedBySet.keys()];
    const allSetParts = await db.catalogSetParts
      .where('setNumber')
      .anyOf(setNumbers)
      .toArray();

    const totalBySet = new Map<string, number>();
    for (const part of allSetParts) {
      if (!part.partNum.startsWith('fig:')) {
        totalBySet.set(
          part.setNumber,
          (totalBySet.get(part.setNumber) ?? 0) + part.quantityRequired
        );
      }
    }

    const results: SetCompletionStats[] = [];
    for (const [setNumber, ownedCount] of ownedBySet) {
      const totalParts = totalBySet.get(setNumber);
      if (typeof totalParts === 'number' && totalParts > 0) {
        results.push({ setNumber, ownedCount, totalParts });
      }
    }

    return results;
  } catch (error) {
    console.warn('Failed to get partially complete sets:', error);
    return [];
  }
}

/**
 * Look up totalParts (sum of quantityRequired, excluding fig: parents) from
 * the local catalogSetParts cache. Returns a Map of setNumber → totalParts
 * for sets that have cached inventory data.
 */
export async function getTotalPartsForSets(
  setNumbers: string[]
): Promise<Map<string, number>> {
  if (!isIndexedDBAvailable() || setNumbers.length === 0) return new Map();

  try {
    const db = getLocalDb();
    const allSetParts = await db.catalogSetParts
      .where('setNumber')
      .anyOf(setNumbers)
      .toArray();

    const totalBySet = new Map<string, number>();
    for (const part of allSetParts) {
      if (!part.partNum.startsWith('fig:')) {
        totalBySet.set(
          part.setNumber,
          (totalBySet.get(part.setNumber) ?? 0) + part.quantityRequired
        );
      }
    }
    return totalBySet;
  } catch {
    return new Map();
  }
}
