import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock server-only before importing the route
vi.mock('server-only', () => ({}));

// Mock the rebrickable module
vi.mock('@/app/lib/rebrickable', () => ({
  getColors: vi.fn(),
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

import { getColors } from '@/app/lib/rebrickable';
import { GET } from '../route';

const mockGetColors = vi.mocked(getColors);

describe('GET /api/colors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('successful responses', () => {
    it('returns colors with id and name only', async () => {
      const fullColors = [
        { id: 1, name: 'White', rgb: 'FFFFFF', isTrans: false },
        { id: 4, name: 'Red', rgb: 'CC0000', isTrans: false },
        { id: 15, name: 'Trans-Clear', rgb: 'FFFFFF', isTrans: true },
      ];

      mockGetColors.mockResolvedValue(fullColors);

      const res = await GET();

      expect(res.status).toBe(200);
      const json = await res.json();
      // Should only include id and name, not rgb or isTrans
      expect(json.colors).toEqual([
        { id: 1, name: 'White' },
        { id: 4, name: 'Red' },
        { id: 15, name: 'Trans-Clear' },
      ]);
    });

    it('returns empty array when no colors', async () => {
      mockGetColors.mockResolvedValue([]);

      const res = await GET();

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.colors).toEqual([]);
    });
  });

  describe('error handling', () => {
    it('returns 500 when color fetch fails', async () => {
      mockGetColors.mockRejectedValue(new Error('Rebrickable API error'));

      const res = await GET();

      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.error).toBe('external_service_error');
      expect(json.message).toBe('Failed to fetch colors');
    });
  });
});
