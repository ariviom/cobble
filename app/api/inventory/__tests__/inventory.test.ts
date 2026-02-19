import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock server-only before importing the route
vi.mock('server-only', () => ({}));

// Mock the inventory service
vi.mock('@/app/lib/services/inventory', () => ({
  getSetInventoryRowsWithMeta: vi.fn(),
}));

// Mock catalog access for version check
const mockMaybeSingle = vi.fn();
const mockEq = vi.fn(() => ({ maybeSingle: mockMaybeSingle }));
const mockSelect = vi.fn(() => ({ eq: mockEq }));
const mockFrom = vi.fn(() => ({ select: mockSelect }));

vi.mock('@/app/lib/db/catalogAccess', () => ({
  getCatalogReadClient: vi.fn(() => ({
    from: mockFrom,
  })),
}));

// Mock metrics
vi.mock('@/lib/metrics', () => ({
  incrementCounter: vi.fn(),
  logEvent: vi.fn(),
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { getSetInventoryRowsWithMeta } from '@/app/lib/services/inventory';
import { GET, _resetVersionCache } from '../route';

const mockGetSetInventory = vi.mocked(getSetInventoryRowsWithMeta);

// Helper to create minimal valid InventoryRow
const createMockRow = (overrides = {}) => ({
  setNumber: '75192-1',
  partId: '3001',
  partName: '2x4 Brick',
  colorId: 1,
  colorName: 'White',
  quantityRequired: 10,
  imageUrl: null,
  inventoryKey: '3001:1',
  ...overrides,
});

describe('GET /api/inventory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetVersionCache();
    mockMaybeSingle.mockResolvedValue({
      data: { version: '2024-01-15' },
      error: null,
    });
  });

  describe('parameter validation', () => {
    it('returns 400 when set parameter is missing', async () => {
      const req = new NextRequest('http://localhost/api/inventory');
      const res = await GET(req);

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe('validation_failed');
    });

    it('returns 400 when set parameter is empty', async () => {
      const req = new NextRequest('http://localhost/api/inventory?set=');
      const res = await GET(req);

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe('validation_failed');
    });

    it('returns 400 when set parameter is too long', async () => {
      const longSet = 'a'.repeat(201);
      const req = new NextRequest(
        `http://localhost/api/inventory?set=${longSet}`
      );
      const res = await GET(req);

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe('validation_failed');
    });

    it('accepts valid set numbers', async () => {
      mockGetSetInventory.mockResolvedValue({
        rows: [],
      });

      const req = new NextRequest('http://localhost/api/inventory?set=75192-1');
      const res = await GET(req);

      expect(res.status).toBe(200);
      expect(mockGetSetInventory).toHaveBeenCalledWith('75192-1');
    });
  });

  describe('successful responses', () => {
    it('returns inventory rows with version', async () => {
      const mockRows = [createMockRow()];

      mockGetSetInventory.mockResolvedValue({
        rows: mockRows,
      });

      const req = new NextRequest('http://localhost/api/inventory?set=75192-1');
      const res = await GET(req);

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.rows).toEqual(mockRows);
      expect(json.inventoryVersion).toBe('2024-01-15');
    });

    it('includes meta when includeMeta=true', async () => {
      const mockMeta = {
        totalMinifigs: 6,
      };

      mockGetSetInventory.mockResolvedValue({
        rows: [],
        minifigMeta: mockMeta,
      });

      const req = new NextRequest(
        'http://localhost/api/inventory?set=75192-1&includeMeta=true'
      );
      const res = await GET(req);

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.meta).toEqual(mockMeta);
    });

    it('excludes meta when includeMeta=false', async () => {
      mockGetSetInventory.mockResolvedValue({
        rows: [],
        minifigMeta: {
          totalMinifigs: 6,
        },
      });

      const req = new NextRequest(
        'http://localhost/api/inventory?set=75192-1&includeMeta=false'
      );
      const res = await GET(req);

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.meta).toBeUndefined();
    });

    it('does not include minifigEnrichmentNeeded in response', async () => {
      mockGetSetInventory.mockResolvedValue({
        rows: [createMockRow()],
        minifigMeta: {
          totalMinifigs: 2,
        },
      });

      const req = new NextRequest('http://localhost/api/inventory?set=75192-1');
      const res = await GET(req);

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.minifigEnrichmentNeeded).toBeUndefined();
    });

    it('sets cache control headers', async () => {
      mockGetSetInventory.mockResolvedValue({
        rows: [],
      });

      const req = new NextRequest('http://localhost/api/inventory?set=75192-1');
      const res = await GET(req);

      expect(res.headers.get('Cache-Control')).toBe('private, max-age=300');
    });

    it('handles null inventory version gracefully', async () => {
      mockMaybeSingle.mockResolvedValue({ data: null, error: null });
      mockGetSetInventory.mockResolvedValue({
        rows: [],
      });

      const req = new NextRequest('http://localhost/api/inventory?set=75192-1');
      const res = await GET(req);

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.inventoryVersion).toBeNull();
    });
  });

  describe('error handling', () => {
    it('returns 500 when inventory service throws', async () => {
      mockGetSetInventory.mockRejectedValue(new Error('Database error'));

      const req = new NextRequest('http://localhost/api/inventory?set=75192-1');
      const res = await GET(req);

      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.error).toBe('inventory_failed');
    });
  });
});
