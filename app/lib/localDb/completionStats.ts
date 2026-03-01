/**
 * Completion statistics for sets with owned parts.
 *
 * Queries localOwned and catalogSetParts to find sets where the user
 * has marked any parts as owned. Returns all such sets (including
 * fully-complete ones) with ownedCount capped per-part at the required
 * quantity, matching the set detail page's counting behavior.
 *
 * Sets with owned data but no catalogSetParts cache are returned with
 * totalParts: 0 so callers can resolve from metadata fallbacks.
 */

import { getLocalDb, isIndexedDBAvailable } from './schema';

export type SetCompletionStats = {
  setNumber: string;
  ownedCount: number;
  totalParts: number;
};

/**
 * Find sets where the user has owned any parts (partial or complete).
 * Caps each part's owned quantity at its required quantity to match
 * the set detail page totals. Returns sets with totalParts: 0 when
 * catalogSetParts cache is missing (e.g. after DB upgrade).
 */
export async function getPartiallyCompleteSets(): Promise<
  SetCompletionStats[]
> {
  if (!isIndexedDBAvailable()) return [];

  try {
    const db = getLocalDb();

    // Get all owned rows grouped by setNumber → inventoryKey → quantity
    const allOwned = await db.localOwned.toArray();

    const ownedBySetKey = new Map<string, Map<string, number>>();
    const setsWithOwned = new Set<string>();
    for (const row of allOwned) {
      if (row.quantity > 0) {
        // Skip minifig parent rows — excluded from set page totals
        if (row.inventoryKey.startsWith('fig:')) continue;
        setsWithOwned.add(row.setNumber);
        let keyMap = ownedBySetKey.get(row.setNumber);
        if (!keyMap) {
          keyMap = new Map();
          ownedBySetKey.set(row.setNumber, keyMap);
        }
        keyMap.set(row.inventoryKey, row.quantity);
      }
    }

    if (setsWithOwned.size === 0) return [];

    // Get catalog set parts to build per-key required quantities
    const setNumbers = [...setsWithOwned];
    const allSetParts = await db.catalogSetParts
      .where('setNumber')
      .anyOf(setNumbers)
      .toArray();

    // Build required-by-key and total-by-set maps
    const requiredBySetKey = new Map<string, Map<string, number>>();
    const totalBySet = new Map<string, number>();
    for (const part of allSetParts) {
      if (part.partNum.startsWith('fig:')) continue;

      totalBySet.set(
        part.setNumber,
        (totalBySet.get(part.setNumber) ?? 0) + part.quantityRequired
      );

      let keyMap = requiredBySetKey.get(part.setNumber);
      if (!keyMap) {
        keyMap = new Map();
        requiredBySetKey.set(part.setNumber, keyMap);
      }
      keyMap.set(
        part.inventoryKey,
        (keyMap.get(part.inventoryKey) ?? 0) + part.quantityRequired
      );
    }

    const results: SetCompletionStats[] = [];
    for (const setNumber of setsWithOwned) {
      const totalParts = totalBySet.get(setNumber) ?? 0;
      const ownedKeys = ownedBySetKey.get(setNumber)!;
      const requiredKeys = requiredBySetKey.get(setNumber);

      let ownedCount = 0;
      if (requiredKeys) {
        // Catalog data available — cap each part at required quantity
        for (const [key, owned] of ownedKeys) {
          const required = requiredKeys.get(key);
          if (required != null && required > 0) {
            ownedCount += Math.min(owned, required);
          }
        }
      } else {
        // No catalog data — sum raw as rough estimate
        for (const owned of ownedKeys.values()) {
          ownedCount += owned;
        }
      }

      if (ownedCount > 0) {
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
