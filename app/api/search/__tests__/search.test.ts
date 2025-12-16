import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock server-only before importing the route
vi.mock('server-only', () => ({}));

// Mock the search service
vi.mock('@/app/lib/services/search', () => ({
  searchSetsPage: vi.fn(),
}));

// Mock metrics to avoid side effects
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

import { searchSetsPage } from '@/app/lib/services/search';
import { GET } from '../route';

const mockSearchSetsPage = vi.mocked(searchSetsPage);

describe('GET /api/search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('parameter validation', () => {
    it('accepts empty query string', async () => {
      mockSearchSetsPage.mockResolvedValue({
        slice: [],
        nextPage: null,
        _debugSearch: undefined,
      });

      const req = new NextRequest('http://localhost/api/search');
      const res = await GET(req);

      expect(res.status).toBe(200);
      expect(mockSearchSetsPage).toHaveBeenCalledWith({
        query: '',
        sort: 'relevance',
        page: 1,
        pageSize: 20,
        filterType: undefined, // 'all' only when explicitly provided
        exactMatch: false,
      });
    });

    it('parses valid query parameters', async () => {
      mockSearchSetsPage.mockResolvedValue({
        slice: [],
        nextPage: 2,
        _debugSearch: undefined,
      });

      const req = new NextRequest(
        'http://localhost/api/search?q=star+wars&sort=year&page=2&pageSize=40&filter=set&exact=1'
      );
      const res = await GET(req);

      expect(res.status).toBe(200);
      expect(mockSearchSetsPage).toHaveBeenCalledWith({
        query: 'star wars',
        sort: 'year',
        page: 2,
        pageSize: 40,
        filterType: 'set',
        exactMatch: true,
      });
    });

    it('clamps pageSize to allowed values', async () => {
      mockSearchSetsPage.mockResolvedValue({
        slice: [],
        nextPage: null,
        _debugSearch: undefined,
      });

      const req = new NextRequest(
        'http://localhost/api/search?q=test&pageSize=999'
      );
      const res = await GET(req);

      expect(res.status).toBe(200);
      expect(mockSearchSetsPage).toHaveBeenCalledWith(
        expect.objectContaining({ pageSize: 20 })
      );
    });

    it('defaults invalid filter to "all"', async () => {
      mockSearchSetsPage.mockResolvedValue({
        slice: [],
        nextPage: null,
        _debugSearch: undefined,
      });

      const req = new NextRequest(
        'http://localhost/api/search?q=test&filter=invalid'
      );
      const res = await GET(req);

      expect(res.status).toBe(200);
      expect(mockSearchSetsPage).toHaveBeenCalledWith(
        expect.objectContaining({ filterType: 'all' })
      );
    });

    it('handles page as minimum 1', async () => {
      mockSearchSetsPage.mockResolvedValue({
        slice: [],
        nextPage: null,
        _debugSearch: undefined,
      });

      const req = new NextRequest('http://localhost/api/search?q=test&page=-5');
      const res = await GET(req);

      expect(res.status).toBe(200);
      expect(mockSearchSetsPage).toHaveBeenCalledWith(
        expect.objectContaining({ page: 1 })
      );
    });
  });

  describe('successful responses', () => {
    it('returns results with correct structure', async () => {
      const mockResults = [
        {
          setNumber: '75192-1',
          name: 'Millennium Falcon',
          year: 2017,
          numParts: 7541,
          imageUrl: 'https://example.com/image.jpg',
        },
      ];

      mockSearchSetsPage.mockResolvedValue({
        slice: mockResults,
        nextPage: 2,
        _debugSearch: undefined,
      });

      const req = new NextRequest(
        'http://localhost/api/search?q=millennium+falcon'
      );
      const res = await GET(req);

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.results).toEqual(mockResults);
      expect(json.nextPage).toBe(2);
    });

    it('sets no-store cache control header', async () => {
      mockSearchSetsPage.mockResolvedValue({
        slice: [],
        nextPage: null,
        _debugSearch: undefined,
      });

      const req = new NextRequest('http://localhost/api/search?q=test');
      const res = await GET(req);

      expect(res.headers.get('Cache-Control')).toBe('no-store');
    });

    it('returns null nextPage when no more results', async () => {
      mockSearchSetsPage.mockResolvedValue({
        slice: [],
        nextPage: null,
        _debugSearch: undefined,
      });

      const req = new NextRequest('http://localhost/api/search?q=test');
      const res = await GET(req);

      const json = await res.json();
      expect(json.nextPage).toBeNull();
    });
  });

  describe('error handling', () => {
    it('returns 500 when search service throws', async () => {
      mockSearchSetsPage.mockRejectedValue(
        new Error('Database connection failed')
      );

      const req = new NextRequest('http://localhost/api/search?q=test');
      const res = await GET(req);

      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.error).toBe('search_failed');
    });
  });
});
