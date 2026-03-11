# Collection Parts Tab Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Parts tab on the collection route with aggregated inventory view, filter/sort/export controls, missing parts grouped by set, part modal, and `/parts/[partNum]` detail page.

**Architecture:** Client-side aggregation from IndexedDB (owned + loose + catalog). New `useCollectionParts` hook aggregates across sets. Parts tab renders in `UserCollectionOverview` using adapted inventory components. Selection state persisted to localStorage for export list building (Plus only).

**Tech Stack:** Next.js 15, React 19, Zustand, Dexie/IndexedDB, Supabase (RLS), TanStack Query, Tailwind v4

**Spec:** `docs/dev/COLLECTION_PARTS_PLAN.md`

---

## File Structure

### New Files

| File                                                             | Responsibility                                   |
| ---------------------------------------------------------------- | ------------------------------------------------ |
| `app/components/collection/parts/types.ts`                       | CollectionPart type, filter/sort/selection types |
| `app/components/collection/parts/aggregation.ts`                 | Pure aggregation functions (testable)            |
| `app/components/collection/parts/sorting.ts`                     | Sort/filter/group pure functions (testable)      |
| `app/hooks/useCollectionParts.ts`                                | React hook: loads + aggregates parts data        |
| `app/hooks/useCollectionPartsControls.ts`                        | Filter/sort/view/page state with localStorage    |
| `app/hooks/useCollectionPartsSelection.ts`                       | Selection state with localStorage persistence    |
| `app/components/collection/parts/CollectionPartsView.tsx`        | Main orchestrator: grid + pagination + controls  |
| `app/components/collection/parts/CollectionPartCard.tsx`         | Part card (adapted from InventoryItem)           |
| `app/components/collection/parts/CollectionPartsControlBar.tsx`  | Filter/sort/view/export control bar              |
| `app/components/collection/parts/MissingPartsSetGroup.tsx`       | Collapsible set section for Missing view         |
| `app/components/collection/parts/CollectionPartModal.tsx`        | Part detail modal with loose qty editor          |
| `app/components/collection/parts/Pagination.tsx`                 | Page controls component                          |
| `app/components/collection/parts/CollectionPartsExportModal.tsx` | Export modal adapted for list builder            |
| `app/parts/[partNum]/page.tsx`                                   | Part detail page (server component)              |
| `app/parts/[partNum]/PartDetailClient.tsx`                       | Client component for part detail                 |
| `app/lib/catalog/parts.ts`                                       | Catalog queries for part metadata                |
| `app/lib/userPartsSyncPreferences.ts`                            | Parts sync preference load/save                  |
| `supabase/migrations/YYYYMMDD_collection_parts.sql`              | RLS policy + feature flag seed                   |
| `app/components/collection/parts/__tests__/aggregation.test.ts`  | Aggregation logic tests                          |
| `app/components/collection/parts/__tests__/sorting.test.ts`      | Sort/filter logic tests                          |
| `app/hooks/__tests__/useCollectionPartsSelection.test.ts`        | Selection state tests                            |

### Modified Files

| File                                                   | Change                                  |
| ------------------------------------------------------ | --------------------------------------- |
| `app/components/home/UserCollectionOverview.tsx`       | Wire parts tab to `CollectionPartsView` |
| `app/components/user/PublicUserCollectionOverview.tsx` | Wire public parts view                  |
| `app/account/components/SetsTab.tsx`                   | Add "Sync parts from sets" toggle       |
| `app/account/page.tsx`                                 | Load parts sync preferences server-side |

---

## Chunk 1: Data Layer — Types, Aggregation, Tests

### Task 1: Define Collection Parts Types

**Files:**

- Create: `app/components/collection/parts/types.ts`

- [ ] **Step 1: Create types file**

```typescript
// app/components/collection/parts/types.ts

export type CollectionPartSetSource = {
  setNumber: string;
  setName: string;
  quantityInSet: number;
  quantityOwned: number;
};

export type CollectionPartMissing = {
  setNumber: string;
  setName: string;
  quantityMissing: number;
  quantityRequired: number;
};

export type CollectionPart = {
  partNum: string;
  colorId: number;
  canonicalKey: string;
  partName: string;
  colorName: string;
  imageUrl: string | null;
  parentCategory: string | null;
  elementId: string | null;
  setCount: number | null;
  ownedFromSets: number;
  looseQuantity: number;
  totalOwned: number;
  setSources: CollectionPartSetSource[];
  missingFromSets: CollectionPartMissing[];
};

export type PartsSourceFilter = 'all' | 'owned' | 'loose' | 'missing';

export type PartsSortKey = 'name' | 'color' | 'category' | 'quantity';

export type PartsFilter = {
  source: PartsSourceFilter;
  categories: string[];
  colors: string[];
};

export type PartsControlsState = {
  filter: PartsFilter;
  sortKey: PartsSortKey;
  sortDir: 'asc' | 'desc';
  groupBy: 'none' | 'color' | 'category';
  view: 'list' | 'grid' | 'micro';
  itemSize: 'sm' | 'md' | 'lg';
  page: number;
  pageSize: number;
};

export type PartSelection = {
  canonicalKey: string;
  quantity: number;
  setNumber?: string; // present for Missing-view selections
};

export const DEFAULT_PARTS_CONTROLS: PartsControlsState = {
  filter: { source: 'all', categories: [], colors: [] },
  sortKey: 'name',
  sortDir: 'asc',
  groupBy: 'none',
  view: 'grid',
  itemSize: 'md',
  page: 1,
  pageSize: 100,
};
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add app/components/collection/parts/types.ts
git commit -m "feat(parts): add CollectionPart types and filter/sort types"
```

---

### Task 2: Write Aggregation Pure Functions

**Files:**

- Create: `app/components/collection/parts/aggregation.ts`
- Reference: `app/lib/localDb/schema.ts` (CatalogSetPart, LocalLoosePart types)

- [ ] **Step 1: Create aggregation module**

This module contains pure functions — no React, no IndexedDB calls. It takes pre-loaded data and returns aggregated parts.

