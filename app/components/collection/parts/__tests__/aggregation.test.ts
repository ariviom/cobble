// app/components/collection/parts/__tests__/aggregation.test.ts

import type {
  CatalogPart,
  CatalogSetPart,
  LocalLoosePart,
} from '@/app/lib/localDb/schema';
import { aggregateOwnedParts, computeMissingParts } from '../aggregation';

function makeCatalogSetPart(
  overrides: Partial<CatalogSetPart> &
    Pick<
      CatalogSetPart,
      'setNumber' | 'partNum' | 'colorId' | 'inventoryKey' | 'quantityRequired'
    >
): CatalogSetPart {
  return {
    colorName: 'Red',
    imageUrl: null,
    elementId: null,
    setCount: null,
    ...overrides,
  };
}

function makePartMeta(
  partNum: string,
  name: string,
  parentCategory: string | null = 'Brick'
): CatalogPart {
  return {
    partNum,
    name,
    imageUrl: null,
    categoryId: null,
    categoryName: null,
    parentCategory,
    bricklinkPartId: null,
    cachedAt: Date.now(),
  };
}

const defaultPartMeta = new Map<string, CatalogPart>([
  ['3001', makePartMeta('3001', 'Brick 2x4')],
  ['3002', makePartMeta('3002', 'Brick 2x3')],
  ['99999', makePartMeta('99999', 'Mystery Part')],
]);

describe('aggregateOwnedParts', () => {
  it('aggregates parts across multiple sets', () => {
    const catalog = new Map([
      [
        'set-1',
        [
          makeCatalogSetPart({
            setNumber: 'set-1',
            partNum: '3001',
            colorId: 5,
            inventoryKey: '3001:5',
            quantityRequired: 4,
          }),
        ],
      ],
      [
        'set-2',
        [
          makeCatalogSetPart({
            setNumber: 'set-2',
            partNum: '3001',
            colorId: 5,
            inventoryKey: '3001:5',
            quantityRequired: 2,
          }),
        ],
      ],
    ]);
    const ownedData = [
      { setNumber: 'set-1', setName: 'Set One', ownedByKey: { '3001:5': 3 } },
      { setNumber: 'set-2', setName: 'Set Two', ownedByKey: { '3001:5': 2 } },
    ];
    const result = aggregateOwnedParts(catalog, ownedData, [], defaultPartMeta);
    expect(result).toHaveLength(1);
    expect(result[0].canonicalKey).toBe('3001:5');
    expect(result[0].ownedFromSets).toBe(5);
    expect(result[0].partName).toBe('Brick 2x4');
    expect(result[0].setSources).toHaveLength(2);
  });

  it('excludes minifig parent rows (fig: prefix)', () => {
    const catalog = new Map([
      [
        'set-1',
        [
          makeCatalogSetPart({
            setNumber: 'set-1',
            partNum: 'fig:sw0001',
            colorId: 0,
            inventoryKey: 'fig:sw0001',
            quantityRequired: 1,
          }),
          makeCatalogSetPart({
            setNumber: 'set-1',
            partNum: '3001',
            colorId: 5,
            inventoryKey: '3001:5',
            quantityRequired: 2,
          }),
        ],
      ],
    ]);
    const ownedData = [
      {
        setNumber: 'set-1',
        setName: 'Set One',
        ownedByKey: { 'fig:sw0001': 1, '3001:5': 2 },
      },
    ];
    const result = aggregateOwnedParts(catalog, ownedData, [], defaultPartMeta);
    expect(result).toHaveLength(1);
    expect(result[0].partNum).toBe('3001');
  });

  it('excludes unmatched BL subparts (bl: prefix)', () => {
    const catalog = new Map([
      [
        'set-1',
        [
          makeCatalogSetPart({
            setNumber: 'set-1',
            partNum: 'bl:12345',
            colorId: 11,
            inventoryKey: 'bl:12345:11',
            quantityRequired: 1,
          }),
          makeCatalogSetPart({
            setNumber: 'set-1',
            partNum: '3001',
            colorId: 5,
            inventoryKey: '3001:5',
            quantityRequired: 2,
          }),
        ],
      ],
    ]);
    const ownedData = [
      { setNumber: 'set-1', setName: 'Set One', ownedByKey: { '3001:5': 1 } },
    ];
    const result = aggregateOwnedParts(catalog, ownedData, [], defaultPartMeta);
    expect(result).toHaveLength(1);
    expect(result[0].partNum).toBe('3001');
  });

  it('merges loose parts with set-sourced parts', () => {
    const catalog = new Map([
      [
        'set-1',
        [
          makeCatalogSetPart({
            setNumber: 'set-1',
            partNum: '3001',
            colorId: 5,
            inventoryKey: '3001:5',
            quantityRequired: 4,
          }),
        ],
      ],
    ]);
    const ownedData = [
      { setNumber: 'set-1', setName: 'Set One', ownedByKey: { '3001:5': 3 } },
    ];
    const looseParts: LocalLoosePart[] = [
      { partNum: '3001', colorId: 5, quantity: 7, updatedAt: Date.now() },
    ];
    const result = aggregateOwnedParts(
      catalog,
      ownedData,
      looseParts,
      defaultPartMeta
    );
    expect(result).toHaveLength(1);
    expect(result[0].ownedFromSets).toBe(3);
    expect(result[0].looseQuantity).toBe(7);
    expect(result[0].totalOwned).toBe(10);
  });

  it('includes loose-only parts not in any set', () => {
    const looseParts: LocalLoosePart[] = [
      { partNum: '99999', colorId: 1, quantity: 5, updatedAt: Date.now() },
    ];
    const result = aggregateOwnedParts(
      new Map(),
      [],
      looseParts,
      defaultPartMeta
    );
    expect(result).toHaveLength(1);
    expect(result[0].partNum).toBe('99999');
    expect(result[0].partName).toBe('Mystery Part');
    expect(result[0].looseQuantity).toBe(5);
    expect(result[0].ownedFromSets).toBe(0);
  });

  it('returns empty array when no data', () => {
    const result = aggregateOwnedParts(new Map(), [], [], new Map());
    expect(result).toEqual([]);
  });
});

