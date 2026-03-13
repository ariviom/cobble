import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGet = vi.fn();
const mockPut = vi.fn();
const mockBulkPut = vi.fn();

vi.mock('../schema', () => ({
  getLocalDb: vi.fn(() => ({
    syncWatermarks: {
      get: mockGet,
      put: mockPut,
      bulkPut: mockBulkPut,
    },
  })),
  isIndexedDBAvailable: vi.fn(() => true),
}));

describe('watermarkStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getWatermark', () => {
    it('returns 0 when no watermark exists', async () => {
      mockGet.mockResolvedValue(undefined);
      const { getWatermark } = await import('../watermarkStore');
      const result = await getWatermark('user-1', '75192-1');
      expect(result).toBe(0);
      expect(mockGet).toHaveBeenCalledWith(['user-1', '75192-1']);
    });

    it('returns stored watermark value', async () => {
      mockGet.mockResolvedValue({
        userId: 'user-1',
        setNumber: '75192-1',
        lastSyncVersion: 42,
      });
      const { getWatermark } = await import('../watermarkStore');
      const result = await getWatermark('user-1', '75192-1');
      expect(result).toBe(42);
    });
  });

  describe('setWatermark', () => {
    it('stores the watermark', async () => {
      mockPut.mockResolvedValue(undefined);
      const { setWatermark } = await import('../watermarkStore');
      await setWatermark('user-1', '75192-1', 42);
      expect(mockPut).toHaveBeenCalledWith({
        userId: 'user-1',
        setNumber: '75192-1',
        lastSyncVersion: 42,
      });
    });
  });

  describe('updateWatermarks', () => {
    it('bulk updates multiple watermarks', async () => {
      mockBulkPut.mockResolvedValue(undefined);
      const { updateWatermarks } = await import('../watermarkStore');
      await updateWatermarks('user-1', {
        '75192-1': 42,
        '10294-1': 99,
      });
      expect(mockBulkPut).toHaveBeenCalledWith([
        { userId: 'user-1', setNumber: '75192-1', lastSyncVersion: 42 },
        { userId: 'user-1', setNumber: '10294-1', lastSyncVersion: 99 },
      ]);
    });

    it('does nothing for empty versions map', async () => {
      const { updateWatermarks } = await import('../watermarkStore');
      await updateWatermarks('user-1', {});
      expect(mockBulkPut).not.toHaveBeenCalled();
    });
  });
});
