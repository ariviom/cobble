import { SYNC_BATCH_SIZE, SYNC_INTERVAL_MS } from '@/app/config/timing';
import { SyncWorker } from '@/app/lib/sync/SyncWorker';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockOpen = vi.fn().mockResolvedValue(undefined);
const mockBulkAdd = vi.fn().mockResolvedValue(undefined);
const mockWhere = vi.fn().mockReturnValue({
  equals: vi.fn().mockReturnValue({ count: vi.fn().mockResolvedValue(0) }),
});
const mockTransaction = vi.fn().mockImplementation((_mode, _table, fn) => fn());

vi.mock('@/app/lib/localDb', () => ({
  getLocalDb: vi.fn(() => ({
    open: mockOpen,
    localOwned: { bulkAdd: mockBulkAdd, where: mockWhere },
    transaction: mockTransaction,
  })),
  isIndexedDBAvailable: vi.fn(() => true),
  isMigrationComplete: vi.fn().mockResolvedValue(true),
  setMigrationComplete: vi.fn().mockResolvedValue(undefined),
  getPendingSyncOperations: vi.fn().mockResolvedValue([]),
  removeSyncOperations: vi.fn().mockResolvedValue(undefined),
  markSyncOperationFailed: vi.fn().mockResolvedValue(undefined),
  getSyncQueueCount: vi.fn().mockResolvedValue(0),
  getStoredUserId: vi.fn().mockResolvedValue(null),
  setStoredUserId: vi.fn().mockResolvedValue(undefined),
  setMeta: vi.fn().mockResolvedValue(undefined),
}));

const mockShouldSync = vi.fn(() => true);
const mockNotifySyncComplete = vi.fn();
const mockOnLeaderChange = vi.fn(
  (cb: (isLeader: boolean) => void): (() => void) => {
    cb(true);
    return vi.fn();
  }
);

