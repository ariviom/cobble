import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock server-only before importing the route
vi.mock('server-only', () => ({}));

// Mock the inventory service
vi.mock('@/app/lib/services/inventory', () => ({
  getSetInventoriesBatchWithMeta: vi.fn(),
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

// Mock rate limiting
vi.mock('@/lib/rateLimit', () => ({
  consumeRateLimit: vi.fn(() => ({ allowed: true, retryAfterSeconds: 0 })),
  getClientIp: vi.fn(() => '127.0.0.1'),
}));

import { getSetInventoriesBatchWithMeta } from '@/app/lib/services/inventory';
import { NextRequest } from 'next/server';
import { POST } from '../route';
import { _resetVersionCache } from '../../versionCache';

const mockBatchFetch = vi.mocked(getSetInventoriesBatchWithMeta);

const createRequest = (body: unknown) =>
  new NextRequest('http://localhost/api/inventory/batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

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

describe('POST /api/inventory/batch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetVersionCache();
    mockMaybeSingle.mockResolvedValue({
      data: { version: '2024-01-15' },
      error: null,
    });
  });

  describe('parameter validation', () => {
    it('returns 400 when body missing sets', async () => {
      const req = createRequest({});
      const res = await POST(req);

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe('validation_failed');
    });

    it('returns 400 when sets is empty array', async () => {
      const req = createRequest({ sets: [] });
      const res = await POST(req);

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe('validation_failed');
    });

    it('returns 400 when sets exceeds 50', async () => {
      const sets = Array.from({ length: 51 }, (_, i) => `set-${i}`);
      const req = createRequest({ sets });
      const res = await POST(req);

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe('validation_failed');
    });

    it('returns 400 when sets contains empty strings', async () => {
      const req = createRequest({ sets: [''] });
      const res = await POST(req);

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe('validation_failed');
    });
  });

  describe('successful responses', () => {
    it('returns inventories keyed by set number with inventoryVersion', async () => {
      const mockRows = [createMockRow()];
      const resultsMap = new Map([['75192-1', { rows: mockRows }]]);
      mockBatchFetch.mockResolvedValue(resultsMap);

      const req = createRequest({ sets: ['75192-1'] });
      const res = await POST(req);

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.inventories['75192-1'].rows).toEqual(mockRows);
      expect(json.inventoryVersion).toBe('2024-01-15');
      expect(json.partial).toBe(false);
    });

    it('sets partial=true when some sets missing from results', async () => {
      const mockRows = [createMockRow()];
      const resultsMap = new Map([['75192-1', { rows: mockRows }]]);
      mockBatchFetch.mockResolvedValue(resultsMap);

      const req = createRequest({ sets: ['75192-1', '10300-1'] });
      const res = await POST(req);

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.partial).toBe(true);
      expect(json.inventories['75192-1'].rows).toEqual(mockRows);
      expect(json.inventories['10300-1']).toBeUndefined();
    });

    it('includes meta when includeMeta=true', async () => {
      const mockMeta = { totalMinifigs: 6 };
      const resultsMap = new Map([
        ['75192-1', { rows: [], minifigMeta: mockMeta }],
      ]);
      mockBatchFetch.mockResolvedValue(resultsMap);

      const req = createRequest({ sets: ['75192-1'], includeMeta: true });
      const res = await POST(req);

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.inventories['75192-1'].meta).toEqual(mockMeta);
    });

    it('excludes meta when includeMeta is not set', async () => {
      const mockMeta = { totalMinifigs: 6 };
      const resultsMap = new Map([
        ['75192-1', { rows: [], minifigMeta: mockMeta }],
      ]);
      mockBatchFetch.mockResolvedValue(resultsMap);

      const req = createRequest({ sets: ['75192-1'] });
      const res = await POST(req);

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.inventories['75192-1'].meta).toBeUndefined();
    });

    it('sets cache control headers', async () => {
      const resultsMap = new Map([['75192-1', { rows: [] }]]);
      mockBatchFetch.mockResolvedValue(resultsMap);

      const req = createRequest({ sets: ['75192-1'] });
      const res = await POST(req);

      expect(res.headers.get('Cache-Control')).toBe('private, max-age=300');
    });
  });

  describe('error handling', () => {
    it('returns 500 when batch service throws', async () => {
      mockBatchFetch.mockRejectedValue(new Error('Database error'));

      const req = createRequest({ sets: ['75192-1'] });
      const res = await POST(req);

      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.error).toBe('inventory_batch_failed');
    });
  });
});
