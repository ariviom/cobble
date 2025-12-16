import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock server-only before importing the route
vi.mock('server-only', () => ({}));

// Mock the themes service
vi.mock('@/app/lib/services/themes', () => ({
  fetchThemes: vi.fn(),
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

import { fetchThemes } from '@/app/lib/services/themes';
import { GET } from '../route';

const mockFetchThemes = vi.mocked(fetchThemes);

describe('GET /api/themes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('successful responses', () => {
    it('returns themes with correct structure', async () => {
      const mockThemes = [
        { id: 1, name: 'City', parentId: null },
        { id: 158, name: 'Star Wars', parentId: null },
        { id: 246, name: 'Star Wars Episode 4/5/6', parentId: 158 },
      ];

      mockFetchThemes.mockResolvedValue(mockThemes);

      const res = await GET();

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.themes).toEqual(mockThemes);
    });

    it('returns empty themes array when none exist', async () => {
      mockFetchThemes.mockResolvedValue([]);

      const res = await GET();

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.themes).toEqual([]);
    });
  });

  describe('error handling', () => {
    it('returns 500 when theme service throws', async () => {
      mockFetchThemes.mockRejectedValue(
        new Error('Database connection failed')
      );

      const res = await GET();

      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.error).toBe('external_service_error');
      expect(json.message).toBe('Failed to fetch themes');
    });
  });
});