vi.mock('@/app/lib/sync/tabCoordinator', () => ({
  getTabCoordinator: vi.fn(() => ({
    onLeaderChange: mockOnLeaderChange,
    shouldSync: mockShouldSync,
  })),
  shouldSync: () => mockShouldSync(),
  notifySyncComplete: (success: boolean) => mockNotifySyncComplete(success),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const localDb = vi.mocked(await import('@/app/lib/localDb'));

function flushPromises(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SyncWorker', () => {
  let worker: SyncWorker;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.clearAllMocks();
    mockShouldSync.mockReturnValue(true);
    localDb.isIndexedDBAvailable.mockReturnValue(true);
    localDb.isMigrationComplete.mockResolvedValue(true);
    localDb.getPendingSyncOperations.mockResolvedValue([]);
    localDb.getSyncQueueCount.mockResolvedValue(0);
    localDb.getStoredUserId.mockResolvedValue(null);

    // Stub fetch globally
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ success: true, processed: 0 }),
      })
    );

    vi.stubGlobal('navigator', {
      onLine: true,
      sendBeacon: vi.fn(() => true),
    });
  });

  afterEach(() => {
    worker?.destroy();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  // =========================================================================
  // init()
  // =========================================================================

  describe('init()', () => {
    it('opens the database and becomes ready', async () => {
      worker = new SyncWorker();
      const initPromise = worker.init();
      await vi.advanceTimersByTimeAsync(0);
      await initPromise;

      expect(mockOpen).toHaveBeenCalled();
      expect(worker.getStatus().isReady).toBe(true);
      expect(worker.getStatus().isAvailable).toBe(true);
    });

    it('marks ready even when IDB unavailable', async () => {
      localDb.isIndexedDBAvailable.mockReturnValue(false);
      worker = new SyncWorker();
      await worker.init();

      const status = worker.getStatus();
      expect(status.isReady).toBe(true);
      expect(status.isAvailable).toBe(false);
      expect(mockOpen).not.toHaveBeenCalled();
    });

    it('marks ready even when DB open fails', async () => {
      mockOpen.mockRejectedValueOnce(new Error('DB open failed'));
      worker = new SyncWorker();
      const initPromise = worker.init();
      await vi.advanceTimersByTimeAsync(0);
      await initPromise;

      expect(worker.getStatus().isReady).toBe(true);
    });

    it('runs migrations during init', async () => {
      localDb.isMigrationComplete.mockResolvedValue(false);
      worker = new SyncWorker();
      const initPromise = worker.init();
      await vi.advanceTimersByTimeAsync(0);
      await initPromise;

      // Should check migration status
      expect(localDb.isMigrationComplete).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // setUserId()
  // =========================================================================

  describe('setUserId()', () => {
    it('stores userId via setStoredUserId when ready', async () => {
      worker = new SyncWorker();
      const initPromise = worker.init();
      await vi.advanceTimersByTimeAsync(0);
      await initPromise;

      worker.setUserId('user-123');
      await flushPromises();

      expect(localDb.setStoredUserId).toHaveBeenCalledWith('user-123');
    });

    it('starts sync loop on login', async () => {
      worker = new SyncWorker();
      const initPromise = worker.init();
      await vi.advanceTimersByTimeAsync(0);
      await initPromise;

      worker.setUserId('user-123');
      await flushPromises();

      // Advance past one sync interval
      await vi.advanceTimersByTimeAsync(SYNC_INTERVAL_MS + 100);

      // performSync should have been called (initial + interval)
      expect(localDb.getPendingSyncOperations).toHaveBeenCalled();
    });

    it('stops sync loop on logout', async () => {
      worker = new SyncWorker();
      const initPromise = worker.init();
      await vi.advanceTimersByTimeAsync(0);
      await initPromise;

      worker.setUserId('user-123');
      await flushPromises();
      const callsBefore = localDb.getPendingSyncOperations.mock.calls.length;

      worker.setUserId(null);
      await vi.advanceTimersByTimeAsync(SYNC_INTERVAL_MS * 2);

      // No new calls after logout
      expect(localDb.getPendingSyncOperations.mock.calls.length).toBe(
        callsBefore
      );
    });

    it('starts sync loop if userId set before init completes', async () => {
      worker = new SyncWorker();
      worker.setUserId('user-123');

      const initPromise = worker.init();
      await vi.advanceTimersByTimeAsync(0);
      await initPromise;

      // Should have triggered initial sync after init
      expect(localDb.getPendingSyncOperations).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // performSync()
  // =========================================================================

  describe('performSync()', () => {
    beforeEach(async () => {
      worker = new SyncWorker();
      const initPromise = worker.init();
      await vi.advanceTimersByTimeAsync(0);
      await initPromise;
    });

    it('skips when not ready', async () => {
      const worker2 = new SyncWorker();
      // Don't call init
      await worker2.performSync();
      expect(localDb.getPendingSyncOperations).not.toHaveBeenCalled();
      worker2.destroy();
    });

    it('skips when offline', async () => {
      vi.stubGlobal('navigator', { onLine: false, sendBeacon: vi.fn() });
      worker.setUserId('user-123');
      await flushPromises();
      vi.clearAllMocks();

      await worker.performSync();
      expect(localDb.getPendingSyncOperations).not.toHaveBeenCalled();
    });

    it('skips when not leader (unless forced)', async () => {
      mockShouldSync.mockReturnValue(false);
      worker.setUserId('user-123');
      await flushPromises();
      vi.clearAllMocks();

      await worker.performSync();
      expect(localDb.getPendingSyncOperations).not.toHaveBeenCalled();

      // Force bypasses leader check
      await worker.performSync({ force: true });
      expect(localDb.getPendingSyncOperations).toHaveBeenCalled();
    });

    it('no-ops when queue is empty', async () => {
      worker.setUserId('user-123');
      localDb.getPendingSyncOperations.mockResolvedValue([]);
      await flushPromises();
      vi.clearAllMocks();

      await worker.performSync();
      expect(fetch).not.toHaveBeenCalled();
    });

    it('fetches /api/sync with operations and removes on success', async () => {
      worker.setUserId('user-123');
      localDb.getPendingSyncOperations.mockResolvedValue([
        {
          id: 1,
          userId: 'user-123',
          table: 'user_set_parts',
          operation: 'upsert',
          payload: { partNum: '3001', colorId: 1 },
          createdAt: Date.now(),
          clientId: 'client-1',
          retryCount: 0,
          lastError: null,
        },
      ]);
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({ success: true, processed: 1 }),
      } as unknown as Response);

      await worker.performSync();

      expect(fetch).toHaveBeenCalledWith(
        '/api/sync',
        expect.objectContaining({
          method: 'POST',
        })
      );
      expect(localDb.removeSyncOperations).toHaveBeenCalledWith([1]);
      expect(mockNotifySyncComplete).toHaveBeenCalledWith(true);
    });

    it('marks failed operations', async () => {
      worker.setUserId('user-123');
      localDb.getPendingSyncOperations.mockResolvedValue([
        {
          id: 1,
          userId: 'user-123',
          table: 'user_set_parts',
          operation: 'upsert',
          payload: {},
          createdAt: Date.now(),
          clientId: 'client-1',
          retryCount: 0,
          lastError: null,
        },
        {
          id: 2,
          userId: 'user-123',
          table: 'user_set_parts',
          operation: 'upsert',
          payload: {},
          createdAt: Date.now(),
          clientId: 'client-1',
          retryCount: 0,
          lastError: null,
        },
      ]);
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          success: true,
          processed: 1,
          failed: [{ id: 2, error: 'conflict' }],
        }),
      } as unknown as Response);

      await worker.performSync();

      expect(localDb.removeSyncOperations).toHaveBeenCalledWith([1]);
      expect(localDb.markSyncOperationFailed).toHaveBeenCalledWith(
        2,
        'conflict'
      );
    });

    it('uses sendBeacon when keepalive is true', async () => {
      worker.setUserId('user-123');
      localDb.getPendingSyncOperations.mockResolvedValue([
        {
          id: 1,
          userId: 'user-123',
          table: 'user_set_parts',
          operation: 'upsert',
          payload: {},
          createdAt: Date.now(),
          clientId: 'client-1',
          retryCount: 0,
          lastError: null,
        },
      ]);
      vi.clearAllMocks();

      await worker.performSync({ keepalive: true });

      expect(navigator.sendBeacon).toHaveBeenCalledWith(
        '/api/sync',
        expect.any(Blob)
      );
      // sendBeacon path does not remove ops (no response to confirm)
      expect(localDb.removeSyncOperations).not.toHaveBeenCalled();
    });

    it('sets lastSyncError on failure', async () => {
      worker.setUserId('user-123');
      localDb.getPendingSyncOperations.mockResolvedValue([
        {
          id: 1,
          userId: 'user-123',
          table: 'user_set_parts',
          operation: 'upsert',
          payload: {},
          createdAt: Date.now(),
          clientId: 'client-1',
          retryCount: 0,
          lastError: null,
        },
      ]);
      vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'));

      await worker.performSync();

      expect(worker.getStatus().lastSyncError).toBe('Network error');
      expect(mockNotifySyncComplete).toHaveBeenCalledWith(false);
    });
  });

  // =========================================================================
  // Sync loop
  // =========================================================================

  describe('sync loop', () => {
    it('fires periodically after login', async () => {
      worker = new SyncWorker();
      const initPromise = worker.init();
      await vi.advanceTimersByTimeAsync(0);
      await initPromise;

      worker.setUserId('user-123');
      await flushPromises();
      vi.clearAllMocks();

      await vi.advanceTimersByTimeAsync(SYNC_INTERVAL_MS);
      expect(localDb.getPendingSyncOperations).toHaveBeenCalled();

      vi.clearAllMocks();
      await vi.advanceTimersByTimeAsync(SYNC_INTERVAL_MS);
      expect(localDb.getPendingSyncOperations).toHaveBeenCalled();
    });

    it('stops on destroy', async () => {
      worker = new SyncWorker();
      const initPromise = worker.init();
      await vi.advanceTimersByTimeAsync(0);
      await initPromise;

      worker.setUserId('user-123');
      await flushPromises();
      vi.clearAllMocks();

      worker.destroy();
      await vi.advanceTimersByTimeAsync(SYNC_INTERVAL_MS * 2);
      expect(localDb.getPendingSyncOperations).not.toHaveBeenCalled();
    });

    it('respects custom interval', async () => {
      const customInterval = 5000;
      worker = new SyncWorker({ syncIntervalMs: customInterval });
      const initPromise = worker.init();
      await vi.advanceTimersByTimeAsync(0);
      await initPromise;

      worker.setUserId('user-123');
      await flushPromises();
      vi.clearAllMocks();

      // Before interval — no call
      await vi.advanceTimersByTimeAsync(customInterval - 100);
      expect(localDb.getPendingSyncOperations).not.toHaveBeenCalled();

      // After interval — should call
      await vi.advanceTimersByTimeAsync(200);
      expect(localDb.getPendingSyncOperations).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Visibility handlers
  // =========================================================================

  describe('visibility handlers', () => {
    beforeEach(async () => {
      worker = new SyncWorker();
      const initPromise = worker.init();
      await vi.advanceTimersByTimeAsync(0);
      await initPromise;
      worker.setUserId('user-123');
      await flushPromises();
    });

    it('triggers sync when tab becomes visible', async () => {
      vi.clearAllMocks();
      Object.defineProperty(document, 'visibilityState', {
        value: 'visible',
        writable: true,
        configurable: true,
      });
      document.dispatchEvent(new Event('visibilitychange'));
      await flushPromises();

      expect(localDb.getPendingSyncOperations).toHaveBeenCalled();
    });

    it('triggers keepalive sync when tab becomes hidden', async () => {
      vi.clearAllMocks();
      Object.defineProperty(document, 'visibilityState', {
        value: 'hidden',
        writable: true,
        configurable: true,
      });
      document.dispatchEvent(new Event('visibilitychange'));
      await flushPromises();

      expect(localDb.getPendingSyncOperations).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Unload handlers
  // =========================================================================

  describe('unload handlers', () => {
    it('flushes with force+keepalive when pending > 0', async () => {
      // Set up mock to return count > 0 before init
      localDb.getSyncQueueCount.mockResolvedValue(5);

      worker = new SyncWorker();
      const initPromise = worker.init();
      await vi.advanceTimersByTimeAsync(0);
      await initPromise;

      worker.setUserId('user-123');
      // Let setUserId's async updatePendingCount settle
      await flushPromises();
      await vi.advanceTimersByTimeAsync(10);
      await flushPromises();

      // Verify pendingSyncCount was set
      expect(worker.getStatus().pendingSyncCount).toBe(5);

      vi.clearAllMocks();
      localDb.getPendingSyncOperations.mockResolvedValue([
        {
          id: 1,
          userId: 'user-123',
          table: 'user_set_parts',
          operation: 'upsert',
          payload: {},
          createdAt: Date.now(),
          clientId: 'client-1',
          retryCount: 0,
          lastError: null,
        },
      ]);

      window.dispatchEvent(new Event('beforeunload'));
      await flushPromises();

      // Should have called performSync with force
      expect(localDb.getPendingSyncOperations).toHaveBeenCalled();
    });

    it('skips flush when no pending operations', async () => {
      worker = new SyncWorker();
      const initPromise = worker.init();
      await vi.advanceTimersByTimeAsync(0);
      await initPromise;

      worker.setUserId('user-123');
      localDb.getSyncQueueCount.mockResolvedValue(0);
      await flushPromises();
      vi.clearAllMocks();

      window.dispatchEvent(new Event('beforeunload'));
      await flushPromises();

      expect(localDb.getPendingSyncOperations).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Leader election
  // =========================================================================

  describe('leader tracking', () => {
    it('subscribes to leader changes during init', async () => {
      worker = new SyncWorker();
      const initPromise = worker.init();
      await vi.advanceTimersByTimeAsync(0);
      await initPromise;

      expect(mockOnLeaderChange).toHaveBeenCalled();
      expect(worker.getStatus().isLeader).toBe(true);
    });

    it('updates status on leader change', async () => {
      let capturedCallback: ((isLeader: boolean) => void) | null = null;
      mockOnLeaderChange.mockImplementation(cb => {
        capturedCallback = cb;
        cb(true);
        return vi.fn();
      });

      worker = new SyncWorker();
      const initPromise = worker.init();
      await vi.advanceTimersByTimeAsync(0);
      await initPromise;

      expect(worker.getStatus().isLeader).toBe(true);

      capturedCallback!(false);
      expect(worker.getStatus().isLeader).toBe(false);
    });
  });

  // =========================================================================
  // subscribe()
  // =========================================================================

  describe('subscribe()', () => {
    it('notifies on status change', async () => {
      worker = new SyncWorker();
      const listener = vi.fn();
      worker.subscribe(listener);

      const initPromise = worker.init();
      await vi.advanceTimersByTimeAsync(0);
      await initPromise;

      // Should have been called with isReady: true
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ isReady: true })
      );
    });

    it('unsubscribe stops notifications', async () => {
      worker = new SyncWorker();
      const listener = vi.fn();
      const unsub = worker.subscribe(listener);

      unsub();
      listener.mockClear();

      const initPromise = worker.init();
      await vi.advanceTimersByTimeAsync(0);
      await initPromise;

      expect(listener).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // destroy()
  // =========================================================================

  describe('destroy()', () => {
    it('clears everything and prevents further sync', async () => {
      worker = new SyncWorker();
      const initPromise = worker.init();
      await vi.advanceTimersByTimeAsync(0);
      await initPromise;

      worker.setUserId('user-123');
      await flushPromises();
      vi.clearAllMocks();

      worker.destroy();

      // No more periodic syncs
      await vi.advanceTimersByTimeAsync(SYNC_INTERVAL_MS * 2);
      expect(localDb.getPendingSyncOperations).not.toHaveBeenCalled();

      // Direct performSync is a no-op
      await worker.performSync();
      expect(localDb.getPendingSyncOperations).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Batch size config
  // =========================================================================

  describe('config', () => {
    it('uses default batch size from config', async () => {
      worker = new SyncWorker();
      const initPromise = worker.init();
      await vi.advanceTimersByTimeAsync(0);
      await initPromise;

      worker.setUserId('user-123');
      await flushPromises();

      expect(localDb.getPendingSyncOperations).toHaveBeenCalledWith(
        'user-123',
        SYNC_BATCH_SIZE
      );
    });

    it('respects custom batch size', async () => {
      worker = new SyncWorker({ syncBatchSize: 10 });
      const initPromise = worker.init();
      await vi.advanceTimersByTimeAsync(0);
      await initPromise;

      worker.setUserId('user-456');
      await flushPromises();

      expect(localDb.getPendingSyncOperations).toHaveBeenCalledWith(
        'user-456',
        10
      );
    });
  });
});
