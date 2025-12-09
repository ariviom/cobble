/**
 * Dexie IndexedDB schema for local-first caching.
 *
 * This module defines the normalized schema for:
 * - Catalog data (sets, parts, colors, inventories) - read-only mirror of Supabase
 * - User data (owned quantities, collections) - local-first with sync to Supabase
 * - Sync infrastructure (queue, metadata)
 *
 * The schema is designed to be extensible for future features like:
 * - Minifigure collections
 * - Global user inventory
 */

import Dexie, { type EntityTable } from 'dexie';

// ============================================================================
// Catalog Types (read-only mirror of Supabase/Rebrickable)
// ============================================================================

/**
 * Cached set summary data.
 * Mirrors the shape from getSetSummaryLocal.
 */
export type CatalogSet = {
  setNumber: string; // Primary key
  name: string;
  year: number;
  numParts: number;
  imageUrl: string | null;
  themeId: number | null;
  themeName: string | null;
  cachedAt: number; // Timestamp for cache invalidation
};

/**
 * Cached part data.
 * Normalized from InventoryRow for reuse across sets.
 */
export type CatalogPart = {
  partNum: string; // Primary key
  name: string;
  imageUrl: string | null;
  categoryId: number | null;
  categoryName: string | null;
  parentCategory: string | null;
  bricklinkPartId: string | null;
  cachedAt: number;
};

/**
 * Cached color data.
 * Normalized for reuse across sets.
 */
export type CatalogColor = {
  id: number; // Primary key
  name: string;
  cachedAt: number;
};

/**
 * Cached set inventory join data.
 * Links sets to parts with quantities and color info.
 */
export type CatalogSetPart = {
  id?: number; // Auto-increment primary key
  setNumber: string; // Index
  partNum: string; // Index
  colorId: number;
  colorName: string;
  quantityRequired: number;
  elementId: string | null;
  inventoryKey: string; // Compound key: `${partNum}:${colorId}`
  // Minifig-specific fields
  bricklinkFigId?: string | null;
  // Relations for minifig components
  parentRelations?: Array<{ parentKey: string; quantity: number }>;
  componentRelations?: Array<{ key: string; quantity: number }>;
};

/**
 * Metadata for cached set inventories.
 * Tracks when inventories were fetched for invalidation.
 */
export type CatalogSetMeta = {
  setNumber: string; // Primary key
  inventoryCachedAt: number;
  partCount: number;
  inventoryVersion?: string | null;
};

/**
 * Cached minifigure metadata and BrickLink mapping for cross-set reuse.
 */
export type CatalogMinifig = {
  figNum: string; // Primary key (Rebrickable fig_num)
  blId: string | null; // BrickLink minifig ID when mapped
  name: string;
  imageUrl: string | null;
  numParts: number | null;
  year: number | null;
  themeName: string | null;
  cachedAt: number; // Timestamp for cache invalidation
};

// ============================================================================
// User Data Types (local-first with sync to Supabase)
// ============================================================================

/**
 * Local owned quantities per set.
 * Mirrors user_set_parts in Supabase but stored locally for offline access.
 */
export type LocalOwned = {
  id?: number; // Auto-increment primary key
  setNumber: string; // Index
  inventoryKey: string; // `${partNum}:${colorId}`
  quantity: number;
  updatedAt: number; // Timestamp for conflict resolution
};

/**
 * Local user collections (future: for organizing sets/minifigs).
 */
export type LocalCollection = {
  id: string; // UUID primary key
  userId: string | null; // null for anonymous users
  name: string;
  type: 'sets' | 'minifigs' | 'parts'; // Extensible for future collection types
  metadata: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
};

/**
 * Local collection items (future: items within collections).
 */
export type LocalCollectionItem = {
  id?: number; // Auto-increment primary key
  collectionId: string; // Index
  itemType: 'set' | 'minifig' | 'part';
  itemId: string; // setNumber, figId, or partNum
  quantity: number;
  metadata: Record<string, unknown>;
  addedAt: number;
};

// ============================================================================
// Sync Infrastructure Types
// ============================================================================

/**
 * Sync queue for pending writes to Supabase.
 * Operations are batched and sent to /api/sync.
 */
export type SyncQueueItem = {
  id?: number; // Auto-increment primary key
  table:
    | 'user_set_parts'
    | 'user_lists'
    | 'user_list_items'
    | 'user_minifigs'; // Extensible
  operation: 'upsert' | 'delete';
  payload: Record<string, unknown>;
  clientId: string;
  createdAt: number;
  retryCount: number;
  lastError: string | null;
};

/**
 * Key-value metadata store for sync state, versions, etc.
 */
