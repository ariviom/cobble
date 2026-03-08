import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================================
// Mocks
// ============================================================================

// Mock localLooseParts table
const mockToArray = vi.fn();
const mockFirst = vi.fn();
const mockDelete = vi.fn();
const mockEquals = vi.fn(() => ({
  first: mockFirst,
  toArray: mockToArray,
  delete: mockDelete,
}));
const mockWhere = vi.fn(() => ({ equals: mockEquals }));
const mockPut = vi.fn();
const mockClear = vi.fn();
const mockTransaction = vi.fn();

const mockEach = vi.fn();
const mockLocalLooseParts = {
  toArray: mockToArray,
  each: mockEach,
  where: mockWhere,
  put: mockPut,
  clear: mockClear,
};

// Mock syncQueue table
const mockSyncQueueAdd = vi.fn();
const mockSyncQueueUpdate = vi.fn();
const mockSyncFilter = vi.fn();
const mockSyncEquals = vi.fn(() => ({
  filter: mockSyncFilter,
}));
const mockSyncWhere = vi.fn(() => ({ equals: mockSyncEquals }));

const mockSyncQueue = {
  where: mockSyncWhere,
  add: mockSyncQueueAdd,
  update: mockSyncQueueUpdate,
};

const mockDb = {
  localLooseParts: mockLocalLooseParts,
  syncQueue: mockSyncQueue,
  transaction: mockTransaction,
};

vi.mock('../schema', () => ({
  getLocalDb: vi.fn(() => mockDb),
  isIndexedDBAvailable: vi.fn(() => true),
}));

import {
  getAllLooseParts,
  getLoosePartsCount,
  bulkUpsertLooseParts,
  clearAllLooseParts,
  enqueueLoosePartChange,
} from '../loosePartsStore';
import { isIndexedDBAvailable } from '../schema';

// ============================================================================
// Helpers
// ============================================================================

/**
 * Set up mockTransaction to execute the callback synchronously,
 * passing through to the mock table.
 */
function setupTransaction() {
  mockTransaction.mockImplementation(
    async (_mode: string, _table: unknown, cb: () => Promise<void>) => {
      await cb();
    }
  );
}

