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
import { GET } from '../route';

const mockGetSetInventory = vi.mocked(getSetInventoryRowsWithMeta);

describe('GET /api/inventory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
        minifigMappingMeta: undefined,
        minifigEnrichmentNeeded: undefined,
        spares: undefined,
      });

      const req = new NextRequest('http://localhost/api/inventory?set=75192-1');
      const res = await GET(req);

      expect(res.status).toBe(200);
      expect(mockGetSetInventory).toHaveBeenCalledWith('75192-1');
    });
  });

  describe('successful responses', () => {
    it('returns inventory rows with version', async () => {
      const mockRows = [
        {
          partNum: '3001',
          name: '2x4 Brick',
          quantity: 10,
          colorId: 1,
          colorName: 'White',
        },
      ];

      mockGetSetInventory.mockResolvedValue({
        rows: mockRows,
        minifigMappingMeta: undefined,
        minifigEnrichmentNeeded: undefined,
        spares: undefined,
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
        mappedCount: 5,
        unmappedCount: 1,
        syncTriggered: false,
      };

      mockGetSetInventory.mockResolvedValue({
        rows: [],
        minifigMappingMeta: mockMeta,
        minifigEnrichmentNeeded: undefined,
        spares: undefined,
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
        minifigMappingMeta: {
          mappedCount: 5,
          unmappedCount: 1,
          syncTriggered: false,
        },
        minifigEnrichmentNeeded: undefined,
        spares: undefined,
      });

      const req = new NextRequest(
        'http://localhost/api/inventory?set=75192-1&includeMeta=false'
      );
      const res = await GET(req);

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.meta).toBeUndefined();
    });

    it('includes spares when available', async () => {
      const mockSpares = [{ partNum: '3003', quantity: 2, colorId: 1 }];

      mockGetSetInventory.mockResolvedValue({
        rows: [],
        minifigMappingMeta: undefined,
        minifigEnrichmentNeeded: undefined,
        spares: mockSpares,
      });

      const req = new NextRequest('http://localhost/api/inventory?set=75192-1');
      const res = await GET(req);

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.spares).toEqual(mockSpares);
    });

    it('sets cache control headers', async () => {
      mockGetSetInventory.mockResolvedValue({
        rows: [],
        minifigMappingMeta: undefined,
        minifigEnrichmentNeeded: undefined,
        spares: undefined,
      });

      const req = new NextRequest('http://localhost/api/inventory?set=75192-1');
      const res = await GET(req);

      expect(res.headers.get('Cache-Control')).toBe(
        'public, max-age=300, stale-while-revalidate=3600'
      );
    });

    it('handles null inventory version gracefully', async () => {
      mockMaybeSingle.mockResolvedValue({ data: null, error: null });
      mockGetSetInventory.mockResolvedValue({
        rows: [],
        minifigMappingMeta: undefined,
        minifigEnrichmentNeeded: undefined,
        spares: undefined,
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
