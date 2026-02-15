import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock server-only before importing handlers
vi.mock('server-only', () => ({}));

// Mock rebrickable client
vi.mock('@/app/lib/rebrickable', () => ({
  getPart: vi.fn(),
  getPartColorsForPart: vi.fn(),
  getSetsForPart: vi.fn(),
  getSetSummary: vi.fn(),
  mapBrickLinkColorIdToRebrickableColorId: vi.fn(),
  resolvePartIdToRebrickable: vi.fn(),
}));

// Mock catalog
vi.mock('@/app/lib/catalog', () => ({
  getSetsForPartLocal: vi.fn(),
  getSetSummaryLocal: vi.fn(),
}));

// Mock BrickLink
vi.mock('@/app/lib/bricklink', () => ({
  blGetPartSupersets: vi.fn(),
}));

// Mock BL fallback (used by handlePartIdentify when no RB sets found)
vi.mock('@/app/lib/identify/blFallback', () => ({
  fetchBLSupersetsFallback: vi.fn().mockResolvedValue({
    sets: [],
    partName: '',
    partImage: null,
    blAvailableColors: [],
    source: 'bl_supersets',
  }),
}));

// Mock Supabase - updated for RB catalog queries
const mockMaybeSingle = vi.fn();
const mockNot = vi.fn(() => ({
  maybeSingle: mockMaybeSingle,
}));
const mockIn = vi.fn(() => ({
  not: mockNot,
  maybeSingle: mockMaybeSingle,
}));
const mockEq = vi.fn(() => ({
  maybeSingle: mockMaybeSingle,
  not: mockNot,
  in: mockIn,
}));
const mockSelect = vi.fn(() => ({ eq: mockEq, in: mockIn }));
const mockFrom = vi.fn(() => ({ select: mockSelect }));

vi.mock('@/app/lib/db/catalogAccess', () => ({
  getCatalogReadClient: vi.fn(() => ({
    from: mockFrom,
  })),
  getCatalogWriteClient: vi.fn(() => ({
    from: mockFrom,
  })),
}));

vi.mock('@/app/lib/supabaseServiceRoleClient', () => ({
  getSupabaseServiceRoleClient: vi.fn(() => ({
    from: mockFrom,
  })),
}));

// Mock metrics
vi.mock('@/lib/metrics', () => ({
  logEvent: vi.fn(),
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { getSetsForPartLocal } from '@/app/lib/catalog';
import {
  getPart,
  getPartColorsForPart,
  getSetsForPart,
} from '@/app/lib/rebrickable';
import {
  handleMinifigIdentify,
  looksLikeBricklinkFig,
} from '../handlers/minifig';
import { handlePartIdentify } from '../handlers/part';

const mockGetPart = vi.mocked(getPart);
const mockGetPartColors = vi.mocked(getPartColorsForPart);
const mockGetSetsForPart = vi.mocked(getSetsForPart);
const mockGetSetsForPartLocal = vi.mocked(getSetsForPartLocal);

describe('looksLikeBricklinkFig', () => {
  it('returns true for valid BrickLink minifig patterns (2-3 letters + 3+ digits)', () => {
    expect(looksLikeBricklinkFig('sw001')).toBe(true);
    expect(looksLikeBricklinkFig('cty1234')).toBe(true);
    expect(looksLikeBricklinkFig('ABC123')).toBe(true);
    expect(looksLikeBricklinkFig('poc001')).toBe(true);
  });

  it('returns false for non-minifig patterns', () => {
    expect(looksLikeBricklinkFig('3001')).toBe(false);
    expect(looksLikeBricklinkFig('fig-000001')).toBe(false);
    expect(looksLikeBricklinkFig('a12')).toBe(false); // only 1 letter
    expect(looksLikeBricklinkFig('')).toBe(false);
  });
});

describe('handleMinifigIdentify', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: rb_minifigs lookup returns null (no match)
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    // Default: inventory_minifigs returns empty
    mockIn.mockReturnValue({ not: mockNot, maybeSingle: mockMaybeSingle });
    mockNot.mockReturnValue({ maybeSingle: mockMaybeSingle });
  });

  it('handles BrickLink minifig ID correctly', async () => {
    // rb_minifigs reverse lookup returns match with fig_num + name
    mockMaybeSingle.mockResolvedValueOnce({
      data: {
        fig_num: 'fig-000001',
        name: 'Han Solo',
        bl_minifig_id: 'sw0001',
      },
      error: null,
    });

    const result = await handleMinifigIdentify('sw0001');

    expect(result.part.isMinifig).toBe(true);
    expect(result.part.bricklinkFigId).toBe('sw0001');
    expect(result.part.partNum).toBe('sw0001');
    expect(result.part.name).toBe('Han Solo');
  });

  it('returns minifig ID as-is when no name found', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });

    const result = await handleMinifigIdentify('unknown123');

    expect(result.part.bricklinkFigId).toBe('unknown123');
    expect(result.part.name).toBe('unknown123');
    expect(result.sets).toHaveLength(0);
  });

  it('strips fig: prefix correctly', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });

    const result = await handleMinifigIdentify('fig:sw0001');

    expect(result.part.bricklinkFigId).toBe('sw0001');
    expect(result.part.partNum).toBe('sw0001');
  });
});