export type MetaEntry = {
  key: string; // Primary key
  value: string | number | boolean | null;
  updatedAt: number;
};

// ============================================================================
// UI State Types (local-only, no sync)
// ============================================================================

/**
 * Persisted UI state (inventory controls, preferences, etc.).
 */
export type UIState = {
  key: string; // Primary key
  value: Record<string, unknown>;
  updatedAt: number;
};

/**
 * Recent sets for quick access.
 */
export type RecentSet = {
  setNumber: string; // Primary key
  name: string;
  year: number;
  imageUrl: string | null;
  numParts: number;
  themeId: number | null;
  themeName: string | null;
  visitedAt: number; // Index for sorting
};

// ============================================================================
// Database Class
// ============================================================================

export class BrickPartyDB extends Dexie {
  // Catalog tables (read-only mirror)
  catalogSets!: EntityTable<CatalogSet, 'setNumber'>;
  catalogParts!: EntityTable<CatalogPart, 'partNum'>;
  catalogColors!: EntityTable<CatalogColor, 'id'>;
  catalogSetParts!: EntityTable<CatalogSetPart, 'id'>;
  catalogSetMeta!: EntityTable<CatalogSetMeta, 'setNumber'>;
  catalogMinifigs!: EntityTable<CatalogMinifig, 'figNum'>;

  // User data tables (local-first with sync)
  localOwned!: EntityTable<LocalOwned, 'id'>;
  localCollections!: EntityTable<LocalCollection, 'id'>;
  localCollectionItems!: EntityTable<LocalCollectionItem, 'id'>;

  // Sync infrastructure
  syncQueue!: EntityTable<SyncQueueItem, 'id'>;
  meta!: EntityTable<MetaEntry, 'key'>;

  // UI state (local-only)
  uiState!: EntityTable<UIState, 'key'>;
  recentSets!: EntityTable<RecentSet, 'setNumber'>;

  constructor() {
    super('BrickPartyDB');

    this.version(3).stores({
      // Catalog tables
      // Format: 'primaryKey, index1, index2, ...'
      catalogSets: 'setNumber, themeId, year, cachedAt',
      catalogParts: 'partNum, categoryId, parentCategory, cachedAt',
      catalogColors: 'id, cachedAt',
      catalogSetParts:
        '++id, setNumber, partNum, colorId, inventoryKey, [setNumber+inventoryKey]',
      catalogSetMeta: 'setNumber, inventoryCachedAt, inventoryVersion',
      catalogMinifigs: 'figNum, blId, cachedAt',

      // User data tables
      localOwned: '++id, setNumber, inventoryKey, [setNumber+inventoryKey], updatedAt',
      localCollections: 'id, userId, type, updatedAt',
      localCollectionItems: '++id, collectionId, itemType, itemId, addedAt',

      // Sync infrastructure
      syncQueue: '++id, table, createdAt, retryCount',
      meta: 'key',

      // UI state
      uiState: 'key',
      recentSets: 'setNumber, visitedAt',
    });

    // Version 4: add compound indexes for common query patterns (set + color).
    this.version(4).stores({
      catalogSets: 'setNumber, themeId, year, cachedAt',
      catalogParts: 'partNum, categoryId, parentCategory, cachedAt',
      catalogColors: 'id, cachedAt',
      catalogSetParts:
        '++id, setNumber, partNum, colorId, inventoryKey, [setNumber+inventoryKey], [setNumber+colorId]',
      catalogSetMeta: 'setNumber, inventoryCachedAt, inventoryVersion',
      catalogMinifigs: 'figNum, blId, cachedAt',

      localOwned:
        '++id, setNumber, inventoryKey, [setNumber+inventoryKey], [setNumber+colorId], updatedAt',
      localCollections: 'id, userId, type, updatedAt',
      localCollectionItems: '++id, collectionId, itemType, itemId, addedAt',

      syncQueue: '++id, table, createdAt, retryCount',
      meta: 'key',

      uiState: 'key',
      recentSets: 'setNumber, visitedAt',
    });
  }
}

// Singleton instance
let dbInstance: BrickPartyDB | null = null;

/**
 * Get the singleton database instance.
 * Creates the database on first call.
 */
export function getLocalDb(): BrickPartyDB {
  if (!dbInstance) {
    dbInstance = new BrickPartyDB();
  }
  return dbInstance;
}

/**
 * Check if IndexedDB is available in the current environment.
 */
export function isIndexedDBAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  if (typeof indexedDB === 'undefined') return false;
  try {
    // Some browsers block IndexedDB in private mode
    return !!indexedDB;
  } catch {
    return false;
  }
}




