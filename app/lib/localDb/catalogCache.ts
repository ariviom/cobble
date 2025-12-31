/**
 * Catalog cache operations for IndexedDB.
 *
 * Provides local-first caching for set inventories and summaries.
 * Data is fetched from Supabase/Rebrickable and cached locally
 * to reduce network requests and enable faster subsequent loads.
 */

import type { InventoryRow } from '@/app/components/set/types';
import {
  getLocalDb,
  isIndexedDBAvailable,
  type CatalogColor,
  type CatalogMinifig,
  type CatalogPart,
  type CatalogSet,
  type CatalogSetPart,
} from './schema';

// Cache TTL: long-lived; version mismatches will force invalidation
const INVENTORY_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const SET_SUMMARY_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// ============================================================================
// Inventory Cache
// ============================================================================

/**
 * Get cached inventory rows for a set.
 * Returns null if not cached or cache is stale.
 */
export async function getCachedInventory(
  setNumber: string,
  expectedVersion?: string | null
): Promise<InventoryRow[] | null> {
  if (!isIndexedDBAvailable()) return null;

  try {
    const db = getLocalDb();

    // Check if we have cached metadata for this set
    const meta = await db.catalogSetMeta.get(setNumber);
    if (!meta) return null;

    // Reject cache when version mismatch
    if (
      typeof expectedVersion === 'string' &&
      expectedVersion.length > 0 &&
      meta.inventoryVersion !== expectedVersion
    ) {
      return null;
    }

    // Check if cache is still valid
    const now = Date.now();
    if (now - meta.inventoryCachedAt > INVENTORY_CACHE_TTL_MS) {
      return null;
    }

    // Fetch all set parts for this set
    const setParts = await db.catalogSetParts
      .where('setNumber')
      .equals(setNumber)
      .toArray();

    if (setParts.length === 0) return null;

    // Fetch all referenced parts and colors
    const partNums = [...new Set(setParts.map(sp => sp.partNum))];
    const colorIds = [...new Set(setParts.map(sp => sp.colorId))];

    const [parts, colors] = await Promise.all([
      db.catalogParts.where('partNum').anyOf(partNums).toArray(),
      db.catalogColors.where('id').anyOf(colorIds).toArray(),
    ]);

    const partMap = new Map(parts.map(p => [p.partNum, p]));
    const colorMap = new Map(colors.map(c => [c.id, c]));

    // Reconstruct InventoryRow[] from normalized data
    const rows: InventoryRow[] = setParts.map(sp => {
      const part = partMap.get(sp.partNum);
      const color = colorMap.get(sp.colorId);

      const row: InventoryRow = {
        setNumber: sp.setNumber,
        partId: sp.partNum,
        partName: part?.name ?? sp.partNum,
        colorId: sp.colorId,
        colorName: sp.colorName || color?.name || `Color ${sp.colorId}`,
        quantityRequired: sp.quantityRequired,
        imageUrl: part?.imageUrl ?? null,
        elementId: sp.elementId,
        inventoryKey: sp.inventoryKey,
      };

      // Only include optional properties when they have values
      if (part?.categoryId != null) row.partCategoryId = part.categoryId;
      if (part?.categoryName) row.partCategoryName = part.categoryName;
      if (part?.parentCategory) row.parentCategory = part.parentCategory;
      if (sp.parentRelations) row.parentRelations = sp.parentRelations;
      if (sp.componentRelations) row.componentRelations = sp.componentRelations;
      if (sp.bricklinkFigId) row.bricklinkFigId = sp.bricklinkFigId;
      if (part?.bricklinkPartId) row.bricklinkPartId = part.bricklinkPartId;

      return row;
    });

    return rows;
  } catch (error) {
    console.warn('Failed to read inventory from cache:', error);
    return null;
  }
}

/**
 * Cache inventory rows for a set.
 * Normalizes the data into separate tables for efficient storage.
 */
