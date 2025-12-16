import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock server-only before importing handlers
vi.mock('server-only', () => ({}));

// Mock minifig mapping
vi.mock('@/app/lib/minifigMapping', () => ({
  mapBrickLinkFigToRebrickable: vi.fn(),
  mapRebrickableFigToBrickLinkOnDemand: vi.fn(),
}));

// Mock rebrickable client
vi.mock('@/app/lib/rebrickable', () => ({
  getSetsForMinifig: vi.fn(),
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

// Mock Supabase
const mockMaybeSingle = vi.fn();
const mockEq = vi.fn(() => ({ maybeSingle: mockMaybeSingle }));
const mockSelect = vi.fn(() => ({ eq: mockEq }));
const mockFrom = vi.fn(() => ({ select: mockSelect }));

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
  mapBrickLinkFigToRebrickable,
  mapRebrickableFigToBrickLinkOnDemand,
} from '@/app/lib/minifigMapping';
import {
  getPart,
  getPartColorsForPart,
  getSetsForMinifig,
  getSetsForPart,
} from '@/app/lib/rebrickable';
import {
  handleMinifigIdentify,
  looksLikeBricklinkFig,
} from '../handlers/minifig';
import { handlePartIdentify } from '../handlers/part';

const mockMapBlToRb = vi.mocked(mapBrickLinkFigToRebrickable);
const mockMapRbToBl = vi.mocked(mapRebrickableFigToBrickLinkOnDemand);
const mockGetSetsForMinifig = vi.mocked(getSetsForMinifig);
const mockGetPart = vi.mocked(getPart);
const mockGetPartColors = vi.mocked(getPartColorsForPart);
const mockGetSetsForPart = vi.mocked(getSetsForPart);
const mockGetSetsForPartLocal = vi.mocked(getSetsForPartLocal);

describe('looksLikeBricklinkFig', () => {
  it('returns true for valid BrickLink minifig patterns (3 letters + 3+ digits)', () => {
    expect(looksLikeBricklinkFig('ext014')).toBe(true);
    expect(looksLikeBricklinkFig('cty1234')).toBe(true);
    expect(looksLikeBricklinkFig('ABC123')).toBe(true);
    expect(looksLikeBricklinkFig('poc001')).toBe(true);
  });

  it('returns false for non-minifig patterns', () => {
    expect(looksLikeBricklinkFig('3001')).toBe(false);
    expect(looksLikeBricklinkFig('fig-000001')).toBe(false);
    expect(looksLikeBricklinkFig('ab12')).toBe(false); // only 2 letters
    expect(looksLikeBricklinkFig('sw01')).toBe(false); // only 2 letters, 2 digits
    expect(looksLikeBricklinkFig('')).toBe(false);
  });
});

describe('handleMinifigIdentify', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
  });

  it('handles BrickLink minifig ID correctly', async () => {
    mockMapBlToRb.mockResolvedValue('fig-000001');
    mockGetSetsForMinifig.mockResolvedValue([
      {
        setNumber: '75192-1',
        name: 'Millennium Falcon',
        year: 2017,
        imageUrl: null,
        quantity: 1,
        numParts: 7541,
        themeId: 158,
        themeName: 'Star Wars',
      },
    ]);
    mockMaybeSingle.mockResolvedValue({
      data: { name: 'Han Solo' },
      error: null,
    });

    const result = await handleMinifigIdentify('sw0001');

    expect(mockMapBlToRb).toHaveBeenCalledWith('sw0001');
    expect(result.part.isMinifig).toBe(true);
    expect(result.part.rebrickableFigId).toBe('fig-000001');
    expect(result.part.bricklinkFigId).toBe('sw0001');
    expect(result.part.name).toBe('Han Solo');
    expect(result.sets).toHaveLength(1);
  });

  it('handles Rebrickable minifig ID correctly', async () => {
    mockMapBlToRb.mockResolvedValue(null);
    mockMapRbToBl.mockResolvedValue('sw0001');
    mockGetSetsForMinifig.mockResolvedValue([]);

    const result = await handleMinifigIdentify('fig:fig-000001');

    expect(result.part.rebrickableFigId).toBe('fig-000001');
    expect(result.part.bricklinkFigId).toBe('sw0001');
  });

  it('handles unmapped minifig gracefully', async () => {
    mockMapBlToRb.mockResolvedValue(null);
    mockMapRbToBl.mockRejectedValue(new Error('No mapping'));
    mockGetSetsForMinifig.mockResolvedValue([]);

    const result = await handleMinifigIdentify('fig:unknown-fig');

    expect(result.part.rebrickableFigId).toBe('unknown-fig');
    expect(result.part.bricklinkFigId).toBeNull();
  });

  it('strips fig: prefix correctly', async () => {
    mockMapBlToRb.mockResolvedValue(null);
    mockMapRbToBl.mockResolvedValue(null);
    mockGetSetsForMinifig.mockResolvedValue([]);

    const result = await handleMinifigIdentify('fig:fig-000001');

    expect(result.part.partNum).toBe('fig-000001');
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
