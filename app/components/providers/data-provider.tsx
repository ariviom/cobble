'use client';

/**
 * DataProvider - Initializes and manages the local IndexedDB database.
 *
 * This provider:
 * - Opens the Dexie database on mount
 * - Runs localStorage → IndexedDB migrations for owned data
 * - Provides database readiness state to children
 * - Manages the sync worker for Supabase writes
 *
 * It should wrap the app content but runs only on the client.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import { useSupabaseUser } from '@/app/hooks/useSupabaseUser';
import {
  getLocalDb,
  isIndexedDBAvailable,
  getPendingSyncOperations,
  removeSyncOperations,
  markSyncOperationFailed,
  getSyncQueueCount,
  setStoredUserId,
  getStoredUserId,
  isMigrationComplete,
  setMigrationComplete,
} from '@/app/lib/localDb';

// ============================================================================
// Context Types
// ============================================================================

type DataContextValue = {
  /** Whether the local database is ready for use */
  isReady: boolean;
  /** Whether IndexedDB is available in this browser */
  isAvailable: boolean;
  /** Number of pending sync operations */
  pendingSyncCount: number;
  /** Whether a sync is currently in progress */
  isSyncing: boolean;
  /** Trigger an immediate sync */
  syncNow: () => Promise<void>;
  /** Last sync error, if any */
  lastSyncError: string | null;
};

const DataContext = createContext<DataContextValue | undefined>(undefined);

// ============================================================================
// Constants
// ============================================================================

// Sync interval: 30 seconds when online
const SYNC_INTERVAL_MS = 30 * 1000;

// Batch size for sync operations
const SYNC_BATCH_SIZE = 50;

// Migration IDs
const MIGRATION_LOCALSTORAGE_OWNED = 'localStorage_owned_v1';

// ============================================================================
// Provider Component
// ============================================================================

export function DataProvider({ children }: PropsWithChildren) {
  const { user } = useSupabaseUser();
  const [isReady, setIsReady] = useState(false);
  const [isAvailable] = useState(() => isIndexedDBAvailable());
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncError, setLastSyncError] = useState<string | null>(null);

  const syncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isMountedRef = useRef(true);

  // Track user ID changes for sync
  const userIdRef = useRef<string | null>(null);

  // ============================================================================
  // Database Initialization
  // ============================================================================

  useEffect(() => {
    if (!isAvailable) {
      setIsReady(true); // Mark as "ready" even without IndexedDB so app works
      return;
    }

    async function initializeDb() {
      try {
        // Open the database (Dexie auto-creates tables on first access)
        const db = getLocalDb();
        await db.open();

        // Run migrations
        await runMigrations();

        if (isMountedRef.current) {
          setIsReady(true);
        }
      } catch (error) {
        console.error('Failed to initialize local database:', error);
        if (isMountedRef.current) {
          setIsReady(true); // Still mark ready so app can function
        }
      }
    }

    // Defer initialization to idle time / next tick so we don't compete
    // with initial render work on pages that mount this provider.
    if (typeof window !== 'undefined') {
      const win = window as Window & {
        requestIdleCallback?: (cb: () => void, opts?: { timeout?: number }) => number;
        cancelIdleCallback?: (id: number) => void;
      };

      if (typeof win.requestIdleCallback === 'function') {
        const id = win.requestIdleCallback(() => {
          void initializeDb();
        }, { timeout: 2000 });

        return () => {
          isMountedRef.current = false;
          if (typeof win.cancelIdleCallback === 'function') {
            win.cancelIdleCallback(id);
          }
        };
      }

      const timeoutId = window.setTimeout(() => {
        void initializeDb();
      }, 0);

      return () => {
        isMountedRef.current = false;
        window.clearTimeout(timeoutId);
      };
    }

    return () => {
      isMountedRef.current = false;
    };
  }, [isAvailable]);

  // ============================================================================
  // User ID Tracking
  // ============================================================================

  useEffect(() => {
    if (!isAvailable || !isReady) return;

    const userId = user?.id ?? null;
    userIdRef.current = userId;

    // Store user ID for offline reference
    void setStoredUserId(userId);
  }, [user?.id, isAvailable, isReady]);

  // ============================================================================
  // Sync Worker
  // ============================================================================

  const performSync = useCallback(async (): Promise<void> => {
    if (!isAvailable || !isReady) return;

    // Get stored user ID (may be from previous session if currently offline)
    const userId = userIdRef.current ?? (await getStoredUserId());
    if (!userId) {
      // No user to sync for
      return;
    }

    // Check if we're online
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return;
    }

    setIsSyncing(true);
    setLastSyncError(null);

    try {
      // Get pending operations
      const operations = await getPendingSyncOperations(SYNC_BATCH_SIZE);
      if (operations.length === 0) {
        return;
      }

      // Send to sync endpoint
      const response = await fetch('/api/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'same-origin',
        body: JSON.stringify({
          operations: operations.map(op => ({
            id: op.id,
            table: op.table,
            operation: op.operation,
            payload: op.payload,
          })),
        }),
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

      // Remove successfully processed operations
      const successIds = operations
        .filter(op => !result.failed?.some(f => f.id === op.id))
        .map(op => op.id!)
        .filter((id): id is number => id !== undefined);

      if (successIds.length > 0) {
        await removeSyncOperations(successIds);
      }

      // Mark failed operations
      if (result.failed) {
        for (const failure of result.failed) {
          await markSyncOperationFailed(failure.id, failure.error);
        }
      }

      // Update pending count
      const newCount = await getSyncQueueCount();
      if (isMountedRef.current) {
        setPendingSyncCount(newCount);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown sync error';
      if (isMountedRef.current) {
        setLastSyncError(errorMessage);
      }
      console.warn('Sync failed:', errorMessage);
    } finally {
      if (isMountedRef.current) {
        setIsSyncing(false);
      }
    }
  }, [isAvailable, isReady]);

  // Start sync interval when ready and user is logged in
  useEffect(() => {
    if (!isAvailable || !isReady || !user) {
      // Clear interval if conditions not met
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
        syncIntervalRef.current = null;
      }
      return;
    }

    // Initial sync
    void performSync();

    // Update pending count periodically
    const updateCount = async () => {
      const count = await getSyncQueueCount();
      if (isMountedRef.current) {
        setPendingSyncCount(count);
      }
    };
    void updateCount();

    // Start interval
    syncIntervalRef.current = setInterval(() => {
      void performSync();
      void updateCount();
    }, SYNC_INTERVAL_MS);

    return () => {
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
        syncIntervalRef.current = null;
      }
    };
  }, [isAvailable, isReady, user, performSync]);

  // Sync on visibility change (when tab becomes visible)
  useEffect(() => {
    if (!isAvailable || !isReady || !user) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void performSync();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isAvailable, isReady, user, performSync]);

  // Sync before unload
  useEffect(() => {
    if (!isAvailable || !isReady || !user) return;

    const handleBeforeUnload = () => {
      // Use sendBeacon for reliable sync on page close
      // Note: This is a fire-and-forget, we can't await it
      if (pendingSyncCount > 0 && navigator.sendBeacon) {
        // We can't send complex data with sendBeacon easily,
        // so we just trigger a lightweight ping that the server can use
        // to know there might be pending data. Full sync happens on next load.
        navigator.sendBeacon('/api/sync/ping', '');
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isAvailable, isReady, user, pendingSyncCount]);

  // ============================================================================
  // Context Value
  // ============================================================================

  const syncNow = useCallback(async () => {
    await performSync();
  }, [performSync]);

  const contextValue: DataContextValue = {
    isReady,
    isAvailable,
    pendingSyncCount,
    isSyncing,
    syncNow,
    lastSyncError,
  };

  return (
    <DataContext.Provider value={contextValue}>{children}</DataContext.Provider>
  );
}

// ============================================================================
// Hook
// ============================================================================

export function useDataContext(): DataContextValue {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error('useDataContext must be used within DataProvider');
  }
  return context;
}

