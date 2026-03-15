# Collection Parts Subcategory Filters Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add hierarchical parent/subcategory filtering to the collection parts tab and extract `categoryFilterHelpers` to a shared location.

**Architecture:** Move pure category filter logic from `set/controls/` to `ui/` with a generic type constraint. Add `categoryName` to the `CollectionPart` data model. Build a `CollectionCategoryPanel` component for drill-down filtering inside the existing dropdown frame. Update `PartsFilter` from flat `categories` to `parents` + `subcategoriesByParent`.

**Tech Stack:** TypeScript, React, Vitest

---

## Chunk 1: Data Layer & Shared Logic

### Task 1: Move and generalize categoryFilterHelpers

**Files:**

- Create: `app/components/ui/categoryFilterHelpers.ts`
- Modify: `app/components/set/controls/SidebarCategoryPanel.tsx:1-16`
- Delete: `app/components/set/controls/categoryFilterHelpers.ts`

- [ ] **Step 1: Create the generalized helpers at the new location**

```ts
// app/components/ui/categoryFilterHelpers.ts

export type CategoryFilterFields = {
  parents: string[];
  subcategoriesByParent: Record<string, string[]>;
};

export type ParentSelectionState = 'none' | 'some' | 'all';

export function getParentState<T extends CategoryFilterFields>(
  filter: T,
  allSubcategoriesByParent: Record<string, string[]>,
  parent: string
): ParentSelectionState {
  const hasParent = (filter.parents || []).includes(parent);
  if (!hasParent) return 'none';
  const all = allSubcategoriesByParent[parent] ?? [];
  const explicit = filter.subcategoriesByParent?.[parent];
  if (!explicit || explicit.length === 0) {
    return 'all';
  }
  if (all.length > 0 && explicit.length === all.length) return 'all';
  return 'some';
}

export function toggleParent<T extends CategoryFilterFields>(
  filter: T,
  parent: string
): T {
  if (parent === '__all__') {
    return { ...filter, parents: [], subcategoriesByParent: {} };
  }
  const parents = new Set(filter.parents || []);
  if (!parents.has(parent)) {
    return {
      ...filter,
      parents: [...parents.add(parent)],
      subcategoriesByParent: Object.fromEntries(
        Object.entries(filter.subcategoriesByParent || {}).filter(
          ([p]) => p !== parent
        )
      ),
    };
  } else {
    parents.delete(parent);
    const nextSubs = { ...(filter.subcategoriesByParent || {}) };
    delete nextSubs[parent];
    return {
      ...filter,
      parents: Array.from(parents),
      subcategoriesByParent: nextSubs,
    };
  }
}

export function toggleSubcategory<T extends CategoryFilterFields>(
  filter: T,
  allSubcategoriesByParent: Record<string, string[]>,
  parent: string,
  sub: string
): T {
  const allSubs = allSubcategoriesByParent[parent] ?? [];
  const parents = new Set(filter.parents || []);
  const wasParentSelected = parents.has(parent);

  if (!wasParentSelected) {
    parents.add(parent);
  }

  const currentExplicit = filter.subcategoriesByParent?.[parent];
  let nextForParent: string[];

  if (!wasParentSelected) {
    nextForParent = [sub];
  } else if (!currentExplicit || currentExplicit.length === 0) {
    nextForParent = allSubs.filter(s => s !== sub);
  } else {
    const set = new Set(currentExplicit);
    if (set.has(sub)) set.delete(sub);
    else set.add(sub);
    nextForParent = Array.from(set);
  }

  const nextSubs = { ...(filter.subcategoriesByParent || {}) };

  if (nextForParent.length === allSubs.length) {
    delete nextSubs[parent];
  } else if (nextForParent.length === 0) {
    parents.delete(parent);
    delete nextSubs[parent];
  } else {
    nextSubs[parent] = nextForParent.sort((a, b) => a.localeCompare(b));
  }

  return {
    ...filter,
    parents: Array.from(parents),
    subcategoriesByParent: nextSubs,
  };
}

export function clearParentSubcategories<T extends CategoryFilterFields>(
  filter: T,
  parent: string
): T {
  if (!(filter.parents || []).includes(parent)) return filter;
  const nextSubs = { ...(filter.subcategoriesByParent || {}) };
  delete nextSubs[parent];
  return { ...filter, subcategoriesByParent: nextSubs };
}
```

