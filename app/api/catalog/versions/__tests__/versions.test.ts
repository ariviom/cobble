import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock server-only before importing the route
vi.mock('server-only', () => ({}));

// Mock the catalog access
const mockSelect = vi.fn();
const mockIn = vi.fn();
const mockFrom = vi.fn(() => ({ select: mockSelect }));

vi.mock('@/app/lib/db/catalogAccess', () => ({
  getCatalogReadClient: vi.fn(() => ({
    from: mockFrom,
  })),
}));

import { GET } from '../route';

describe('GET /api/catalog/versions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelect.mockReturnValue({ in: mockIn });
  });

  describe('parameter validation', () => {
    it('returns all sources when none specified', async () => {
      mockIn.mockResolvedValue({
        data: [
          { source: 'themes', version: '2024-01-15' },
          { source: 'sets', version: '2024-01-15' },
        ],
        error: null,
      });

      const req = new NextRequest('http://localhost/api/catalog/versions');
      const res = await GET(req);

      expect(res.status).toBe(200);
      expect(mockIn).toHaveBeenCalledWith('source', [
        'themes',
        'colors',
        'part_categories',
        'parts',
        'sets',
        'minifigs',
        'inventories',
        'inventory_parts',
        'inventory_minifigs',
      ]);
    });

    it('filters to specified sources', async () => {
      mockIn.mockResolvedValue({
        data: [{ source: 'themes', version: '2024-01-15' }],
        error: null,
      });

      const req = new NextRequest(
        'http://localhost/api/catalog/versions?sources=themes,sets'
      );
      const res = await GET(req);

      expect(res.status).toBe(200);
      expect(mockIn).toHaveBeenCalledWith('source', ['themes', 'sets']);
    });

    it('handles empty sources list', async () => {
      mockIn.mockResolvedValue({
        data: [],
        error: null,
      });

      const req = new NextRequest(
        'http://localhost/api/catalog/versions?sources='
      );
      const res = await GET(req);

      expect(res.status).toBe(200);
      // Empty string should result in default sources
      expect(mockIn).toHaveBeenCalledWith('source', expect.any(Array));
    });
  });

  describe('successful responses', () => {
    it('returns version map with correct structure', async () => {
      mockIn.mockResolvedValue({
        data: [
          { source: 'themes', version: '2024-01-15' },
          { source: 'sets', version: '2024-01-16' },
          { source: 'colors', version: '' },
        ],
        error: null,
      });

      const req = new NextRequest(
        'http://localhost/api/catalog/versions?sources=themes,sets,colors'
      );
      const res = await GET(req);

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.versions).toEqual({
        themes: '2024-01-15',
        sets: '2024-01-16',
        colors: null, // empty string becomes null
      });
    });

    it('handles null data gracefully', async () => {
      mockIn.mockResolvedValue({
        data: null,
        error: null,
      });

      const req = new NextRequest('http://localhost/api/catalog/versions');
      const res = await GET(req);

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.versions).toEqual({});
    });
  });

  describe('error handling', () => {
    it('returns 500 when database query fails', async () => {
      mockIn.mockResolvedValue({
        data: null,
        error: { message: 'Connection timeout' },
      });

      const req = new NextRequest('http://localhost/api/catalog/versions');
      const res = await GET(req);

      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.error).toBe('catalog_version_failed');
    });

    it('returns 500 when unexpected error occurs', async () => {
      mockIn.mockRejectedValue(new Error('Unexpected failure'));

      const req = new NextRequest('http://localhost/api/catalog/versions');
      const res = await GET(req);

      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.error).toBe('catalog_version_failed');
    });
  });
});