describe('computeMissingParts', () => {
  it('computes missing quantities per set', () => {
    const catalog = new Map([
      [
        'set-1',
        [
          makeCatalogSetPart({
            setNumber: 'set-1',
            partNum: '3001',
            colorId: 5,
            inventoryKey: '3001:5',
            quantityRequired: 4,
          }),
          makeCatalogSetPart({
            setNumber: 'set-1',
            partNum: '3002',
            colorId: 5,
            inventoryKey: '3002:5',
            quantityRequired: 2,
          }),
        ],
      ],
    ]);
    const ownedData = [
      {
        setNumber: 'set-1',
        setName: 'Set One',
        ownedByKey: { '3001:5': 1, '3002:5': 2 },
      },
    ];
    const result = computeMissingParts(catalog, ownedData, defaultPartMeta);
    expect(result).toHaveLength(1);
    expect(result[0].canonicalKey).toBe('3001:5');
    expect(result[0].missingFromSets[0].quantityMissing).toBe(3);
  });

  it('excludes fully-owned parts', () => {
    const catalog = new Map([
      [
        'set-1',
        [
          makeCatalogSetPart({
            setNumber: 'set-1',
            partNum: '3001',
            colorId: 5,
            inventoryKey: '3001:5',
            quantityRequired: 4,
          }),
        ],
      ],
    ]);
    const ownedData = [
      { setNumber: 'set-1', setName: 'Set One', ownedByKey: { '3001:5': 4 } },
    ];
    const result = computeMissingParts(catalog, ownedData, defaultPartMeta);
    expect(result).toHaveLength(0);
  });

  it('tracks same part missing from multiple sets separately', () => {
    const catalog = new Map([
      [
        'set-1',
        [
          makeCatalogSetPart({
            setNumber: 'set-1',
            partNum: '3001',
            colorId: 5,
            inventoryKey: '3001:5',
            quantityRequired: 4,
          }),
        ],
      ],
      [
        'set-2',
        [
          makeCatalogSetPart({
            setNumber: 'set-2',
            partNum: '3001',
            colorId: 5,
            inventoryKey: '3001:5',
            quantityRequired: 2,
          }),
        ],
      ],
    ]);
    const ownedData = [
      { setNumber: 'set-1', setName: 'Set One', ownedByKey: { '3001:5': 1 } },
      { setNumber: 'set-2', setName: 'Set Two', ownedByKey: {} },
    ];
    const result = computeMissingParts(catalog, ownedData, defaultPartMeta);
    expect(result).toHaveLength(1);
    expect(result[0].missingFromSets).toHaveLength(2);
    expect(result[0].missingFromSets[0].quantityMissing).toBe(3);
    expect(result[0].missingFromSets[1].quantityMissing).toBe(2);
  });
});