```typescript
// app/components/collection/parts/aggregation.ts

import type {
  CatalogPart,
  CatalogSetPart,
  LocalLoosePart,
} from '@/app/lib/localDb/schema';
import type { CollectionPart } from './types';

type SetOwnedData = {
  setNumber: string;
  setName: string;
  ownedByKey: Record<string, number>;
};

/**
 * Check if an inventory key is a regular part (not minifig parent or unmatched BL subpart).
 */
function isRegularPartKey(inventoryKey: string): boolean {
  return !inventoryKey.startsWith('fig:') && !inventoryKey.startsWith('bl:');
}

/**
 * Build a CollectionPart from a CatalogSetPart + CatalogPart metadata.
 * CatalogSetPart has colorName, imageUrl, elementId, setCount but NOT partName or parentCategory.
 * CatalogPart (from catalogParts table) has name, parentCategory.
 */
function buildCollectionPart(
  cp: CatalogSetPart,
  partMeta: CatalogPart | undefined
): CollectionPart {
  return {
    partNum: cp.partNum,
    colorId: cp.colorId,
    canonicalKey: cp.inventoryKey,
    partName: partMeta?.name ?? cp.partNum,
    colorName: cp.colorName,
    imageUrl: cp.imageUrl ?? partMeta?.imageUrl ?? null,
    parentCategory: partMeta?.parentCategory ?? null,
    elementId: cp.elementId ?? null,
    setCount: cp.setCount ?? null,
    ownedFromSets: 0,
    looseQuantity: 0,
    totalOwned: 0,
    setSources: [],
    missingFromSets: [],
  };
}

/**
 * Aggregate parts from owned sets into a deduplicated collection.
 * Path A: For All/Owned/Loose filters (collection-scoped).
 *
 * @param partMetaLookup - Map<partNum, CatalogPart> for enriching with name/category.
 *   CatalogSetPart does NOT have partName or parentCategory — those live on CatalogPart.
 */
export function aggregateOwnedParts(
  catalogPartsBySet: Map<string, CatalogSetPart[]>,
  ownedDataBySet: SetOwnedData[],
  looseParts: LocalLoosePart[],
  partMetaLookup: Map<string, CatalogPart>
): CollectionPart[] {
  const partMap = new Map<string, CollectionPart>();

  // Aggregate set-sourced parts
  for (const { setNumber, setName, ownedByKey } of ownedDataBySet) {
    const catalogParts = catalogPartsBySet.get(setNumber) ?? [];
    for (const cp of catalogParts) {
      if (!isRegularPartKey(cp.inventoryKey)) continue;

      const key = cp.inventoryKey; // "partNum:colorId"
      const owned = ownedByKey[key] ?? 0;

      let part = partMap.get(key);
      if (!part) {
        part = buildCollectionPart(cp, partMetaLookup.get(cp.partNum));
        partMap.set(key, part);
      }

      part.ownedFromSets += owned;
      part.setSources.push({
        setNumber,
        setName,
        quantityInSet: cp.quantityRequired,
        quantityOwned: owned,
      });
    }
  }

  // Merge loose parts
  for (const lp of looseParts) {
    const key = `${lp.partNum}:${lp.colorId}`;
    const part = partMap.get(key);
    if (part) {
      part.looseQuantity = lp.quantity;
    } else {
      // Loose-only part (not in any owned set) — enrich from catalog if available
      const meta = partMetaLookup.get(lp.partNum);
      partMap.set(key, {
        partNum: lp.partNum,
        colorId: lp.colorId,
        canonicalKey: key,
        partName: meta?.name ?? lp.partNum,
        colorName: '',
        imageUrl: meta?.imageUrl ?? null,
        parentCategory: meta?.parentCategory ?? null,
        elementId: null,
        setCount: null,
        ownedFromSets: 0,
        looseQuantity: lp.quantity,
        totalOwned: lp.quantity,
        setSources: [],
        missingFromSets: [],
      });
    }
  }

  // Compute totalOwned
  for (const part of partMap.values()) {
    part.totalOwned = part.ownedFromSets + part.looseQuantity;
  }

  return Array.from(partMap.values());
}

/**
 * Compute missing parts across all sets with owned data.
 * Path B: For Missing filter (all-sets-with-owned-data scope).
 */
export function computeMissingParts(
  catalogPartsBySet: Map<string, CatalogSetPart[]>,
  ownedDataBySet: SetOwnedData[],
  partMetaLookup: Map<string, CatalogPart>
): CollectionPart[] {
  const partMap = new Map<string, CollectionPart>();

  for (const { setNumber, setName, ownedByKey } of ownedDataBySet) {
    const catalogParts = catalogPartsBySet.get(setNumber) ?? [];
    for (const cp of catalogParts) {
      if (!isRegularPartKey(cp.inventoryKey)) continue;

      const key = cp.inventoryKey;
      const owned = ownedByKey[key] ?? 0;
      const missing = cp.quantityRequired - owned;
      if (missing <= 0) continue;

      let part = partMap.get(key);
      if (!part) {
        part = buildCollectionPart(cp, partMetaLookup.get(cp.partNum));
        partMap.set(key, part);
      }

      part.missingFromSets.push({
        setNumber,
        setName,
        quantityMissing: missing,
        quantityRequired: cp.quantityRequired,
      });
    }
  }

  return Array.from(partMap.values());
}
```

