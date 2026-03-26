import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock server-only before importing the route
vi.mock('server-only', () => ({}));

// Mock the colorMapping module
vi.mock('@/app/lib/colors/colorMapping', () => ({
  getDbColors: vi.fn(),
}));

// Mock metrics
vi.mock('@/lib/metrics', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { getDbColors } from '@/app/lib/colors/colorMapping';
import { GET } from '../route';

const mockGetDbColors = vi.mocked(getDbColors);

describe('GET /api/colors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('successful responses', () => {
    it('returns colors with id and name only', async () => {
      const colors = [
        { id: 1, name: 'White' },
        { id: 4, name: 'Red' },
        { id: 15, name: 'Trans-Clear' },
      ];

      mockGetDbColors.mockResolvedValue(colors);

      const res = await GET();

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.colors).toEqual([
        { id: 1, name: 'White' },
        { id: 4, name: 'Red' },
        { id: 15, name: 'Trans-Clear' },
      ]);
    });

    it('returns empty array when no colors', async () => {
      mockGetDbColors.mockResolvedValue([]);

      const res = await GET();

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.colors).toEqual([]);
    });
  });

  describe('error handling', () => {
    it('returns 502 when color fetch fails', async () => {
      mockGetDbColors.mockRejectedValue(new Error('DB error'));

      const res = await GET();

      expect(res.status).toBe(502);
      const json = await res.json();
      expect(json.error).toBe('external_service_error');
      expect(json.message).toBe('Failed to fetch colors');
    });
  });
});
