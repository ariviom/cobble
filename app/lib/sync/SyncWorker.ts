import { SYNC_BATCH_SIZE, SYNC_INTERVAL_MS } from '@/app/config/timing';
import {
  getLocalDb,
  getPendingSyncOperations,
  getStoredUserId,
  getSyncQueueCount,
  isIndexedDBAvailable,
  isMigrationComplete,
  markSyncOperationFailed,
  pruneStaleInventoryCache,
  removeSyncOperations,
  setMigrationComplete,
  setStoredUserId,
} from '@/app/lib/localDb';
import {
  getTabCoordinator,
  notifySyncComplete,
  shouldSync,
} from '@/app/lib/sync/tabCoordinator';
import { resetOwnedCache } from '@/app/store/owned';
import type { StatusListener, SyncWorkerStatus } from './types';

// Migration IDs
const MIGRATION_LOCALSTORAGE_OWNED = 'localStorage_owned_v1';

type SyncWorkerConfig = {
  syncIntervalMs?: number;
  syncBatchSize?: number;
};

export class SyncWorker {
  private readonly syncIntervalMs: number;
  private readonly syncBatchSize: number;

  private isReady = false;
  private isAvailable = false;
  private isSyncing = false;
  private lastSyncError: string | null = null;
  private isLeader = true; // Assume leader until told otherwise
  private pendingSyncCount = 0;
  private isDestroyed = false;

  private userId: string | null = null;
  private syncInterval: ReturnType<typeof setInterval> | null = null;
  private leaderUnsubscribe: (() => void) | null = null;
  private listeners = new Set<StatusListener>();

  // Bound handlers for add/removeEventListener
  private readonly handleVisibility = () => this.onVisibilityChange();
  private readonly handleBeforeUnload = () => this.onBeforeUnload();
  private readonly handlePageHide = () => this.onBeforeUnload();

  constructor(config?: SyncWorkerConfig) {
    this.syncIntervalMs = config?.syncIntervalMs ?? SYNC_INTERVAL_MS;
    this.syncBatchSize = config?.syncBatchSize ?? SYNC_BATCH_SIZE;
  }

  // ===========================================================================
  // Lifecycle
  // ===========================================================================

  async init(): Promise<void> {
    if (this.isDestroyed) return;
    if (typeof window === 'undefined') return;

    this.isAvailable = isIndexedDBAvailable();

    if (!this.isAvailable) {
      this.isReady = true;
      this.notify();
      return;
    }

    // Defer initialization to idle time / next tick
    return new Promise<void>(resolve => {
      const run = async () => {
        if (this.isDestroyed) {
          resolve();
          return;
        }
        await this.initializeDb();
        this.registerEventListeners();
        this.subscribeToLeader();
        void this.pruneStaleCache();

        // If userId was set before init finished, start sync loop now
        if (this.userId) {
          void this.performSync();
          this.startSyncLoop();
        }

        resolve();
      };

      const win = window as Window & {
        requestIdleCallback?: (
          cb: () => void,
          opts?: { timeout?: number }
        ) => number;
      };

      if (typeof win.requestIdleCallback === 'function') {
        win.requestIdleCallback(() => void run(), { timeout: 2000 });
      } else {
        setTimeout(() => void run(), 0);
      }
    });
  }

  destroy(): void {
    this.isDestroyed = true;
    this.stopSyncLoop();
    this.removeEventListeners();

    if (this.leaderUnsubscribe) {
      this.leaderUnsubscribe();
      this.leaderUnsubscribe = null;
    }

    this.listeners.clear();
  }

  // ===========================================================================
  // User ID
  // ===========================================================================

  async setUserId(userId: string | null): Promise<void> {
    const previousUserId = this.userId;
    this.userId = userId;

    // Clear in-memory owned caches when the user actually changes
    if (previousUserId !== userId) {
      await resetOwnedCache();
    }

    if (this.isAvailable && this.isReady) {
      void setStoredUserId(userId);
    }

    if (userId && this.isReady) {
      void this.performSync();
      void this.updatePendingCount();
      this.startSyncLoop();
    } else {
      this.stopSyncLoop();
    }
  }

  // ===========================================================================
  // Sync
  // ===========================================================================