- [ ] **Step 2: Verify compilation**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add app/components/collection/parts/aggregation.ts
git commit -m "feat(parts): add pure aggregation functions for collection parts"
```

---

### Task 3: Write Aggregation Tests

**Files:**

- Create: `app/components/collection/parts/__tests__/aggregation.test.ts`
- Reference: `app/components/collection/parts/aggregation.ts`

- [ ] **Step 1: Write tests for aggregateOwnedParts**

```typescript
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
    const catalog = new Map<string, CatalogSetPart[]>();
    const looseParts: LocalLoosePart[] = [
      { partNum: '99999', colorId: 1, quantity: 5, updatedAt: Date.now() },
    ];

    const result = aggregateOwnedParts(
      catalog,
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --run app/components/collection/parts/__tests__/aggregation.test.ts`
Expected: Tests fail (imports resolve, test structure correct, assertions fail on missing implementation — but implementation already exists, so they should PASS)

- [ ] **Step 3: Run tests to verify they pass**

Run: `npm test -- --run app/components/collection/parts/__tests__/aggregation.test.ts`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add app/components/collection/parts/__tests__/aggregation.test.ts
git commit -m "test(parts): add aggregation logic tests"
```

---

### Task 4: Write Sort/Filter Pure Functions

**Files:**

- Create: `app/components/collection/parts/sorting.ts`

- [ ] **Step 1: Create sorting module**

```typescript
// app/components/collection/parts/sorting.ts

import type { CollectionPart, PartsFilter, PartsSortKey } from './types';

/**
 * Filter parts by source type.
 */
export function filterBySource(
  parts: CollectionPart[],
  source: PartsFilter['source']
): CollectionPart[] {
  switch (source) {
    case 'owned':
      return parts.filter(p => p.ownedFromSets > 0);
    case 'loose':
      return parts.filter(p => p.looseQuantity > 0);
    case 'missing':
      return parts.filter(p => p.missingFromSets.length > 0);
    case 'all':
    default:
      return parts;
  }
}

/**
 * Filter parts by category and color.
 */
export function filterByCriteria(
  parts: CollectionPart[],
  filter: PartsFilter
): CollectionPart[] {
  let result = parts;

  if (filter.categories.length > 0) {
    const cats = new Set(filter.categories);
    result = result.filter(
      p => p.parentCategory != null && cats.has(p.parentCategory)
    );
  }

  if (filter.colors.length > 0) {
    const cols = new Set(filter.colors);
    result = result.filter(p => cols.has(String(p.colorId)));
  }

  return result;
}

/**
 * Sort parts by key and direction.
 */
export function sortParts(
  parts: CollectionPart[],
  sortKey: PartsSortKey,
  sortDir: 'asc' | 'desc'
): CollectionPart[] {
  const sorted = [...parts];
  const dir = sortDir === 'asc' ? 1 : -1;

  sorted.sort((a, b) => {
    switch (sortKey) {
      case 'name':
        return dir * a.partName.localeCompare(b.partName);
      case 'color':
        return dir * a.colorName.localeCompare(b.colorName);
      case 'category':
        return (
          dir * (a.parentCategory ?? '').localeCompare(b.parentCategory ?? '')
        );
      case 'quantity':
        return dir * (a.totalOwned - b.totalOwned);
      default:
        return 0;
    }
  });

  return sorted;
}

/**
 * Group parts by a key, returning group labels in order.
 */
export function groupParts(
  parts: CollectionPart[],
  groupBy: 'none' | 'color' | 'category'
): Map<string, CollectionPart[]> | null {
  if (groupBy === 'none') return null;

  const groups = new Map<string, CollectionPart[]>();

  for (const part of parts) {
    const key =
      groupBy === 'color'
        ? part.colorName || 'Unknown'
        : part.parentCategory || 'Unknown';

    const group = groups.get(key);
    if (group) {
      group.push(part);
    } else {
      groups.set(key, [part]);
    }
  }

  return groups;
}

/**
 * Paginate a list. Returns the slice for the requested page.
 */
export function paginateParts<T>(
  items: T[],
  page: number,
  pageSize: number
): { items: T[]; totalPages: number; currentPage: number } {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    totalPages,
    currentPage: safePage,
  };
}

/**
 * Extract unique category options from parts.
 */
export function extractCategoryOptions(parts: CollectionPart[]): string[] {
  const cats = new Set<string>();
  for (const p of parts) {
    if (p.parentCategory) cats.add(p.parentCategory);
  }
  return Array.from(cats).sort();
}

/**
 * Extract unique color options from parts as string IDs.
 */
export function extractColorOptions(parts: CollectionPart[]): string[] {
  const colors = new Set<string>();
  for (const p of parts) {
    colors.add(String(p.colorId));
  }
  return Array.from(colors).sort();
}
```

- [ ] **Step 2: Verify compilation**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add app/components/collection/parts/sorting.ts
git commit -m "feat(parts): add sort/filter/group/paginate pure functions"
```

---

### Task 5: Write Sort/Filter Tests

**Files:**

- Create: `app/components/collection/parts/__tests__/sorting.test.ts`

- [ ] **Step 1: Write tests**

```typescript
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
```

- [ ] **Step 2: Run tests**

Run: `npm test -- --run app/components/collection/parts/__tests__/sorting.test.ts`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add app/components/collection/parts/__tests__/sorting.test.ts
git commit -m "test(parts): add sort/filter/paginate tests"
```

---

### Task 6: Create useCollectionParts Hook

**Files:**

- Create: `app/hooks/useCollectionParts.ts`
- Reference: `app/lib/localDb/ownedStore.ts`, `app/lib/localDb/loosePartsStore.ts`, `app/lib/localDb/catalogCache.ts`, `app/store/user-sets.ts`

- [ ] **Step 1: Create the hook**

```typescript
// app/hooks/useCollectionParts.ts
'use client';

import {
  aggregateOwnedParts,
  computeMissingParts,
} from '@/app/components/collection/parts/aggregation';
import type {
  CollectionPart,
  PartsSourceFilter,
} from '@/app/components/collection/parts/types';
import { getAllLooseParts } from '@/app/lib/localDb/loosePartsStore';
import { getOwnedForSet } from '@/app/lib/localDb/ownedStore';
import type { CatalogPart, CatalogSetPart } from '@/app/lib/localDb/schema';
import { getLocalDb, isIndexedDBAvailable } from '@/app/lib/localDb/schema';
import { useUserSetsStore } from '@/app/store/user-sets';
import { useCallback, useEffect, useMemo, useState } from 'react';

type SetInfo = { setNumber: string; setName: string };

async function loadCatalogPartsForSets(
  setNumbers: string[]
): Promise<Map<string, CatalogSetPart[]>> {
  if (!isIndexedDBAvailable() || setNumbers.length === 0) return new Map();

  const db = getLocalDb();
  const result = new Map<string, CatalogSetPart[]>();

  for (const setNum of setNumbers) {
    const parts = await db.catalogSetParts
      .where('setNumber')
      .equals(setNum)
      .toArray();
    if (parts.length > 0) result.set(setNum, parts);
  }

  return result;
}

/**
 * Load CatalogPart metadata for all unique partNums from the catalog map.
 * CatalogSetPart has colorName/imageUrl but NOT partName/parentCategory —
 * those live on CatalogPart (the normalized parts table).
 */
async function loadPartMetadata(
  catalogPartsBySet: Map<string, CatalogSetPart[]>
): Promise<Map<string, CatalogPart>> {
  if (!isIndexedDBAvailable()) return new Map();

  const partNums = new Set<string>();
  for (const parts of catalogPartsBySet.values()) {
    for (const cp of parts) partNums.add(cp.partNum);
  }

  const db = getLocalDb();
  const result = new Map<string, CatalogPart>();

  // Batch fetch from catalogParts table by partNum
  const allMeta = await db.catalogParts
    .where('partNum')
    .anyOf([...partNums])
    .toArray();
  for (const meta of allMeta) {
    result.set(meta.partNum, meta);
  }

  return result;
}

async function getAllSetNumbersWithOwnedData(): Promise<string[]> {
  if (!isIndexedDBAvailable()) return [];
  const db = getLocalDb();
  return (await db.localOwned.orderBy('setNumber').uniqueKeys()) as string[];
}

export function useCollectionParts(
  sourceFilter: PartsSourceFilter,
  syncPartsFromSets: boolean
) {
  const [parts, setParts] = useState<CollectionPart[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const userSets = useUserSetsStore(state => state.sets);
  const setsHydrated = useUserSetsStore(state => state.setsHydrated);

  const ownedSetInfos: SetInfo[] = useMemo(() => {
    if (!setsHydrated) return [];
    return Object.values(userSets)
      .filter(s => s.status.owned)
      .map(s => ({ setNumber: s.setNumber, setName: s.name }));
  }, [userSets, setsHydrated]);

  const loadParts = useCallback(async () => {
    setIsLoading(true);
    try {
      if (sourceFilter === 'missing') {
        // Path B: all sets with owned data
        const allSetNums = await getAllSetNumbersWithOwnedData();
        const catalog = await loadCatalogPartsForSets(allSetNums);
        const partMeta = await loadPartMetadata(catalog);

        const ownedData = await Promise.all(
          allSetNums.map(async setNum => {
            const ownedByKey = await getOwnedForSet(setNum);
            // useUserSetsStore normalizes keys to lowercase
            const userSet = userSets[setNum.toLowerCase()];
            return {
              setNumber: setNum,
              setName: userSet?.name ?? setNum,
              ownedByKey,
            };
          })
        );

        setParts(computeMissingParts(catalog, ownedData, partMeta));
      } else {
        // Path A: owned sets + loose
        const setInfos = syncPartsFromSets ? ownedSetInfos : [];
        const catalog = await loadCatalogPartsForSets(
          setInfos.map(s => s.setNumber)
        );
        const partMeta = await loadPartMetadata(catalog);
        const looseParts = await getAllLooseParts();

        const ownedData = await Promise.all(
          setInfos.map(async ({ setNumber, setName }) => ({
            setNumber,
            setName,
            ownedByKey: await getOwnedForSet(setNumber),
          }))
        );

        setParts(aggregateOwnedParts(catalog, ownedData, looseParts, partMeta));
      }
    } catch (err) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('useCollectionParts: failed to load', err);
      }
      setParts([]);
    } finally {
      setIsLoading(false);
    }
  }, [sourceFilter, syncPartsFromSets, ownedSetInfos, userSets]);

  useEffect(() => {
    if (!setsHydrated) return;
    loadParts();
  }, [setsHydrated, loadParts]);

  return { parts, isLoading, reload: loadParts };
}
```

- [ ] **Step 2: Verify compilation**

Run: `npx tsc --noEmit`
Expected: No errors (may need to adjust imports based on actual exports)

- [ ] **Step 3: Commit**

```bash
git add app/hooks/useCollectionParts.ts
git commit -m "feat(parts): add useCollectionParts aggregation hook"
```

---

### Task 7: Create Controls and Selection Hooks

**Files:**

- Create: `app/hooks/useCollectionPartsControls.ts`
- Create: `app/hooks/useCollectionPartsSelection.ts`

- [ ] **Step 1: Create controls hook with localStorage persistence**

```typescript
// app/hooks/useCollectionPartsControls.ts
'use client';

import {
  DEFAULT_PARTS_CONTROLS,
  type PartsControlsState,
  type PartsFilter,
  type PartsSortKey,
} from '@/app/components/collection/parts/types';
import { useCallback, useState } from 'react';

const STORAGE_KEY = 'brick_party_parts_controls';

function loadFromStorage(): PartsControlsState {
  if (typeof window === 'undefined') return DEFAULT_PARTS_CONTROLS;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return DEFAULT_PARTS_CONTROLS;
    return { ...DEFAULT_PARTS_CONTROLS, ...JSON.parse(stored) };
  } catch {
    return DEFAULT_PARTS_CONTROLS;
  }
}

function saveToStorage(state: PartsControlsState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

export function useCollectionPartsControls() {
  const [state, setStateRaw] = useState<PartsControlsState>(loadFromStorage);

  const setState = useCallback(
    (
      next:
        | PartsControlsState
        | ((prev: PartsControlsState) => PartsControlsState)
    ) => {
      setStateRaw(prev => {
        const nextState = typeof next === 'function' ? next(prev) : next;
        saveToStorage(nextState);
        return nextState;
      });
    },
    []
  );

  const setFilter = useCallback(
    (filter: PartsFilter) => {
      setState(prev => ({ ...prev, filter, page: 1 }));
    },
    [setState]
  );

  const setSortKey = useCallback(
    (sortKey: PartsSortKey) => {
      setState(prev => ({ ...prev, sortKey, page: 1 }));
    },
    [setState]
  );

  const toggleSortDir = useCallback(() => {
    setState(prev => ({
      ...prev,
      sortDir: prev.sortDir === 'asc' ? 'desc' : 'asc',
      page: 1,
    }));
  }, [setState]);

  const setGroupBy = useCallback(
    (groupBy: PartsControlsState['groupBy']) => {
      setState(prev => ({ ...prev, groupBy }));
    },
    [setState]
  );

  const setView = useCallback(
    (view: PartsControlsState['view']) => {
      setState(prev => ({ ...prev, view }));
    },
    [setState]
  );

  const setItemSize = useCallback(
    (itemSize: PartsControlsState['itemSize']) => {
      setState(prev => ({ ...prev, itemSize }));
    },
    [setState]
  );

  const setPage = useCallback(
    (page: number) => {
      setState(prev => ({ ...prev, page }));
    },
    [setState]
  );

  const setSourceFilter = useCallback(
    (source: PartsFilter['source']) => {
      setState(prev => ({
        ...prev,
        filter: { ...prev.filter, source },
        page: 1,
      }));
    },
    [setState]
  );

  return {
    ...state,
    setFilter,
    setSortKey,
    toggleSortDir,
    setGroupBy,
    setView,
    setItemSize,
    setPage,
    setSourceFilter,
  };
}
```

- [ ] **Step 2: Create selection hook with localStorage persistence**

```typescript
// app/hooks/useCollectionPartsSelection.ts
'use client';

import type { PartSelection } from '@/app/components/collection/parts/types';
import { useCallback, useState } from 'react';

const STORAGE_KEY = 'brick_party_parts_selection';

function loadSelections(): Map<string, PartSelection> {
  if (typeof window === 'undefined') return new Map();
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return new Map();
    const arr: PartSelection[] = JSON.parse(stored);
    const map = new Map<string, PartSelection>();
    for (const s of arr) {
      // Use setNumber in key when present (Missing view: same part in multiple sets)
      const key = s.setNumber
        ? `${s.canonicalKey}:${s.setNumber}`
        : s.canonicalKey;
      map.set(key, s);
    }
    return map;
  } catch {
    return new Map();
  }
}

function saveSelections(selections: Map<string, PartSelection>) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(Array.from(selections.values()))
    );
  } catch {}
}

export function useCollectionPartsSelection() {
  const [selections, setSelectionsRaw] =
    useState<Map<string, PartSelection>>(loadSelections);

  const setSelections = useCallback(
    (
      nextOrUpdater:
        | Map<string, PartSelection>
        | ((prev: Map<string, PartSelection>) => Map<string, PartSelection>)
    ) => {
      setSelectionsRaw(prev => {
        const next =
          typeof nextOrUpdater === 'function'
            ? nextOrUpdater(prev)
            : nextOrUpdater;
        saveSelections(next);
        return next;
      });
    },
    []
  );

  const toggleSelection = useCallback(
    (canonicalKey: string, quantity: number, setNumber?: string) => {
      setSelections(prev => {
        const next = new Map(prev);
        const key = setNumber ? `${canonicalKey}:${setNumber}` : canonicalKey;
        if (next.has(key)) {
          next.delete(key);
        } else {
          next.set(key, { canonicalKey, quantity, setNumber });
        }
        return next;
      });
    },
    [setSelections]
  );

  const selectAll = useCallback(
    (
      items: Array<{
        canonicalKey: string;
        quantity: number;
        setNumber?: string;
      }>
    ) => {
      setSelections(prev => {
        const next = new Map(prev);
        for (const item of items) {
          const key = item.setNumber
            ? `${item.canonicalKey}:${item.setNumber}`
            : item.canonicalKey;
          next.set(key, item);
        }
        return next;
      });
    },
    [setSelections]
  );

  const deselectAll = useCallback(
    (keys: string[]) => {
      setSelections(prev => {
        const next = new Map(prev);
        for (const key of keys) next.delete(key);
        return next;
      });
    },
    [setSelections]
  );

  const clearAll = useCallback(() => {
    setSelections(new Map());
  }, [setSelections]);

  const updateQuantity = useCallback(
    (key: string, quantity: number) => {
      setSelections(prev => {
        const next = new Map(prev);
        const existing = next.get(key);
        if (existing) next.set(key, { ...existing, quantity });
        return next;
      });
    },
    [setSelections]
  );

  const isSelected = useCallback(
    (canonicalKey: string, setNumber?: string) => {
      const key = setNumber ? `${canonicalKey}:${setNumber}` : canonicalKey;
      return selections.has(key);
    },
    [selections]
  );

  return {
    selections,
    selectionCount: selections.size,
    toggleSelection,
    selectAll,
    deselectAll,
    clearAll,
    updateQuantity,
    isSelected,
  };
}
```

- [ ] **Step 3: Verify compilation**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add app/hooks/useCollectionPartsControls.ts app/hooks/useCollectionPartsSelection.ts
git commit -m "feat(parts): add controls and selection hooks with localStorage persistence"
```

---

## Chunk 2: Parts Tab UI — Card, Control Bar, Grid, Wiring

### Task 8: Create Part Card Component

**Files:**

- Create: `app/components/collection/parts/CollectionPartCard.tsx`
- Reference: `app/components/set/items/InventoryItem.tsx` (pattern), `app/components/ui/OptimizedImage.tsx`, `app/components/ui/ImagePlaceholder.tsx`

- [ ] **Step 1: Create part card**

Adapted from `InventoryItem` but simpler — no `OwnedQuantityControl`, shows `Owned: X | Loose: Y` metadata, selection checkbox, neutral ring (no green complete ring).

The card needs these features:

- Image with neutral `ring-1 ring-foreground-accent` (never green)
- Part name, part ID, color name metadata
- `Owned: X | Loose: Y` counts (or `Need X` in Missing view)
- Selection checkbox (top-left, disabled for free tier)
- Click → opens modal
- More dropdown (BrickLink, Rebrickable, More info)
- Memoized with custom `areEqual`

Write the component following `InventoryItem.tsx` patterns (lines 96-240 for layout, responsive classes). Use existing UI primitives: `OptimizedImage`, `ImagePlaceholder`, `MoreDropdown`, `MoreDropdownButton`.

Key differences from `InventoryItem`:

- No `OwnedQuantityControl` on the card
- Checkbox replaces the pin icon area
- Quantity metadata is `Owned: X | Loose: Y` not `owned/required`
- In Missing view mode, show `Need X` instead
- No green ring — always neutral

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add app/components/collection/parts/CollectionPartCard.tsx
git commit -m "feat(parts): add CollectionPartCard component"
```

---

### Task 9: Create Pagination Component

**Files:**

- Create: `app/components/collection/parts/Pagination.tsx`

- [ ] **Step 1: Create pagination component**

Simple pagination with prev/next buttons and page indicator. Reuse existing button patterns from `app/components/ui/Button.tsx`.

```typescript
// app/components/collection/parts/Pagination.tsx
'use client';

import { Button } from '@/app/components/ui/Button';
import { ChevronLeft, ChevronRight } from 'lucide-react';

type Props = {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
};

export function Pagination({ currentPage, totalPages, onPageChange }: Props) {
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-center gap-3 py-3">
      <Button
        variant="outline"
        size="sm"
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage <= 1}
      >
        <ChevronLeft size={16} />
        <span>Prev</span>
      </Button>
      <span className="text-sm text-foreground-muted">
        Page {currentPage} of {totalPages}
      </span>
      <Button
        variant="outline"
        size="sm"
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage >= totalPages}
      >
        <span>Next</span>
        <ChevronRight size={16} />
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/components/collection/parts/Pagination.tsx
git commit -m "feat(parts): add Pagination component"
```

---

### Task 10: Create Parts Control Bar

**Files:**

- Create: `app/components/collection/parts/CollectionPartsControlBar.tsx`
- Reference: `app/components/home/CollectionControlBar.tsx` (pattern), `app/components/set/controls/TopBarControls.tsx` (dropdown patterns)

- [ ] **Step 1: Create control bar**

Uses existing `ControlBar`, `DropdownTrigger`, `DropdownPanelFrame`, `SingleSelectList` from `app/components/ui/GroupedDropdown.tsx`. Includes:

- Source filter: All Parts / Owned / Loose / Missing
- Category filter (dropdown)
- Color filter (dropdown)
- Sort (name/color/category/quantity + asc/desc)
- View (list/grid/thumbnail)
- Export button with selection count badge
- Clear Selections button (always visible, disabled when count = 0)

Follow the exact same dropdown patterns as `CollectionControlBar.tsx` (lines 165-373) — `DropdownTrigger` → `DropdownPanelFrame` → `SingleSelectList`.

For the Export button: show badge with `selectionCount` when > 0. For free users, clicking triggers `UpgradeModal` (import from `app/components/upgrade-modal.tsx`).

For Clear Selections: use `Button` component, disabled when `selectionCount === 0`, onClick triggers confirmation via `window.confirm()` or a simple modal, then calls `clearAll()`.

- [ ] **Step 2: Verify compilation**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add app/components/collection/parts/CollectionPartsControlBar.tsx
git commit -m "feat(parts): add CollectionPartsControlBar component"
```

---

### Task 11: Create Main CollectionPartsView

**Files:**

- Create: `app/components/collection/parts/CollectionPartsView.tsx`

- [ ] **Step 1: Create the orchestrator component**

This component ties together:

- `useCollectionParts` (data)
- `useCollectionPartsControls` (filter/sort/view state)
- `useCollectionPartsSelection` (checkboxes)
- `CollectionPartsControlBar`
- `CollectionPartCard` (grid/list rendering)
- `Pagination`
- Sort/filter/paginate pipeline from `sorting.ts`

Structure:

1. Load parts via `useCollectionParts(sourceFilter, syncPartsFromSets)`
2. Apply `filterByCriteria` → `sortParts` → `paginateParts` pipeline
3. If `groupBy !== 'none'`, use `groupParts` and render group headings
4. Render `CollectionPartsControlBar` at top
5. Summary line: "X unique parts · Y total pieces"
6. `Pagination` top
7. Part cards in responsive grid (same classes as set inventory: `grid grid-cols-1 gap-x-2 gap-y-4 xs:grid-cols-2 md:grid-cols-3 lg:grid-cols-4`)
8. `Pagination` bottom
9. Loading state: `<BrickLoader size="sm" label="Loading parts…" />`
10. Empty state: existing empty state message

For the Missing filter: delegate to `MissingPartsSetGroup` (Task 12) instead of flat grid.

- [ ] **Step 2: Verify compilation**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add app/components/collection/parts/CollectionPartsView.tsx
git commit -m "feat(parts): add CollectionPartsView orchestrator component"
```

---

### Task 12: Create Missing Parts Set Group

**Files:**

- Create: `app/components/collection/parts/MissingPartsSetGroup.tsx`

- [ ] **Step 1: Create collapsible set group**

For the Missing filter view. Each set with missing parts renders as a collapsible section:

- Set header with: tri-state checkbox, set thumbnail, set name/number, missing count badge, chevron
- Expanded: grid of `CollectionPartCard` in Missing mode (shows "Need X")
- Collapsed: only header visible
- Tri-state checkbox logic: unchecked → all → unchecked (partial shown when subset selected)

Props:

```typescript
type Props = {
  setNumber: string;
  setName: string;
  missingParts: CollectionPart[];
  isSelected: (key: string, setNumber: string) => boolean;
  onToggleSelection: (key: string, qty: number, setNumber: string) => void;
  onSelectAll: (
    items: Array<{ canonicalKey: string; quantity: number; setNumber: string }>
  ) => void;
  onDeselectAll: (keys: string[]) => void;
  onShowModal: (part: CollectionPart) => void;
  view: 'list' | 'grid' | 'micro';
  itemSize: 'sm' | 'md' | 'lg';
  isCheckboxDisabled: boolean;
};
```

Use `useState` for expanded/collapsed. Default expanded.

The tri-state checkbox: compute from selection state.

- All selected → checked
- Some selected → indeterminate (use `ref.indeterminate = true` on the native checkbox)
- None selected → unchecked

- [ ] **Step 2: Verify compilation**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add app/components/collection/parts/MissingPartsSetGroup.tsx
git commit -m "feat(parts): add MissingPartsSetGroup with tri-state checkboxes"
```

---

### Task 13: Wire Parts Tab into UserCollectionOverview

**Files:**

- Modify: `app/components/home/UserCollectionOverview.tsx`

- [ ] **Step 1: Read current parts tab placeholder**

Read `app/components/home/UserCollectionOverview.tsx` and find the section where `collectionType === 'parts'` is handled (around lines 795-814). Also find where `CollectionControlBar` is conditionally hidden for parts.

- [ ] **Step 2: Replace placeholder with CollectionPartsView**

Replace the parts tab placeholder content with:

```tsx
import { CollectionPartsView } from '@/app/components/collection/parts/CollectionPartsView';

// In the render, where collectionType === 'parts':
{
  collectionType === 'parts' && (
    <CollectionPartsView syncPartsFromSets={true} />
  );
}
```

Note: `syncPartsFromSets` will be wired to account preferences in Task 18. Hard-code `true` for now.

Keep the existing control bar hidden for parts (it's replaced by `CollectionPartsControlBar` inside `CollectionPartsView`).

- [ ] **Step 3: Verify the dev server renders the parts tab**

Navigate to `/collection/[handle]?type=parts` in the browser. Verify:

- Control bar renders with filter/sort options
- Parts load and display in grid
- Pagination works
- Filter/sort controls function

- [ ] **Step 4: Commit**

```bash
git add app/components/home/UserCollectionOverview.tsx
git commit -m "feat(parts): wire CollectionPartsView into UserCollectionOverview"
```

---

## Chunk 3: Part Modal, Export, Entitlements

### Task 14: Create Part Modal

**Files:**

- Create: `app/components/collection/parts/CollectionPartModal.tsx`
- Reference: `app/components/set/items/InventoryItemModal.tsx` (pattern), `app/components/set/items/OwnedQuantityControl.tsx` (layout reference only)

- [ ] **Step 1: Create modal**

Follows `InventoryItemModal.tsx` layout pattern. Shows:

- Hero image (full-width)
- Part name, part ID, color name
- Quantity summary: "Total owned: X (from Y sets + Z loose)"
- Per-set breakdown table (set name, set number, owned/required) — only if `setSources.length > 1`
- Loose quantity editor: **Do NOT reuse `OwnedQuantityControl`** — it uses `clampOwned()` which caps at `required` and disables `+` at `owned >= required`. Instead, create an inline `LooseQuantityControl` within this component (or extract to a small helper) that:
  - Has `+`/`-` buttons and a text input (same visual pattern as `OwnedQuantityControl`)
  - Has no upper bound — `+` is never disabled (except at some reasonable max like 99999)
  - `-` disables at 0
  - onChange writes to `localLooseParts` via `upsertLoosePart()` from `loosePartsStore`
- Links: BrickLink, Rebrickable, "View Details" → `/parts/[partNum]`
- Price: reuse existing pricing fetch pattern from `InventoryItemModal`

Use the `Modal` component from `app/components/ui/Modal.tsx`.

For the loose quantity save: import `bulkUpsertLooseParts` from `app/lib/localDb/loosePartsStore.ts` with mode `'replace'`. On change, update the part's loose quantity and call the parent's reload callback.

- [ ] **Step 2: Wire modal into CollectionPartsView**

Add modal state to `CollectionPartsView`:

```typescript
const [modalPart, setModalPart] = useState<CollectionPart | null>(null);
```

Pass `onShowModal={setModalPart}` to `CollectionPartCard` and render:

```tsx
{
  modalPart && (
    <CollectionPartModal
      part={modalPart}
      onClose={() => setModalPart(null)}
      onLooseQuantityChange={reload}
    />
  );
}
```

- [ ] **Step 3: Verify modal works**

Click a part card, verify modal opens with correct data. Test loose quantity editing.

- [ ] **Step 4: Commit**

```bash
git add app/components/collection/parts/CollectionPartModal.tsx app/components/collection/parts/CollectionPartsView.tsx
git commit -m "feat(parts): add CollectionPartModal with loose quantity editor"
```

---

### Task 15: Create Parts Export Modal

**Files:**

- Create: `app/components/collection/parts/CollectionPartsExportModal.tsx`
- Reference: `app/components/export/ExportModal.tsx` (pattern), `app/lib/export/rebrickableCsv.ts`, `app/lib/export/bricklinkCsv.ts`, `app/lib/export/pickABrickCsv.ts`

- [ ] **Step 1: Create export modal**

Adapts `ExportModal` for the list builder context. Instead of `getMissingRows()` / `getAllRows()`, it receives the current `selections` Map and converts to `MissingRow[]` format for the CSV generators.

Key differences from `ExportModal`:

- No "Missing only" checkbox — exports exactly the selected parts
- Summary shows: "Exporting X parts (Y total pieces)"
- Pick-a-Brick warning: "X of Y selected parts have element IDs for Pick-a-Brick" when parts lack elementId
- No `setNumber` prop — exports are cross-set

Conversion from `PartSelection` to `MissingRow`:

```typescript
function selectionsToExportRows(
  selections: Map<string, PartSelection>,
  partsLookup: Map<string, CollectionPart>
): MissingRow[] {
  const rows: MissingRow[] = [];
  for (const sel of selections.values()) {
    const part = partsLookup.get(sel.canonicalKey);
    if (!part) continue;
    rows.push({
      setNumber: sel.setNumber ?? '',
      partId: part.partNum,
      colorId: part.colorId,
      quantityMissing: sel.quantity,
      elementId: part.elementId,
    });
  }
  return rows;
}
```

- [ ] **Step 2: Wire into CollectionPartsView**

Add export modal state, pass `selections` and `parts` (as lookup Map) to the export modal. Open from the Export button in the control bar.

- [ ] **Step 3: Test export flow**

Select some parts, click Export, verify CSV downloads correctly.

- [ ] **Step 4: Commit**

```bash
git add app/components/collection/parts/CollectionPartsExportModal.tsx app/components/collection/parts/CollectionPartsView.tsx
git commit -m "feat(parts): add export modal for list builder"
```

---

### Task 16: Add Entitlements Gating

**Files:**

- Create: `supabase/migrations/YYYYMMDD_list_builder_feature_flag.sql`
- Modify: `app/components/upgrade-modal.tsx` (add `'list_builder.enabled'` to `FeatureGateKey` union and `GATE_MESSAGES`)
- Modify: `app/components/collection/parts/CollectionPartsView.tsx`
- Modify: `app/components/collection/parts/CollectionPartCard.tsx`
- Modify: `app/components/collection/parts/CollectionPartsControlBar.tsx`

- [ ] **Step 1: Create migration for feature flag**

```bash
supabase migration new list_builder_feature_flag
```

Write SQL:

```sql
insert into public.feature_flags (key, description, min_tier, rollout_pct, is_enabled)
values ('list_builder.enabled', 'Collection parts list builder with selection and export', 'plus', 100, true)
on conflict (key) do update
set description = excluded.description, min_tier = excluded.min_tier;
```

- [ ] **Step 2: Add `list_builder.enabled` to UpgradeModal types**

In `app/components/upgrade-modal.tsx`, add `'list_builder.enabled'` to the `FeatureGateKey` union type and add a corresponding entry in `GATE_MESSAGES`:

```typescript
// Add to FeatureGateKey union:
| 'list_builder.enabled'

// Add to GATE_MESSAGES:
'list_builder.enabled': {
  title: 'List Builder',
  description: 'Build custom parts lists for targeted purchasing across your collection.',
},
```

- [ ] **Step 3: Add entitlements check to components**

In `CollectionPartsView`, use `useEntitlements()`:

```typescript
const { hasFeature } = useEntitlements();
const listBuilderEnabled = hasFeature('list_builder.enabled');
```

Pass `isCheckboxDisabled={!listBuilderEnabled}` to cards and control bar. When disabled:

- Checkboxes render greyed out
- Clicking a checkbox or Export button opens `UpgradeModal` with feature `'list_builder.enabled'`

- [ ] **Step 4: Verify gating works**

Test as free user: checkboxes disabled, clicking triggers upgrade modal.
Test as Plus user (or with beta override): checkboxes work normally.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/*list_builder* app/components/upgrade-modal.tsx app/components/collection/parts/CollectionPartsView.tsx app/components/collection/parts/CollectionPartCard.tsx app/components/collection/parts/CollectionPartsControlBar.tsx
git commit -m "feat(parts): gate list builder behind list_builder.enabled entitlement"
```

---

## Chunk 4: Part Detail Page & Account Settings

### Task 17: Create Part Detail Page

**Files:**

- Create: `app/lib/catalog/parts.ts`
- Create: `app/parts/[partNum]/page.tsx`
- Create: `app/parts/[partNum]/PartDetailClient.tsx`

- [ ] **Step 1: Create catalog parts query module**

```typescript
// app/lib/catalog/parts.ts
import 'server-only';

import { getCatalogReadClient } from '@/app/lib/db/catalogAccess';

export async function getPartByPartNum(partNum: string) {
  const supabase = getCatalogReadClient();
  const { data, error } = await supabase
    .from('rb_parts')
    .select('part_num, name, part_cat_id, bl_part_id')
    .eq('part_num', partNum)
    .maybeSingle();

  if (error || !data) return null;
  return data;
}

export async function getPartColors(partNum: string) {
  // Use rb_part_rarity (unique part_num + color_id rows) instead of
  // rb_inventory_parts (which has duplicates per set occurrence)
  const supabase = getCatalogReadClient();
  const { data } = await supabase
    .from('rb_part_rarity')
    .select('color_id, rb_colors!inner(name)')
    .eq('part_num', partNum);

  return data ?? [];
}

export async function getPartSetCount(partNum: string, colorId?: number) {
  const supabase = getCatalogReadClient();
  let query = supabase
    .from('rb_part_rarity')
    .select('set_count, color_id')
    .eq('part_num', partNum);

  if (colorId != null) {
    query = query.eq('color_id', colorId);
  }

  const { data } = await query;
  return data ?? [];
}

export async function getSetsContainingPart(partNum: string, colorId?: number) {
  // NOTE: mv_set_parts has SELECT revoked from anon/authenticated (only accessible
  // via SECURITY DEFINER functions). Use rb_inventory_parts_public joined with
  // rb_inventories to get set numbers.
  const supabase = getCatalogReadClient();
  let query = supabase
    .from('rb_inventory_parts_public')
    .select('rb_inventories!inner(set_num)')
    .eq('part_num', partNum)
    .eq('is_spare', false);

  if (colorId != null) {
    query = query.eq('color_id', colorId);
  }

  const { data } = await query.limit(200);
  // Deduplicate set numbers (a part may appear in multiple inventories of same set)
  const setNums = new Set<string>();
  for (const row of data ?? []) {
    const inv = row.rb_inventories as unknown as { set_num: string };
    if (inv?.set_num) setNums.add(inv.set_num);
  }
  return [...setNums];
}
```

- [ ] **Step 2: Create server page component**

```typescript
// app/parts/[partNum]/page.tsx
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getCatalogReadClient } from '@/app/lib/db/catalogAccess';
import { getPartByPartNum, getPartColors, getPartSetCount, getSetsContainingPart } from '@/app/lib/catalog/parts';
import { PartDetailClient } from './PartDetailClient';

type Props = { params: Promise<{ partNum: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { partNum } = await params;
  const part = await getPartByPartNum(partNum);
  if (!part) return { title: 'Part Not Found' };

  return {
    title: `${part.name} (${part.part_num}) — Brick Party`,
    description: `View details, colors, and sets containing LEGO part ${part.part_num} — ${part.name}`,
  };
}

export default async function PartDetailPage({ params }: Props) {
  const { partNum } = await params;
  const part = await getPartByPartNum(partNum);
  if (!part) notFound();

  const [colors, rarityData, setNums] = await Promise.all([
    getPartColors(partNum),
    getPartSetCount(partNum),
    getSetsContainingPart(partNum),
  ]);

  // Fetch set metadata (name, year, image) for display
  // getSetsContainingPart returns only set_nums — need rb_sets join for display info
  const { data: setMeta } = setNums.length > 0
    ? await getCatalogReadClient()
        .from('rb_sets')
        .select('set_num, name, year, img_url')
        .in('set_num', setNums)
    : { data: [] };

  return (
    <PartDetailClient
      part={part}
      colors={colors}
      rarityData={rarityData}
      sets={setMeta ?? []}
    />
  );
}
```

- [ ] **Step 3: Create client component**

`PartDetailClient.tsx` renders:

- Part hero image
- Part name, number
- Color selector/grid
- Set count from rarity data
- Sets containing this part (with name, year, image — as links to `/sets/[setNumber]`)
- For authenticated users: owned quantity summary + loose quantity editor (using `useCollectionParts` or direct IndexedDB queries)
- BrickLink + Rebrickable links

Follow existing page layout patterns from set detail pages.

- [ ] **Step 4: Verify page renders**

Navigate to `/parts/3001` (or any valid part number). Verify page loads with metadata.

- [ ] **Step 5: Commit**

```bash
git add app/lib/catalog/parts.ts app/parts/[partNum]/page.tsx app/parts/[partNum]/PartDetailClient.tsx
git commit -m "feat(parts): add /parts/[partNum] detail page with server-side metadata"
```

---

### Task 18: Add Parts Sync Preference to Account Settings

**Files:**

- Create: `app/lib/userPartsSyncPreferences.ts`
- Modify: `app/account/components/SetsTab.tsx`
- Modify: `app/account/page.tsx`

- [ ] **Step 1: Create preferences module**

Follow the exact pattern from `app/lib/userMinifigSyncPreferences.ts`. Store under `settings.partSync.syncFromSets` (boolean, default `true`).

```typescript
// app/lib/userPartsSyncPreferences.ts
// Follow userMinifigSyncPreferences.ts pattern exactly:
// - PartSyncPreferences type with syncFromSets: boolean
// - loadUserPartsSyncPreferences(supabase, userId)
// - saveUserPartsSyncPreferences(supabase, userId, patch)
// - Default: { syncFromSets: true }
// - Storage path: settings.partSync
```

- [ ] **Step 2: Add toggle to SetsTab**

Read `app/account/components/SetsTab.tsx`. Add a new `Card` section after the minifig sync section with:

- Title: "Part Sync"
- Checkbox: "Automatically include parts from owned sets in collection"
- Description: "When enabled, parts from sets you mark as owned appear in your collection's Parts tab."

Wire to `saveUserPartsSyncPreferences` on change, same pattern as minifig sync toggle.

- [ ] **Step 3: Load preferences server-side in account page**

Read `app/account/page.tsx`. Add `loadUserPartsSyncPreferences` call alongside the existing `loadUserMinifigSyncPreferences`. Pass the initial value as a prop to `SetsTab`.

- [ ] **Step 4: Wire preference into CollectionPartsView**

In `UserCollectionOverview.tsx`, load the parts sync preference (via a client-side hook or prop from page) and pass `syncPartsFromSets` to `CollectionPartsView`. Replace the hard-coded `true` from Task 13.

- [ ] **Step 5: Commit**

```bash
git add app/lib/userPartsSyncPreferences.ts app/account/components/SetsTab.tsx app/account/page.tsx app/components/home/UserCollectionOverview.tsx
git commit -m "feat(parts): add 'Sync parts from sets' toggle in account settings"
```

---

### Task 19: Add RLS Policy for Public Collection Parts

**Files:**

- Modify the migration from Task 16 or create new: `supabase/migrations/YYYYMMDD_public_parts_rls.sql`

- [ ] **Step 1: Create migration**

```bash
supabase migration new public_parts_inventory_rls
```

Write SQL:

```sql
-- Allow public profile viewers to see parts inventory
create policy "Public profiles can view parts inventory"
  on user_parts_inventory for select
  using (exists (
    select 1 from user_profiles
    where user_profiles.user_id = user_parts_inventory.user_id
    and user_profiles.collections_public = true
  ));
```

- [ ] **Step 2: Wire public view**

In `app/components/user/PublicUserCollectionOverview.tsx`, add parts tab rendering. For the public view, fetch from `user_parts_inventory` via API or server component, not from IndexedDB.

This can be a simpler read-only version: no selection, no export, no editing. Just display parts in a grid with filter/sort.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/*public_parts* app/components/user/PublicUserCollectionOverview.tsx
git commit -m "feat(parts): add RLS policy and public collection parts view"
```

---

## Chunk 5: Final Polish & Verification

### Task 20: End-to-End Verification

- [ ] **Step 1: Type check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 2: Run all tests**

Run: `npm test -- --run`
Expected: All tests pass (existing + new)

- [ ] **Step 3: Lint check**

Run: `npm run lint`
Expected: No errors

- [ ] **Step 4: Manual testing checklist**

Verify in the browser:

1. Parts tab loads with correct counts
2. All four source filters work (All/Owned/Loose/Missing)
3. Sort by name/color/category/quantity works
4. Group by color/category works
5. Pagination works (navigate pages, correct item counts)
6. Missing view: sets are collapsible, tri-state checkboxes work
7. Selection persists across filter changes and page navigation
8. Export modal generates correct CSV
9. Part modal shows correct data, loose quantity editing works
10. `/parts/[partNum]` page loads with metadata
11. Clear selections button works (disabled when empty, confirms before clearing)
12. Free user: checkboxes disabled, upgrade modal shows
13. Parts sync toggle in account settings works
14. View/filter state persists in localStorage across page loads

- [ ] **Step 5: Final commit**

```bash
git add app/components/collection/parts/ app/hooks/useCollection* app/parts/ app/lib/catalog/parts.ts app/lib/userPartsSyncPreferences.ts supabase/migrations/
git commit -m "feat(parts): collection parts tab complete"
```