- [ ] **Step 2: Update SidebarCategoryPanel import**

In `app/components/set/controls/SidebarCategoryPanel.tsx`, change line 9 and lines 11-15:

```ts
// Before
import type { InventoryFilter } from '../types';
import {
  clearParentSubcategories,
  getParentState,
  toggleParent,
  toggleSubcategory,
} from './categoryFilterHelpers';

// After
import {
  clearParentSubcategories,
  getParentState,
  toggleParent,
  toggleSubcategory,
} from '@/app/components/ui/categoryFilterHelpers';
import type { InventoryFilter } from '../types';
```

- [ ] **Step 3: Delete the old file**

Delete `app/components/set/controls/categoryFilterHelpers.ts`.

- [ ] **Step 4: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add app/components/ui/categoryFilterHelpers.ts app/components/set/controls/SidebarCategoryPanel.tsx
git rm app/components/set/controls/categoryFilterHelpers.ts
git commit -m "Move categoryFilterHelpers to ui/ with generic type"
```

---

### Task 2: Update PartsFilter type and defaults

**Files:**

- Modify: `app/components/collection/parts/types.ts`

- [ ] **Step 1: Add `categoryName` to `CollectionPart` and update `PartsFilter`**

In `app/components/collection/parts/types.ts`:

Add `categoryName` after `parentCategory` (line 24):

```ts
parentCategory: string | null;
categoryName: string | null;
```

Replace `PartsFilter` (lines 38-42):

```ts
// Before
export type PartsFilter = {
  source: PartsSourceFilter;
  categories: string[];
  colors: string[];
};

// After
export type PartsFilter = {
  source: PartsSourceFilter;
  parents: string[];
  subcategoriesByParent: Record<string, string[]>;
  colors: string[];
};
```

Update `DEFAULT_PARTS_CONTROLS` (line 62):

```ts
// Before
filter: { source: 'all', categories: [], colors: [] },

// After
filter: { source: 'all', parents: [], subcategoriesByParent: {}, colors: [] },
```

- [ ] **Step 2: Run type check to see expected errors**

Run: `npx tsc --noEmit`
Expected: Errors in `aggregation.ts`, `sorting.ts`, `CollectionPartsControlBar.tsx`, and tests — these will be fixed in subsequent tasks.

- [ ] **Step 3: Commit**

```bash
git add app/components/collection/parts/types.ts
git commit -m "Update PartsFilter to support parent/subcategory hierarchy"
```

---

### Task 3: Update aggregation to populate categoryName

**Files:**

- Modify: `app/components/collection/parts/aggregation.ts:24-39,80-95`
- Modify: `app/components/collection/parts/__tests__/aggregation.test.ts`

- [ ] **Step 1: Update `buildCollectionPart` to include `categoryName`**

In `app/components/collection/parts/aggregation.ts`, add after line 31 (`parentCategory`):

```ts
    parentCategory: partMeta?.parentCategory ?? null,
    categoryName: partMeta?.categoryName ?? null,
```

- [ ] **Step 2: Update the loose-parts inline literal**

In `app/components/collection/parts/aggregation.ts`, the inline object at lines 80-95 (inside the `for (const lp of looseParts)` loop). Add `categoryName` after `parentCategory`:

```ts
        parentCategory: meta?.parentCategory ?? null,
        categoryName: meta?.categoryName ?? null,
