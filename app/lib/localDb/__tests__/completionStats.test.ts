import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock schema module before importing functions under test
const mockToArray = vi.fn();
const mockAnyOf = vi.fn(() => ({ toArray: mockToArray }));
const mockWhere = vi.fn(() => ({ anyOf: mockAnyOf }));

const mockLocalOwnedToArray = vi.fn();

const mockDb = {
  localOwned: { toArray: mockLocalOwnedToArray },
  catalogSetParts: { where: mockWhere },
};

vi.mock('../schema', () => ({
  getLocalDb: vi.fn(() => mockDb),
  isIndexedDBAvailable: vi.fn(() => true),
}));

import {
  getPartiallyCompleteSets,
  getTotalPartsForSets,
} from '../completionStats';
import { isIndexedDBAvailable } from '../schema';

describe('completionStats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isIndexedDBAvailable).mockReturnValue(true);
  });

  describe('getPartiallyCompleteSets', () => {
    it('sums quantityRequired for totalParts', async () => {
      mockLocalOwnedToArray.mockResolvedValue([
        { setNumber: '75192-1', inventoryKey: '3001:1', quantity: 3 },
      ]);

      // Two parts for the set with different quantityRequired values
      mockToArray.mockResolvedValue([
        {
          setNumber: '75192-1',
          partNum: '3001',
          inventoryKey: '3001:1',
          quantityRequired: 10,
        },
        {
          setNumber: '75192-1',
          partNum: '3002',
          inventoryKey: '3002:1',
          quantityRequired: 5,
        },
      ]);

      const result = await getPartiallyCompleteSets();

      expect(result).toEqual([
        { setNumber: '75192-1', ownedCount: 3, totalParts: 15 },
      ]);
    });

    it('excludes fig: keys from owned count', async () => {
      mockLocalOwnedToArray.mockResolvedValue([
        { setNumber: '75192-1', inventoryKey: '3001:1', quantity: 5 },
        { setNumber: '75192-1', inventoryKey: 'fig:sw0001', quantity: 1 },
      ]);

      mockToArray.mockResolvedValue([
        {
          setNumber: '75192-1',
          partNum: '3001',
          inventoryKey: '3001:1',
          quantityRequired: 10,
        },
      ]);

      const result = await getPartiallyCompleteSets();

      // ownedCount should be 5 (fig:sw0001 excluded)
      expect(result).toEqual([
        { setNumber: '75192-1', ownedCount: 5, totalParts: 10 },
      ]);
    });

    it('excludes fig: parts from totalParts', async () => {
      mockLocalOwnedToArray.mockResolvedValue([
        { setNumber: '75192-1', inventoryKey: '3001:1', quantity: 3 },
      ]);

      mockToArray.mockResolvedValue([
        {
          setNumber: '75192-1',
          partNum: '3001',
          inventoryKey: '3001:1',
          quantityRequired: 10,
        },
        {
          setNumber: '75192-1',
          partNum: 'fig:sw0001',
          inventoryKey: 'fig:sw0001',
          quantityRequired: 1,
        },
      ]);

      const result = await getPartiallyCompleteSets();

      // totalParts should be 10 (fig:sw0001 excluded)
      expect(result).toEqual([
        { setNumber: '75192-1', ownedCount: 3, totalParts: 10 },
      ]);
    });

    it('returns empty when no owned data', async () => {
      mockLocalOwnedToArray.mockResolvedValue([]);

      const result = await getPartiallyCompleteSets();

      expect(result).toEqual([]);
      // Should not even query catalogSetParts
      expect(mockWhere).not.toHaveBeenCalled();
    });

    it('returns sets without cached inventory with totalParts: 0', async () => {
      mockLocalOwnedToArray.mockResolvedValue([
        { setNumber: '75192-1', inventoryKey: '3001:1', quantity: 3 },
        { setNumber: '10295-1', inventoryKey: '3003:2', quantity: 1 },
      ]);

      // Only 75192-1 has cached inventory
      mockToArray.mockResolvedValue([
        {
          setNumber: '75192-1',
          partNum: '3001',
          inventoryKey: '3001:1',
          quantityRequired: 10,
        },
      ]);

      const result = await getPartiallyCompleteSets();

      // 75192-1 has catalog data; 10295-1 has owned data but no catalog → totalParts: 0
      expect(result).toEqual(
        expect.arrayContaining([
          { setNumber: '75192-1', ownedCount: 3, totalParts: 10 },
          { setNumber: '10295-1', ownedCount: 1, totalParts: 0 },
        ])
      );
      expect(result).toHaveLength(2);
    });

    it('caps ownedCount at quantityRequired per part', async () => {
      mockLocalOwnedToArray.mockResolvedValue([
        { setNumber: '75192-1', inventoryKey: '3001:1', quantity: 15 },
        { setNumber: '75192-1', inventoryKey: '3002:1', quantity: 3 },
      ]);

      mockToArray.mockResolvedValue([
        {
          setNumber: '75192-1',
          partNum: '3001',
          inventoryKey: '3001:1',
          quantityRequired: 10,
        },
        {
          setNumber: '75192-1',
          partNum: '3002',
          inventoryKey: '3002:1',
          quantityRequired: 5,
        },
      ]);

      const result = await getPartiallyCompleteSets();

      // 3001:1 owned 15 capped at 10; 3002:1 owned 3 not capped → total 13
      expect(result).toEqual([
        { setNumber: '75192-1', ownedCount: 13, totalParts: 15 },
      ]);
    });

    it('returns empty when IndexedDB unavailable', async () => {
      vi.mocked(isIndexedDBAvailable).mockReturnValue(false);

      const result = await getPartiallyCompleteSets();

      expect(result).toEqual([]);
    });
  });

  describe('getTotalPartsForSets', () => {
    it('returns sum of quantityRequired excluding fig: parts', async () => {
      mockToArray.mockResolvedValue([
        { setNumber: '75192-1', partNum: '3001', quantityRequired: 10 },
        { setNumber: '75192-1', partNum: '3002', quantityRequired: 5 },
        { setNumber: '75192-1', partNum: 'fig:sw0001', quantityRequired: 1 },
        { setNumber: '10295-1', partNum: '3003', quantityRequired: 20 },
      ]);

      const result = await getTotalPartsForSets(['75192-1', '10295-1']);

      expect(result.get('75192-1')).toBe(15); // 10 + 5 (fig excluded)
      expect(result.get('10295-1')).toBe(20);
    });

    it('returns empty map for empty input', async () => {
      const result = await getTotalPartsForSets([]);

      expect(result.size).toBe(0);
      expect(mockWhere).not.toHaveBeenCalled();
    });

    it('returns empty map when IndexedDB unavailable', async () => {
      vi.mocked(isIndexedDBAvailable).mockReturnValue(false);

      const result = await getTotalPartsForSets(['75192-1']);

      expect(result.size).toBe(0);
      expect(mockWhere).not.toHaveBeenCalled();
    });
  });
});