// ============================================================================
// Migrations
// ============================================================================

/**
 * Run one-time migrations from localStorage to IndexedDB.
 */
async function runMigrations(): Promise<void> {
  // Migration: localStorage owned data → IndexedDB
  await migrateLocalStorageOwned();
}

/**
 * Migrate owned quantities from localStorage to IndexedDB.
 * After successful write + read verification, deletes the localStorage keys.
 */
async function migrateLocalStorageOwned(): Promise<void> {
  if (typeof window === 'undefined') return;

  // Check if already migrated
  if (await isMigrationComplete(MIGRATION_LOCALSTORAGE_OWNED)) {
    return;
  }

  try {
    const db = getLocalDb();
    const now = Date.now();
    const prefix = 'brick_party_owned_';
    const suffix = '_v1';

    // Find all localStorage keys matching the owned pattern
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

    // Track successfully migrated keys for cleanup
    const migratedKeys: string[] = [];

    // Migrate each set's owned data
    for (const storageKey of keysToMigrate) {
      try {
        const raw = localStorage.getItem(storageKey);
        if (!raw) continue;

        const data = JSON.parse(raw) as Record<string, number>;

        // Extract set number from key
        const setNumber = storageKey.replace(prefix, '').replace(suffix, '');

        // Convert to IndexedDB entries
        const entries = Object.entries(data)
          .filter(([, qty]) => qty > 0)
          .map(([inventoryKey, quantity]) => ({
            setNumber,
            inventoryKey,
            quantity,
            updatedAt: now,
          }));

        if (entries.length > 0) {
          // Write to IndexedDB
          await db.transaction('rw', db.localOwned, async () => {
            await db.localOwned.bulkAdd(entries);
          });

          // Verify the write by reading back
          const written = await db.localOwned
            .where('setNumber')
            .equals(setNumber)
            .count();

          if (written >= entries.length) {
            // Successful write + read verification - safe to delete localStorage
            migratedKeys.push(storageKey);
          }
        } else {
          // Empty data, just mark as migrated
          migratedKeys.push(storageKey);
        }
      } catch (e) {
        console.warn(`Failed to migrate localStorage key ${storageKey}:`, e);
        // Don't add to migratedKeys - will be retried on next load
      }
    }

    // Delete successfully migrated localStorage keys
    for (const key of migratedKeys) {
      try {
        localStorage.removeItem(key);
      } catch {
        // Ignore removal errors
      }
    }

    // Only mark complete if all keys were migrated
    if (migratedKeys.length === keysToMigrate.length) {
      await setMigrationComplete(MIGRATION_LOCALSTORAGE_OWNED);
    }
  } catch (error) {
    console.warn('localStorage → IndexedDB migration failed:', error);
    // Don't mark as complete so we can retry
  }
}