```

- [ ] **Step 3: Update test fixtures**

In `app/components/collection/parts/__tests__/aggregation.test.ts`, update `makePartMeta` (line 26-41) to include `categoryName`:

```ts
function makePartMeta(
  partNum: string,
  name: string,
  parentCategory: string | null = 'Brick',
  categoryName: string | null = null
): CatalogPart {
  return {
    partNum,
    name,
    imageUrl: null,
    categoryId: null,
    categoryName,
    parentCategory,
    bricklinkPartId: null,
    cachedAt: Date.now(),
  };
}
```

Add a test that verifies `categoryName` is populated:

```ts
it('populates categoryName from part metadata', () => {
  const metaWithCategory = new Map<string, CatalogPart>([
    ['3001', makePartMeta('3001', 'Brick 2x4', 'Brick', 'Brick Standard')],
  ]);
  const catalog = new Map([
    [
      'set-1',
      [
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
    { setNumber: 'set-1', setName: 'Set One', ownedByKey: {} },
  ];
  const result = aggregateOwnedParts(catalog, ownedData, [], metaWithCategory);
  expect(result[0].categoryName).toBe('Brick Standard');
  expect(result[0].parentCategory).toBe('Brick');
});
```

- [ ] **Step 4: Run tests**

Run: `npm test -- --run app/components/collection/parts/__tests__/aggregation.test.ts`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add app/components/collection/parts/aggregation.ts app/components/collection/parts/__tests__/aggregation.test.ts
git commit -m "Populate categoryName on CollectionPart from CatalogPart metadata"
```

---

### Task 4: Update sorting/filtering logic for parent+subcategory

**Files:**

- Modify: `app/components/collection/parts/sorting.ts:22-41,111-117`
- Modify: `app/components/collection/parts/__tests__/sorting.test.ts`

- [ ] **Step 1: Update test fixtures and write failing tests**

In `app/components/collection/parts/__tests__/sorting.test.ts`, update the `makePart` helper to include `categoryName`:

```ts
function makePart(overrides: Partial<CollectionPart>): CollectionPart {
  return {
    partNum: '3001',
    colorId: 5,
    canonicalKey: '3001:5',
    partName: 'Brick 2x4',
    colorName: 'Red',
    imageUrl: null,
    parentCategory: 'Brick',
    categoryName: null,
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
```

Update the imports to add `extractSubcategoriesByParent`:

```ts
import {
  filterBySource,
  filterByCriteria,
  sortParts,
  groupParts,
  paginateParts,
  extractCategoryOptions,
  extractSubcategoriesByParent,
} from '../sorting';
```

Replace the `filterByCriteria` describe block:

```ts
describe('filterByCriteria', () => {
  it('returns all parts when no parents or colors are specified', () => {
    const parts = [
      makePart({ parentCategory: 'Brick' }),
      makePart({ parentCategory: 'Plate' }),
    ];
    expect(
      filterByCriteria(parts, {
        source: 'all',
        parents: [],
        subcategoriesByParent: {},
        colors: [],
      })
    ).toHaveLength(2);
  });

  it('filters by parent category', () => {
    const parts = [
      makePart({ canonicalKey: 'a', parentCategory: 'Brick' }),
      makePart({ canonicalKey: 'b', parentCategory: 'Plate' }),
    ];
    const result = filterByCriteria(parts, {
      source: 'all',
      parents: ['Brick'],
      subcategoriesByParent: {},
      colors: [],
    });
    expect(result.map(p => p.canonicalKey)).toEqual(['a']);
  });

  it('filters by explicit subcategory when specified', () => {
    const parts = [
      makePart({
        canonicalKey: 'a',
        parentCategory: 'Brick',
        categoryName: 'Brick Standard',
      }),
      makePart({
        canonicalKey: 'b',
        parentCategory: 'Brick',
        categoryName: 'Brick Round',
      }),
      makePart({
        canonicalKey: 'c',
        parentCategory: 'Plate',
        categoryName: 'Plate Standard',
      }),
    ];
    const result = filterByCriteria(parts, {
      source: 'all',
      parents: ['Brick'],
      subcategoriesByParent: { Brick: ['Brick Standard'] },
      colors: [],
    });
    expect(result.map(p => p.canonicalKey)).toEqual(['a']);
  });

  it('includes all subcategories when parent selected with no explicit subs', () => {
    const parts = [
      makePart({
        canonicalKey: 'a',
        parentCategory: 'Brick',
        categoryName: 'Brick Standard',
      }),
      makePart({
        canonicalKey: 'b',
        parentCategory: 'Brick',
        categoryName: 'Brick Round',
      }),
    ];
    const result = filterByCriteria(parts, {
      source: 'all',
      parents: ['Brick'],
      subcategoriesByParent: {},
      colors: [],
    });
    expect(result.map(p => p.canonicalKey)).toEqual(['a', 'b']);
  });

  it('filters by color name', () => {
    const parts = [
      makePart({ canonicalKey: 'a', colorName: 'Red' }),
      makePart({ canonicalKey: 'b', colorName: 'Blue' }),
    ];
    const result = filterByCriteria(parts, {
      source: 'all',
      parents: [],
      subcategoriesByParent: {},
      colors: ['Red'],
    });
    expect(result.map(p => p.canonicalKey)).toEqual(['a']);
  });
});
```

Add a test for `extractSubcategoriesByParent`:

```ts
describe('extractSubcategoriesByParent', () => {
  it('groups categoryName under parentCategory', () => {
    const parts = [
      makePart({ parentCategory: 'Brick', categoryName: 'Brick Standard' }),
      makePart({ parentCategory: 'Brick', categoryName: 'Brick Round' }),
      makePart({ parentCategory: 'Plate', categoryName: 'Plate Standard' }),
      makePart({ parentCategory: 'Brick', categoryName: 'Brick Standard' }), // duplicate
    ];
    const result = extractSubcategoriesByParent(parts);
    expect(result).toEqual({
      Brick: ['Brick Round', 'Brick Standard'],
      Plate: ['Plate Standard'],
    });
  });

  it('uses parentCategory as fallback when categoryName is null', () => {
    const parts = [makePart({ parentCategory: 'Brick', categoryName: null })];
    const result = extractSubcategoriesByParent(parts);
    expect(result).toEqual({ Brick: ['Brick'] });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --run app/components/collection/parts/__tests__/sorting.test.ts`
Expected: FAIL — `extractSubcategoriesByParent` not found, `filterByCriteria` signature mismatch

- [ ] **Step 3: Update `filterByCriteria` in sorting.ts**

Replace the `filterByCriteria` function (lines 22-41):

```ts
export function filterByCriteria(
  parts: CollectionPart[],
  filter: PartsFilter
): CollectionPart[] {
  let result = parts;

  if (filter.parents.length > 0) {
    const parentSet = new Set(filter.parents);
    result = result.filter(p => {
      if (p.parentCategory == null || !parentSet.has(p.parentCategory))
        return false;
      const explicit = filter.subcategoriesByParent[p.parentCategory];
      if (!explicit || explicit.length === 0) return true;
      const subcategory = p.categoryName ?? p.parentCategory;
      return explicit.includes(subcategory);
    });
  }

  if (filter.colors.length > 0) {
    const cols = new Set(filter.colors);
    result = result.filter(p => p.colorName != null && cols.has(p.colorName));
  }

  return result;
}
```

- [ ] **Step 4: Add `extractSubcategoriesByParent` to sorting.ts**

Add after `extractCategoryOptions`:

```ts
export function extractSubcategoriesByParent(
  parts: CollectionPart[]
): Record<string, string[]> {
  const map = new Map<string, Set<string>>();
  for (const p of parts) {
    if (!p.parentCategory) continue;
    if (!map.has(p.parentCategory)) {
      map.set(p.parentCategory, new Set());
    }
    map.get(p.parentCategory)!.add(p.categoryName ?? p.parentCategory);
  }
  const result: Record<string, string[]> = {};
  for (const [parent, subs] of map.entries()) {
    result[parent] = Array.from(subs).sort();
  }
  return result;
}
```

- [ ] **Step 5: Run tests**

Run: `npm test -- --run app/components/collection/parts/__tests__/sorting.test.ts`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add app/components/collection/parts/sorting.ts app/components/collection/parts/__tests__/sorting.test.ts
git commit -m "Update filterByCriteria for parent/subcategory and add extractSubcategoriesByParent"
```

---

## Chunk 2: UI Components & Integration

### Task 5: Create CollectionCategoryPanel component

**Files:**

- Create: `app/components/collection/parts/CollectionCategoryPanel.tsx`

- [ ] **Step 1: Create the component**

```tsx
// app/components/collection/parts/CollectionCategoryPanel.tsx
'use client';

import { ClearAllButton } from '@/app/components/ui/ClearAllButton';
import {
  clearParentSubcategories,
  getParentState,
  toggleParent,
  toggleSubcategory,
} from '@/app/components/ui/categoryFilterHelpers';
import { DropdownSection } from '@/app/components/ui/GroupedDropdown';
import { RowButton } from '@/app/components/ui/RowButton';
import { RowCheckbox } from '@/app/components/ui/RowCheckbox';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import type { PartsFilter } from './types';

type Props = {
  filter: PartsFilter;
  onFilterChange: (f: PartsFilter) => void;
  parentOptions: string[];
  subcategoriesByParent: Record<string, string[]>;
};

export function CollectionCategoryPanel({
  filter,
  onFilterChange,
  parentOptions,
  subcategoriesByParent,
}: Props) {
  const [activeParent, setActiveParent] = useState<string | null>(null);

  if (activeParent !== null) {
    const subs = subcategoriesByParent[activeParent] ?? [];
    const parentSelected = (filter.parents || []).includes(activeParent);
    const explicit = filter.subcategoriesByParent?.[activeParent];

    return (
      <>
        <DropdownSection>
          <div className="flex items-center gap-2 border-b-2 border-subtle bg-background-muted/50 px-4 py-3">
            <button
              type="button"
              className="rounded-sm p-1.5 transition-colors hover:bg-theme-primary/20"
              onClick={() => setActiveParent(null)}
              aria-label="Back to categories"
            >
              <ChevronLeft size={18} />
            </button>
            <span className="text-base font-bold">{activeParent}</span>
          </div>
        </DropdownSection>
        <DropdownSection>
          <div>
            {subs.map(sub => {
              const isEffectivelySelected =
                parentSelected &&
                (!explicit || explicit.length === 0 || explicit.includes(sub));
              return (
                <RowButton
                  key={sub}
                  selected={isEffectivelySelected}
                  onClick={() =>
                    onFilterChange(
                      toggleSubcategory(
                        filter,
                        subcategoriesByParent,
                        activeParent,
                        sub
                      )
                    )
                  }
                  className="border-b border-foreground-accent"
                >
                  <RowCheckbox checked={isEffectivelySelected} />
                  <span>{sub}</span>
                </RowButton>
              );
            })}
            <ClearAllButton
              onClick={() =>
                onFilterChange(clearParentSubcategories(filter, activeParent))
              }
            />
          </div>
        </DropdownSection>
      </>
    );
  }

  return (
    <DropdownSection>
      <div>
        {parentOptions.map(parent => {
          const state = getParentState(filter, subcategoriesByParent, parent);
          const selected = (filter.parents || []).includes(parent);
          const subCount = (subcategoriesByParent[parent] || []).length;
          return (
            <div
              key={parent}
              className="relative flex h-13 border-b border-foreground-accent"
            >
              <RowButton
                selected={selected}
                onClick={() => onFilterChange(toggleParent(filter, parent))}
                className="flex-1"
              >
                <RowCheckbox
                  checked={state === 'all'}
                  indeterminate={state === 'some'}
                />
                <span>{parent}</span>
              </RowButton>
              {subCount > 1 && (
                <button
                  type="button"
                  className="flex h-14 w-14 cursor-pointer items-center justify-center border-l border-foreground-accent text-foreground-muted hover:bg-card-muted hover:text-foreground"
                  onClick={e => {
                    e.stopPropagation();
                    setActiveParent(parent);
                  }}
                  aria-label={`Show ${parent} subcategories`}
                >
                  <ChevronRight size={18} />
                </button>
              )}
            </div>
          );
        })}
        {(filter.parents?.length || 0) > 0 && (
          <ClearAllButton
            onClick={() =>
              onFilterChange({
                ...filter,
                parents: [],
                subcategoriesByParent: {},
              })
            }
          />
        )}
      </div>
    </DropdownSection>
  );
}
```

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: Errors only in `CollectionPartsControlBar.tsx` and `CollectionPartsView.tsx` (not yet updated)

- [ ] **Step 3: Commit**

```bash
git add app/components/collection/parts/CollectionCategoryPanel.tsx
git commit -m "Add CollectionCategoryPanel with parent/subcategory drill-down"
```

---

### Task 6: Update CollectionPartsControlBar

**Files:**

- Modify: `app/components/collection/parts/CollectionPartsControlBar.tsx`

- [ ] **Step 1: Update props and replace category dropdown**

Replace the `Props` type `categoryOptions` line with:

```ts
  parentOptions: string[];
  subcategoriesByParent: Record<string, string[]>;
```

Replace the destructured prop `categoryOptions` with `parentOptions` and `subcategoriesByParent`.

Replace the `categoryLabel` computation:

```ts
const categoryLabel =
  filter.parents.length === 0
    ? 'Category'
    : filter.parents.length === 1
      ? filter.parents[0]!
      : `Category (${filter.parents.length})`;
```

Remove the `toggleCategory` function (no longer needed).

Replace the category filter section (the `{categoryOptions.length > 0 && (` block) with:

```tsx
{
  /* Category filter */
}
{
  parentOptions.length > 0 && (
    <div className="shrink-0 lg:relative">
      <DropdownTrigger
        id="parts-category-trigger"
        panelId="parts-category-panel"
        label={categoryLabel}
        labelIcon={<Tag size={16} />}
        isOpen={openDropdownId === 'category'}
        onToggle={() => toggleDropdown('category')}
      />
      <DropdownPanelFrame
        id="parts-category-panel"
        labelledBy="parts-category-trigger"
        isOpen={openDropdownId === 'category'}
      >
        <CollectionCategoryPanel
          filter={filter}
          onFilterChange={onFilterChange}
          parentOptions={parentOptions}
          subcategoriesByParent={subcategoriesByParent}
        />
      </DropdownPanelFrame>
    </div>
  );
}
```

Add import at the top:

```ts
import { CollectionCategoryPanel } from './CollectionCategoryPanel';
```

Remove unused imports: `ClearAllButton`, `RowButton`, `RowCheckbox` are still needed for the color dropdown. Check if they're still used — `RowButton` and `RowCheckbox` are used in the color section, keep them. `ClearAllButton` is used in the color section, keep it.

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: Errors only in `CollectionPartsView.tsx` (passes wrong props)

- [ ] **Step 3: Commit**

```bash
git add app/components/collection/parts/CollectionPartsControlBar.tsx
git commit -m "Wire CollectionCategoryPanel into control bar"
```

---

### Task 7: Update CollectionPartsView to compute and pass subcategory data

**Files:**

- Modify: `app/components/collection/parts/CollectionPartsView.tsx:16-24,107-114,208-228`

- [ ] **Step 1: Update imports**

Add `extractSubcategoriesByParent` to the imports from `./sorting`:

```ts
import {
  extractCategoryOptions,
  extractColorOptions,
  extractSubcategoriesByParent,
  filterByCriteria,
  filterBySource,
  groupParts,
  paginateParts,
  sortParts,
} from './sorting';
```

- [ ] **Step 2: Compute subcategoriesByParent**

After the existing `categoryOptions` memo (around line 107-110), add:

```ts
const subcategoriesByParent = useMemo(
  () => extractSubcategoriesByParent(sourceFiltered),
  [sourceFiltered]
);
```

- [ ] **Step 3: Update the `CollectionPartsControlBar` props**

Replace `categoryOptions={categoryOptions}` with:

```tsx
parentOptions = { categoryOptions };
subcategoriesByParent = { subcategoriesByParent };
```

- [ ] **Step 4: Run type check and tests**

Run: `npx tsc --noEmit`
Expected: No errors

Run: `npm test -- --run app/components/collection/parts/`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add app/components/collection/parts/CollectionPartsView.tsx
git commit -m "Wire subcategory data through CollectionPartsView to control bar"
```

---

### Task 8: Final verification

- [ ] **Step 1: Run full type check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 2: Run all tests**

Run: `npm test -- --run`
Expected: All tests pass

- [ ] **Step 3: Run lint**

Run: `npm run lint`
Expected: No errors

- [ ] **Step 4: Verify SidebarCategoryPanel still works**

Run: `npx tsc --noEmit` (confirms set inventory page compiles)
Manually verify that `SidebarCategoryPanel` imports resolve from `@/app/components/ui/categoryFilterHelpers`.

- [ ] **Step 5: Commit if any formatting changes**

```bash
npm run format
git add -A
git commit -m "Format and final cleanup"
```