export async function setCachedInventory(
  setNumber: string,
  rows: InventoryRow[],
  opts?: { inventoryVersion?: string | null }
): Promise<void> {
  if (!isIndexedDBAvailable()) return;
  if (rows.length === 0) return;

  try {
    const db = getLocalDb();
    const now = Date.now();

    // Extract unique parts and colors from rows
    const partsMap = new Map<string, CatalogPart>();
    const colorsMap = new Map<number, CatalogColor>();
    const setParts: Omit<CatalogSetPart, 'id'>[] = [];
    const minifigsMap = new Map<string, CatalogMinifig>();

    for (const row of rows) {
      // Collect part data
      if (!partsMap.has(row.partId)) {
        partsMap.set(row.partId, {
          partNum: row.partId,
          name: row.partName,
          imageUrl: row.imageUrl,
          categoryId: row.partCategoryId ?? null,
          categoryName: row.partCategoryName ?? null,
          parentCategory: row.parentCategory ?? null,
          bricklinkPartId: row.bricklinkPartId ?? null,
          cachedAt: now,
        });
      }

      // Collect color data
      if (!colorsMap.has(row.colorId)) {
        colorsMap.set(row.colorId, {
          id: row.colorId,
          name: row.colorName,
          cachedAt: now,
        });
      }

      // Create set part entry (only include optional fields when present)
      const setPart: Omit<CatalogSetPart, 'id'> = {
        setNumber: row.setNumber,
        partNum: row.partId,
        colorId: row.colorId,
        colorName: row.colorName,
        quantityRequired: row.quantityRequired,
        elementId: row.elementId ?? null,
        inventoryKey: row.inventoryKey,
      };
      if (row.bricklinkFigId) setPart.bricklinkFigId = row.bricklinkFigId;
      if (row.parentRelations) setPart.parentRelations = row.parentRelations;
      if (row.componentRelations)
        setPart.componentRelations = row.componentRelations;
      setParts.push(setPart);

      // Collect minifig metadata for cross-set reuse
      if (
        row.parentCategory === 'Minifigure' &&
        typeof row.partId === 'string' &&
        row.partId.startsWith('fig:')
      ) {
        const figNum = row.partId.replace(/^fig:/, '').trim();
        if (figNum && !minifigsMap.has(figNum)) {
          minifigsMap.set(figNum, {
            figNum,
            name: row.partName,
            imageUrl: row.imageUrl ?? null,
            numParts: null, // numParts not available in inventory rows
            year: null,
            themeName: null,
            cachedAt: now,
          });
        } else if (figNum) {
          // After BL migration, figNum IS the BL ID, no need to merge
          // (This block is kept for clarity but is now a no-op)
        }
      }
    }

    // Use a transaction to ensure consistency
    await db.transaction(
      'rw',
      [
        db.catalogParts,
        db.catalogColors,
        db.catalogSetParts,
        db.catalogSetMeta,
        db.catalogMinifigs,
      ],
      async () => {
        // Upsert parts (bulkPut handles duplicates)
        await db.catalogParts.bulkPut(Array.from(partsMap.values()));

        // Upsert colors
        await db.catalogColors.bulkPut(Array.from(colorsMap.values()));

        // Upsert minifigs for reuse across sets
        if (minifigsMap.size > 0) {
          await db.catalogMinifigs.bulkPut(Array.from(minifigsMap.values()));
        }

        // Delete existing set parts for this set, then insert new ones
        await db.catalogSetParts.where('setNumber').equals(setNumber).delete();
        await db.catalogSetParts.bulkAdd(setParts);

        // Update metadata
        await db.catalogSetMeta.put({
          setNumber,
          inventoryCachedAt: now,
          partCount: rows.length,
          inventoryVersion: opts?.inventoryVersion ?? null,
        });
      }
    );
  } catch (error) {
    console.warn('Failed to cache inventory:', error);
  }
}

/**
 * Check if inventory cache is valid for a set.
 */
export async function isInventoryCacheValid(
  setNumber: string
): Promise<boolean> {
  if (!isIndexedDBAvailable()) return false;

  try {
    const db = getLocalDb();
    const meta = await db.catalogSetMeta.get(setNumber);
    if (!meta) return false;

    const now = Date.now();
    return now - meta.inventoryCachedAt <= INVENTORY_CACHE_TTL_MS;
  } catch {
    return false;
  }
}

/**
 * Invalidate inventory cache for a set (or all sets if no setNumber provided).
 */
export async function invalidateInventoryCache(
  setNumber?: string
): Promise<void> {
  if (!isIndexedDBAvailable()) return;

  try {
    const db = getLocalDb();

    if (setNumber) {
      // Invalidate specific set
      await db.catalogSetMeta.delete(setNumber);
      await db.catalogSetParts.where('setNumber').equals(setNumber).delete();
    } else {
      // Invalidate all
      await db.catalogSetMeta.clear();
      await db.catalogSetParts.clear();
    }
  } catch (error) {
    console.warn('Failed to invalidate inventory cache:', error);
  }
}

// ============================================================================
// Set Summary Cache
// ============================================================================

/**
 * Get cached set summary.
 */
export async function getCachedSetSummary(
  setNumber: string
): Promise<CatalogSet | null> {
  if (!isIndexedDBAvailable()) return null;

  try {
    const db = getLocalDb();
    const cached = await db.catalogSets.get(setNumber);

    if (!cached) return null;

    // Check if cache is still valid
    const now = Date.now();
    if (now - cached.cachedAt > SET_SUMMARY_CACHE_TTL_MS) {
      return null;
    }

    return cached;
  } catch {
    return null;
  }
}

/**
 * Cache set summary.
 */
export async function setCachedSetSummary(
  set: Omit<CatalogSet, 'cachedAt'>
): Promise<void> {
  if (!isIndexedDBAvailable()) return;

  try {
    const db = getLocalDb();
    await db.catalogSets.put({
      ...set,
      cachedAt: Date.now(),
    });
  } catch (error) {
    console.warn('Failed to cache set summary:', error);
  }
}