  async performSync(opts?: {
    keepalive?: boolean;
    force?: boolean;
  }): Promise<void> {
    if (this.isSyncing) return;
    if (this.isDestroyed) return;
    if (!this.isAvailable || !this.isReady) return;

    // Only the leader tab should sync (unless forced for flush-on-unload)
    if (!opts?.force && !shouldSync()) return;

    const userId = this.userId ?? (await getStoredUserId());
    if (!userId) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;

    this.isSyncing = true;
    this.lastSyncError = null;
    this.notify();

    try {
      const operations = await getPendingSyncOperations(
        userId,
        this.syncBatchSize
      );
      if (operations.length === 0) return;

      const payload = {
        operations: operations.map(op => ({
          id: op.id,
          table: op.table,
          operation: op.operation,
          payload: op.payload,
        })),
      };

      const useBeacon =
        opts?.keepalive === true &&
        typeof navigator !== 'undefined' &&
        typeof navigator.sendBeacon === 'function';

      let beaconUsed = false;

      if (useBeacon) {
        const blob = new Blob([JSON.stringify(payload)], {
          type: 'application/json',
        });
        const sent = navigator.sendBeacon('/api/sync', blob);
        if (!sent) {
          throw new Error('sendBeacon failed');
        }
        beaconUsed = true;
        // Best-effort delivery: keep queue entries until a confirmed sync
      } else {
        const response = await fetch('/api/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          keepalive: opts?.keepalive === true,
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const errorData = (await response.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(errorData.error || `Sync failed: ${response.status}`);
        }

        const result = (await response.json()) as {
          success: boolean;
          processed: number;
          failed?: Array<{ id: number; error: string }>;
        };

        const successIds = operations
          .filter(op => !result.failed?.some(f => f.id === op.id))
          .map(op => op.id!)
          .filter((id): id is number => id !== undefined);

        if (successIds.length > 0) {
          await removeSyncOperations(successIds);
        }

        if (result.failed) {
          for (const failure of result.failed) {
            await markSyncOperationFailed(failure.id, failure.error);
          }
        }
      }

      await this.updatePendingCount();

      // Only notify other tabs if we got confirmed delivery (not beacon fire-and-forget)
      if (!beaconUsed) {
        notifySyncComplete(true);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown sync error';
      this.lastSyncError = errorMessage;
      this.notify();
      console.warn('Sync failed:', errorMessage);
      notifySyncComplete(false);
    } finally {
      this.isSyncing = false;
      this.notify();
    }
  }

  // ===========================================================================
  // Status
  // ===========================================================================

  getStatus(): SyncWorkerStatus {
    return {
      isReady: this.isReady,
      isAvailable: this.isAvailable,
      pendingSyncCount: this.pendingSyncCount,
      isSyncing: this.isSyncing,
      lastSyncError: this.lastSyncError,
      isLeader: this.isLeader,
    };
  }

  subscribe(listener: StatusListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  // ===========================================================================
  // Private: DB Initialization
  // ===========================================================================

  private async initializeDb(): Promise<void> {
    try {
      const db = getLocalDb();
      await db.open();
      await this.runMigrations();
      this.isReady = true;
      this.notify();
    } catch (error) {
      console.error('Failed to initialize local database:', error);
      this.isReady = true; // Still mark ready so app can function
      this.notify();
    }
  }

  // ===========================================================================
  // Private: Migrations
  // ===========================================================================

  private async runMigrations(): Promise<void> {
    await this.migrateLocalStorageOwned();
  }

  private async migrateLocalStorageOwned(): Promise<void> {
    if (typeof window === 'undefined') return;
    if (await isMigrationComplete(MIGRATION_LOCALSTORAGE_OWNED)) return;

    try {
      const db = getLocalDb();
      const now = Date.now();
      const prefix = 'brick_party_owned_';
      const suffix = '_v1';

      const keysToMigrate: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(prefix) && key.endsWith(suffix)) {
          keysToMigrate.push(key);
        }
      }

      if (keysToMigrate.length === 0) {
        await setMigrationComplete(MIGRATION_LOCALSTORAGE_OWNED);
        return;
      }

      const migratedKeys: string[] = [];

      for (const storageKey of keysToMigrate) {
        try {
          const raw = localStorage.getItem(storageKey);
          if (!raw) continue;

          const data = JSON.parse(raw) as Record<string, number>;
          const setNumber = storageKey.replace(prefix, '').replace(suffix, '');

          const entries = Object.entries(data)
            .filter(([, qty]) => qty > 0)
            .map(([inventoryKey, quantity]) => ({
              setNumber,
              inventoryKey,
              quantity,
              updatedAt: now,
            }));

          if (entries.length > 0) {
            await db.transaction('rw', db.localOwned, async () => {
              await db.localOwned.bulkAdd(entries);
            });

            const written = await db.localOwned
              .where('setNumber')
              .equals(setNumber)
              .count();

            if (written >= entries.length) {
              migratedKeys.push(storageKey);
            }
          } else {
            migratedKeys.push(storageKey);
          }
        } catch (e) {
          console.warn(`Failed to migrate localStorage key ${storageKey}:`, e);
        }
      }

      for (const key of migratedKeys) {
        try {
          localStorage.removeItem(key);
        } catch {
          // Ignore removal errors
        }
      }

      if (migratedKeys.length === keysToMigrate.length) {
        await setMigrationComplete(MIGRATION_LOCALSTORAGE_OWNED);
      }
    } catch (error) {
      console.warn('localStorage → IndexedDB migration failed:', error);
    }
  }

  // ===========================================================================
  // Private: Cache Pruning
  // ===========================================================================

  private async pruneStaleCache(): Promise<void> {
    if (!this.isAvailable) return;

    try {
      // Dynamically import to avoid circular dependency with store
      const { useOpenTabsStore } = await import('@/app/store/open-tabs');
      const tabs = useOpenTabsStore.getState().tabs;
      const openSetNumbers = new Set<string>();
      for (const tab of tabs) {
        if (tab.type === 'set') {
          openSetNumbers.add(tab.setNumber);
        }
      }

      await pruneStaleInventoryCache(openSetNumbers);
    } catch (error) {
      console.warn('Failed to prune stale cache:', error);
    }
  }

  // ===========================================================================
  // Private: Sync Loop
  // ===========================================================================

  private startSyncLoop(): void {
    if (this.syncInterval) return;
    if (!this.isReady || !this.userId) return;

    this.syncInterval = setInterval(() => {
      void this.performSync();
      void this.updatePendingCount();
    }, this.syncIntervalMs);
  }

  private stopSyncLoop(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  // ===========================================================================
  // Private: Event Listeners
  // ===========================================================================

  private registerEventListeners(): void {
    document.addEventListener('visibilitychange', this.handleVisibility);
    window.addEventListener('beforeunload', this.handleBeforeUnload);
    window.addEventListener('pagehide', this.handlePageHide);
  }

  private removeEventListeners(): void {
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.handleVisibility);
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('beforeunload', this.handleBeforeUnload);
      window.removeEventListener('pagehide', this.handlePageHide);
    }
  }

