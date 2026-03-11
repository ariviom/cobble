// app/components/collection/parts/__tests__/sorting.test.ts

import type { CollectionPart } from '../types';
import {
  filterBySource,
  filterByCriteria,
  sortParts,
  groupParts,
  paginateParts,
  extractCategoryOptions,
} from '../sorting';

function makePart(overrides: Partial<CollectionPart>): CollectionPart {
  return {
    partNum: '3001',
    colorId: 5,
    canonicalKey: '3001:5',
    partName: 'Brick 2x4',
    colorName: 'Red',
    imageUrl: null,
    parentCategory: 'Brick',
    elementId: null,
    setCount: null,
    ownedFromSets: 0,
    looseQuantity: 0,
    totalOwned: 0,
    setSources: [],
    missingFromSets: [],
    ...overrides,
  };
}

describe('filterBySource', () => {
  const parts = [
    makePart({
      canonicalKey: 'a',
      ownedFromSets: 5,
      looseQuantity: 0,
      totalOwned: 5,
    }),
    makePart({
      canonicalKey: 'b',
      ownedFromSets: 0,
      looseQuantity: 3,
      totalOwned: 3,
    }),
    makePart({
      canonicalKey: 'c',
      ownedFromSets: 2,
      looseQuantity: 1,
      totalOwned: 3,
      missingFromSets: [
        {
          setNumber: 's1',
          setName: 'S1',
          quantityMissing: 2,
          quantityRequired: 4,
        },
      ],
    }),
  ];

  it('returns all for "all"', () => {
    expect(filterBySource(parts, 'all')).toHaveLength(3);
  });

  it('filters to owned-from-sets only', () => {
    const result = filterBySource(parts, 'owned');
    expect(result.map(p => p.canonicalKey)).toEqual(['a', 'c']);
  });

  it('filters to loose only', () => {
    const result = filterBySource(parts, 'loose');
    expect(result.map(p => p.canonicalKey)).toEqual(['b', 'c']);
  });

  it('filters to missing only', () => {
    const result = filterBySource(parts, 'missing');
    expect(result.map(p => p.canonicalKey)).toEqual(['c']);
  });
});

describe('sortParts', () => {
  it('sorts by name ascending', () => {
    const parts = [
      makePart({ partName: 'Plate 1x2' }),
      makePart({ partName: 'Brick 2x4' }),
    ];
    const sorted = sortParts(parts, 'name', 'asc');
    expect(sorted[0].partName).toBe('Brick 2x4');
    expect(sorted[1].partName).toBe('Plate 1x2');
  });

  it('sorts by quantity descending', () => {
    const parts = [makePart({ totalOwned: 3 }), makePart({ totalOwned: 10 })];
    const sorted = sortParts(parts, 'quantity', 'desc');
    expect(sorted[0].totalOwned).toBe(10);
  });
});

describe('paginateParts', () => {
  const items = Array.from({ length: 250 }, (_, i) => i);

  it('returns correct slice for page 1', () => {
    const {
      items: page,
      totalPages,
      currentPage,
    } = paginateParts(items, 1, 100);
    expect(page).toHaveLength(100);
    expect(page[0]).toBe(0);
    expect(totalPages).toBe(3);
    expect(currentPage).toBe(1);
  });

  it('returns partial last page', () => {
    const { items: page } = paginateParts(items, 3, 100);
    expect(page).toHaveLength(50);
  });

  it('clamps out-of-range page numbers', () => {
    const { currentPage } = paginateParts(items, 99, 100);
    expect(currentPage).toBe(3);
  });
});

describe('groupParts', () => {
  it('returns null for groupBy none', () => {
    expect(groupParts([], 'none')).toBeNull();
  });

  it('groups by color', () => {
    const parts = [
      makePart({ colorName: 'Red' }),
      makePart({ colorName: 'Blue' }),
      makePart({ colorName: 'Red' }),
    ];
    const groups = groupParts(parts, 'color')!;
    expect(groups.get('Red')).toHaveLength(2);
    expect(groups.get('Blue')).toHaveLength(1);
  });
});

describe('extractCategoryOptions', () => {
  it('returns sorted unique categories', () => {
    const parts = [
      makePart({ parentCategory: 'Plate' }),
      makePart({ parentCategory: 'Brick' }),
      makePart({ parentCategory: 'Plate' }),
    ];
    expect(extractCategoryOptions(parts)).toEqual(['Brick', 'Plate']);
  });
});

describe('filterByCriteria', () => {
  it('returns all parts when no categories or colors are specified', () => {
    const parts = [
      makePart({ parentCategory: 'Brick' }),
      makePart({ parentCategory: 'Plate' }),
    ];
    expect(
      filterByCriteria(parts, { source: 'all', categories: [], colors: [] })
    ).toHaveLength(2);
  });

  it('filters by category', () => {
    const parts = [
      makePart({ canonicalKey: 'a', parentCategory: 'Brick' }),
      makePart({ canonicalKey: 'b', parentCategory: 'Plate' }),
    ];
    const result = filterByCriteria(parts, {
      source: 'all',
      categories: ['Brick'],
      colors: [],
    });
    expect(result.map(p => p.canonicalKey)).toEqual(['a']);
  });

  it('filters by color', () => {
    const parts = [
      makePart({ canonicalKey: 'a', colorId: 5 }),
      makePart({ canonicalKey: 'b', colorId: 11 }),
    ];
    const result = filterByCriteria(parts, {
      source: 'all',
      categories: [],
      colors: ['5'],
    });
    expect(result.map(p => p.canonicalKey)).toEqual(['a']);
  });
});