describe('handlePartIdentify', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses local catalog first', async () => {
    const localSets = [
      {
        setNumber: '75192-1',
        name: 'Millennium Falcon',
        year: 2017,
        imageUrl: null,
        quantity: 10,
        numParts: 7541,
        themeId: 158,
        themeName: 'Star Wars',
      },
    ];

    mockGetPart.mockResolvedValue({
      part_num: '3001',
      name: '2x4 Brick',
      part_img_url: 'https://example.com/3001.png',
      external_ids: {},
    } as ReturnType<typeof getPart> extends Promise<infer T> ? T : never);

    // Multiple colors so no auto-selection happens
    mockGetPartColors.mockResolvedValue([
      {
        id: 1,
        name: 'White',
        rgb: 'FFFFFF',
        isTrans: false,
        numSets: 100,
        numSetParts: 1000,
      },
      {
        id: 4,
        name: 'Red',
        rgb: 'FF0000',
        isTrans: false,
        numSets: 80,
        numSetParts: 800,
      },
    ]);
    mockGetSetsForPartLocal.mockResolvedValue(localSets);

    const result = await handlePartIdentify('3001');

    // No color filter when multiple colors available and none specified
    expect(mockGetSetsForPartLocal).toHaveBeenCalledWith('3001', null);
    expect(mockGetSetsForPart).not.toHaveBeenCalled();
    expect(result.sets).toHaveLength(1);
    expect(result.part.name).toBe('2x4 Brick');
  });

  it('falls back to Rebrickable when local is empty', async () => {
    mockGetPart.mockResolvedValue({
      part_num: '3001',
      name: '2x4 Brick',
      part_img_url: null,
      external_ids: {},
    } as ReturnType<typeof getPart> extends Promise<infer T> ? T : never);

    mockGetPartColors.mockResolvedValue([]);
    mockGetSetsForPartLocal.mockResolvedValue([]);
    mockGetSetsForPart.mockResolvedValue([
      {
        setNumber: '10232-1',
        name: 'Palace Cinema',
        year: 2013,
        imageUrl: null,
        quantity: 5,
        numParts: null,
        themeId: null,
        themeName: null,
      },
    ]);

    const result = await handlePartIdentify('3001');

    expect(mockGetSetsForPart).toHaveBeenCalled();
    expect(result.sets).toHaveLength(1);
  });

  it('respects color filter', async () => {
    mockGetPart.mockResolvedValue({
      part_num: '3001',
      name: '2x4 Brick',
      part_img_url: null,
      external_ids: {},
    } as ReturnType<typeof getPart> extends Promise<infer T> ? T : never);

    mockGetPartColors.mockResolvedValue([
      {
        id: 1,
        name: 'White',
        rgb: 'FFFFFF',
        isTrans: false,
        numSets: 100,
        numSetParts: 1000,
      },
      {
        id: 4,
        name: 'Red',
        rgb: 'FF0000',
        isTrans: false,
        numSets: 80,
        numSetParts: 800,
      },
    ]);
    mockGetSetsForPartLocal.mockResolvedValue([]);
    mockGetSetsForPart.mockResolvedValue([]);

    const result = await handlePartIdentify('3001', { colorId: 4 });

    expect(result.selectedColorId).toBe(4);
  });

  it('auto-selects color when only one available', async () => {
    mockGetPart.mockResolvedValue({
      part_num: '3001',
      name: '2x4 Brick',
      part_img_url: null,
      external_ids: {},
    } as ReturnType<typeof getPart> extends Promise<infer T> ? T : never);

    mockGetPartColors.mockResolvedValue([
      {
        id: 15,
        name: 'White',
        rgb: 'FFFFFF',
        isTrans: false,
        numSets: 100,
        numSetParts: 1000,
      },
    ]);
    mockGetSetsForPartLocal.mockResolvedValue([]);
    mockGetSetsForPart.mockResolvedValue([]);

    const result = await handlePartIdentify('3001');

    expect(result.selectedColorId).toBe(15);
  });

  it('returns available colors', async () => {
    const colors = [
      {
        id: 1,
        name: 'White',
        rgb: 'FFFFFF',
        isTrans: false,
        numSets: 100,
        numSetParts: 1000,
      },
      {
        id: 4,
        name: 'Red',
        rgb: 'FF0000',
        isTrans: false,
        numSets: 80,
        numSetParts: 800,
      },
      {
        id: 14,
        name: 'Yellow',
        rgb: 'FFFF00',
        isTrans: false,
        numSets: 60,
        numSetParts: 600,
      },
    ];

    mockGetPart.mockResolvedValue({
      part_num: '3001',
      name: '2x4 Brick',
      part_img_url: null,
      external_ids: {},
    } as ReturnType<typeof getPart> extends Promise<infer T> ? T : never);

    mockGetPartColors.mockResolvedValue(colors);
    mockGetSetsForPartLocal.mockResolvedValue([]);
    mockGetSetsForPart.mockResolvedValue([]);

    const result = await handlePartIdentify('3001');

    expect(result.availableColors).toEqual(colors);
  });
});