  private onVisibilityChange(): void {
    if (this.isDestroyed || !this.userId) return;

    if (document.visibilityState === 'visible') {
      void this.performSync();
    } else if (document.visibilityState === 'hidden') {
      void this.performSync({ keepalive: true });
    }
  }

  private onBeforeUnload(): void {
    if (this.isDestroyed || !this.userId) return;

    if (this.pendingSyncCount > 0) {
      void this.performSync({ keepalive: true, force: true });
    }
  }

  // ===========================================================================
  // Private: Leader Tracking
  // ===========================================================================

  private subscribeToLeader(): void {
    const coordinator = getTabCoordinator();
    if (!coordinator) return;

    this.leaderUnsubscribe = coordinator.onLeaderChange(
      (newIsLeader: boolean) => {
        if (this.isDestroyed) return;
        this.isLeader = newIsLeader;
        this.notify();
      }
    );
  }

  // ===========================================================================
  // Private: Helpers
  // ===========================================================================

  private async updatePendingCount(): Promise<void> {
    const userId = this.userId;
    if (!userId || this.isDestroyed) return;

    try {
      const count = await getSyncQueueCount(userId);
      if (!this.isDestroyed) {
        this.pendingSyncCount = count;
        this.notify();
      }
    } catch {
      // Ignore count errors
    }
  }

  private notify(): void {
    if (this.isDestroyed) return;
    const status = this.getStatus();
    for (const listener of this.listeners) {
      try {
        listener(status);
      } catch {
        // Ignore listener errors
      }
    }
  }
}
