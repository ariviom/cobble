import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

vi.mock('@/app/lib/services/searchParts', () => ({
  searchPartsPage: vi.fn(),
}));

vi.mock('@/lib/rateLimit', () => ({
  consumeRateLimit: vi
    .fn()
    .mockResolvedValue({ allowed: true, retryAfterSeconds: 0 }),
  getClientIp: vi.fn().mockResolvedValue('127.0.0.1'),
}));

vi.mock('@/lib/metrics', () => ({
  incrementCounter: vi.fn(),
  logEvent: vi.fn(),
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { searchPartsPage } from '@/app/lib/services/searchParts';
import { GET } from '../route';

const mockSearchPartsPage = vi.mocked(searchPartsPage);

describe('GET /api/search/parts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty results for empty query', async () => {
    mockSearchPartsPage.mockResolvedValue({ results: [], nextPage: null });

    const req = new NextRequest('http://localhost/api/search/parts');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.results).toEqual([]);
  });

  it('passes query and pagination params to service', async () => {
    mockSearchPartsPage.mockResolvedValue({ results: [], nextPage: null });

    const req = new NextRequest(
      'http://localhost/api/search/parts?q=brick+1x2&page=2&pageSize=50'
    );
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(mockSearchPartsPage).toHaveBeenCalledWith({
      query: 'brick 1x2',
      page: 2,
      pageSize: 50,
    });
  });

  it('clamps invalid pageSize to 20', async () => {
    mockSearchPartsPage.mockResolvedValue({ results: [], nextPage: null });

    const req = new NextRequest(
      'http://localhost/api/search/parts?q=test&pageSize=999'
    );
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(mockSearchPartsPage).toHaveBeenCalledWith(
      expect.objectContaining({ pageSize: 20 })
    );
  });

  it('returns 500 when service throws', async () => {
    mockSearchPartsPage.mockRejectedValue(new Error('DB error'));

    const req = new NextRequest('http://localhost/api/search/parts?q=test');
    const res = await GET(req);

    expect(res.status).toBe(500);
  });

  it('sets cache control header', async () => {
    mockSearchPartsPage.mockResolvedValue({ results: [], nextPage: null });

    const req = new NextRequest('http://localhost/api/search/parts?q=test');
    const res = await GET(req);

    expect(res.headers.get('Cache-Control')).toBe(
      'public, s-maxage=30, max-age=60'
    );
  });
});
