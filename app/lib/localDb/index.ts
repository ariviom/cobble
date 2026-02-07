/**
 * Local database module exports.
 *
 * This module provides the IndexedDB-backed local storage layer for:
 * - Catalog caching (sets, parts, inventories)
 * - User data (owned quantities, collections)
 * - Sync queue for Supabase writes
 */

export {
  BrickPartyDB,
  getLocalDb,
  isIndexedDBAvailable,
  type CatalogSet,
  type CatalogPart,
  type CatalogColor,
  type CatalogSetPart,
  type CatalogSetMeta,
  type CatalogMinifig,
  type LocalOwned,
  type LocalCollection,
  type LocalCollectionItem,
  type SyncQueueItem,
  type MetaEntry,
  type UIState,
  type RecentSet,
} from './schema';

export {
  getCachedInventory,
  setCachedInventory,
  isInventoryCacheValid,
  invalidateInventoryCache,
  getCachedSetSummary,
  setCachedSetSummary,
} from './catalogCache';

export {
  getCachedMinifig,
  getCachedMinifigByBlId,
  setCachedMinifig,
  bulkSetCachedMinifigs,
} from './minifigCache';

export {
  getOwnedForSet,
  setOwnedForSet,
  getOwnedQuantity,
  setOwnedQuantity,
  clearOwnedForSet,
  markAllOwnedForSet,
} from './ownedStore';

export {
  enqueueSyncOperation,
  getPendingSyncOperations,
  removeSyncOperations,
  markSyncOperationFailed,
  getSyncQueueCount,
  enqueueOwnedChange,
} from './syncQueue';

export {
  getMeta,
  setMeta,
  getLastSyncTime,
  setLastSyncTime,
  getCatalogVersion,
  setCatalogVersion,
  getStoredUserId,
  setStoredUserId,
  isMigrationComplete,
  setMigrationComplete,
} from './metaStore';

export {
  getPartiallyCompleteSets,
  getTotalPartsForSets,
  type SetCompletionStats,
} from './completionStats';