describe('loosePartsStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isIndexedDBAvailable).mockReturnValue(true);
    setupTransaction();
  });

  // ==========================================================================
  // getAllLooseParts
  // ==========================================================================

  describe('getAllLooseParts', () => {
    it('returns empty array when no data', async () => {
      mockToArray.mockResolvedValue([]);

      const result = await getAllLooseParts();

      expect(result).toEqual([]);
    });

    it('returns stored parts', async () => {
      const parts = [
        { partNum: '3001', colorId: 1, quantity: 5, updatedAt: 1000 },
        { partNum: '3002', colorId: 0, quantity: 10, updatedAt: 2000 },
      ];
      mockToArray.mockResolvedValue(parts);

      const result = await getAllLooseParts();

      expect(result).toEqual(parts);
      expect(result).toHaveLength(2);
    });

    it('returns empty array when IndexedDB unavailable', async () => {
      vi.mocked(isIndexedDBAvailable).mockReturnValue(false);

      const result = await getAllLooseParts();

      expect(result).toEqual([]);
      expect(mockToArray).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // getLoosePartsCount
  // ==========================================================================

  describe('getLoosePartsCount', () => {
    it('returns 0 when empty', async () => {
      mockEach.mockImplementation(async () => {});

      const result = await getLoosePartsCount();

      expect(result).toBe(0);
    });

    it('returns sum of quantities', async () => {
      const rows = [
        { partNum: '3001', colorId: 1, quantity: 5, updatedAt: 1000 },
        { partNum: '3002', colorId: 0, quantity: 10, updatedAt: 2000 },
        { partNum: '3003', colorId: 2, quantity: 3, updatedAt: 3000 },
      ];
      mockEach.mockImplementation(
        async (cb: (row: (typeof rows)[0]) => void) => {
          rows.forEach(cb);
        }
      );

      const result = await getLoosePartsCount();

      expect(result).toBe(18); // 5 + 10 + 3
    });

    it('returns 0 when IndexedDB unavailable', async () => {
      vi.mocked(isIndexedDBAvailable).mockReturnValue(false);

      const result = await getLoosePartsCount();

      expect(result).toBe(0);
    });
  });

  // ==========================================================================
  // bulkUpsertLooseParts
  // ==========================================================================

  describe('bulkUpsertLooseParts', () => {
    it('inserts new parts', async () => {
      mockFirst.mockResolvedValue(undefined); // no existing

      await bulkUpsertLooseParts(
        [
          { partNum: '3001', colorId: 1, quantity: 5 },
          { partNum: '3002', colorId: 0, quantity: 10 },
        ],
        'replace'
      );

      expect(mockTransaction).toHaveBeenCalled();
      expect(mockPut).toHaveBeenCalledTimes(2);
      expect(mockPut).toHaveBeenCalledWith(
        expect.objectContaining({
          partNum: '3001',
          colorId: 1,
          quantity: 5,
        })
      );
      expect(mockPut).toHaveBeenCalledWith(
        expect.objectContaining({
          partNum: '3002',
          colorId: 0,
          quantity: 10,
        })
      );
    });

    it('in merge mode keeps max quantity', async () => {
      // Existing has quantity 8, importing quantity 5 — should keep 8
      mockFirst.mockResolvedValue({
        partNum: '3001',
        colorId: 1,
        quantity: 8,
        updatedAt: 1000,
      });

      await bulkUpsertLooseParts(
        [{ partNum: '3001', colorId: 1, quantity: 5 }],
        'merge'
      );

      expect(mockPut).toHaveBeenCalledWith(
        expect.objectContaining({ quantity: 8 }) // max(8, 5)
      );
    });

    it('in merge mode uses imported quantity when larger', async () => {
      // Existing has quantity 3, importing quantity 10 — should use 10
      mockFirst.mockResolvedValue({
        partNum: '3001',
        colorId: 1,
        quantity: 3,
        updatedAt: 1000,
      });

      await bulkUpsertLooseParts(
        [{ partNum: '3001', colorId: 1, quantity: 10 }],
        'merge'
      );

      expect(mockPut).toHaveBeenCalledWith(
        expect.objectContaining({ quantity: 10 }) // max(3, 10)
      );
    });

    it('in replace mode overwrites', async () => {
      mockFirst.mockResolvedValue({
        partNum: '3001',
        colorId: 1,
        quantity: 8,
        updatedAt: 1000,
      });

      await bulkUpsertLooseParts(
        [{ partNum: '3001', colorId: 1, quantity: 5 }],
        'replace'
      );

      expect(mockPut).toHaveBeenCalledWith(
        expect.objectContaining({ quantity: 5 }) // replaces 8 with 5
      );
    });

    it('skips parts with zero quantity when no existing entry', async () => {
      mockFirst.mockResolvedValue(undefined);

      await bulkUpsertLooseParts(
        [{ partNum: '3001', colorId: 1, quantity: 0 }],
        'replace'
      );

      expect(mockPut).not.toHaveBeenCalled();
      expect(mockDelete).not.toHaveBeenCalled();
    });

    it('deletes existing entry when zero quantity in replace mode', async () => {
      mockFirst.mockResolvedValue({
        partNum: '3001',
        colorId: 1,
        quantity: 5,
        updatedAt: 1000,
      });
      mockDelete.mockResolvedValue(1);

      await bulkUpsertLooseParts(
        [{ partNum: '3001', colorId: 1, quantity: 0 }],
        'replace'
      );

      expect(mockDelete).toHaveBeenCalled();
      expect(mockPut).not.toHaveBeenCalled();
    });

    it('skips zero quantity in merge mode even with existing entry', async () => {
      mockFirst.mockResolvedValue({
        partNum: '3001',
        colorId: 1,
        quantity: 5,
        updatedAt: 1000,
      });

      await bulkUpsertLooseParts(
        [{ partNum: '3001', colorId: 1, quantity: 0 }],
        'merge'
      );

      expect(mockDelete).not.toHaveBeenCalled();
      expect(mockPut).not.toHaveBeenCalled();
    });

    it('does nothing when IndexedDB unavailable', async () => {
      vi.mocked(isIndexedDBAvailable).mockReturnValue(false);

      await bulkUpsertLooseParts(
        [{ partNum: '3001', colorId: 1, quantity: 5 }],
        'replace'
      );

      expect(mockTransaction).not.toHaveBeenCalled();
    });

    it('does nothing for empty array', async () => {
      await bulkUpsertLooseParts([], 'replace');

      expect(mockTransaction).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // clearAllLooseParts
  // ==========================================================================

  describe('clearAllLooseParts', () => {
    it('removes all entries', async () => {
      mockClear.mockResolvedValue(undefined);

      await clearAllLooseParts();

      expect(mockClear).toHaveBeenCalledTimes(1);
    });

    it('does nothing when IndexedDB unavailable', async () => {
      vi.mocked(isIndexedDBAvailable).mockReturnValue(false);

      await clearAllLooseParts();

      expect(mockClear).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // enqueueLoosePartChange
  // ==========================================================================

  describe('enqueueLoosePartChange', () => {
    it('creates new sync operation when none exists', async () => {
      mockSyncFilter.mockReturnValue({
        toArray: vi.fn().mockResolvedValue([]),
      });

      await enqueueLoosePartChange('user1', 'client1', '3001', 1, 5);

      expect(mockSyncQueueAdd).toHaveBeenCalledWith(
        expect.objectContaining({
          table: 'user_loose_parts',
          operation: 'upsert',
          payload: {
            part_num: '3001',
            color_id: 1,
            loose_quantity: 5,
          },
          clientId: 'client1',
          userId: 'user1',
          retryCount: 0,
          lastError: null,
        })
      );
    });

    it('creates delete operation when quantity is 0', async () => {
      mockSyncFilter.mockReturnValue({
        toArray: vi.fn().mockResolvedValue([]),
      });

      await enqueueLoosePartChange('user1', 'client1', '3001', 1, 0);

      expect(mockSyncQueueAdd).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: 'delete',
          payload: {
            part_num: '3001',
            color_id: 1,
            loose_quantity: 0,
          },
        })
      );
    });

    it('consolidates with existing pending operation', async () => {
      const existingOp = {
        id: 42,
        table: 'user_loose_parts' as const,
        operation: 'upsert' as const,
        payload: { part_num: '3001', color_id: 1, loose_quantity: 3 },
        clientId: 'client1',
        userId: 'user1',
        createdAt: 1000,
        retryCount: 0,
        lastError: null,
      };
      mockSyncFilter.mockReturnValue({
        toArray: vi.fn().mockResolvedValue([existingOp]),
      });

      await enqueueLoosePartChange('user1', 'client1', '3001', 1, 10);

      // Should update existing rather than creating new
      expect(mockSyncQueueUpdate).toHaveBeenCalledWith(42, {
        payload: {
          part_num: '3001',
          color_id: 1,
          loose_quantity: 10,
        },
        operation: 'upsert',
        userId: 'user1',
        createdAt: expect.any(Number),
        retryCount: 0,
        lastError: null,
      });
      expect(mockSyncQueueAdd).not.toHaveBeenCalled();
    });

    it('updates operation to delete when consolidating with quantity 0', async () => {
      const existingOp = {
        id: 42,
        table: 'user_loose_parts' as const,
        operation: 'upsert' as const,
        payload: { part_num: '3001', color_id: 1, loose_quantity: 5 },
        clientId: 'client1',
        userId: 'user1',
        createdAt: 1000,
        retryCount: 0,
        lastError: null,
      };
      mockSyncFilter.mockReturnValue({
        toArray: vi.fn().mockResolvedValue([existingOp]),
      });

      await enqueueLoosePartChange('user1', 'client1', '3001', 1, 0);

      expect(mockSyncQueueUpdate).toHaveBeenCalledWith(42, {
        payload: {
          part_num: '3001',
          color_id: 1,
          loose_quantity: 0,
        },
        operation: 'delete',
        userId: 'user1',
        createdAt: expect.any(Number),
        retryCount: 0,
        lastError: null,
      });
      expect(mockSyncQueueAdd).not.toHaveBeenCalled();
    });

    it('does nothing when IndexedDB unavailable', async () => {
      vi.mocked(isIndexedDBAvailable).mockReturnValue(false);

      await enqueueLoosePartChange('user1', 'client1', '3001', 1, 5);

      expect(mockSyncWhere).not.toHaveBeenCalled();
      expect(mockSyncQueueAdd).not.toHaveBeenCalled();
    });
  });
});
