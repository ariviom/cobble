# Collection Parts Subcategory Filters

## Goal

Add hierarchical parent/subcategory filtering to the collection parts tab, matching the set inventory's drill-down behavior. Extract `categoryFilterHelpers` to a shared location so both the set inventory and collection parts use the same toggle/state logic.

## Background

The set inventory page has a `SidebarCategoryPanel` that supports two-level category filtering: parent categories (e.g., "Wheels") contain subcategories (e.g., "Wheel 18x34"). Users can select/deselect parents (implicitly selecting all subcategories), drill into a parent to toggle individual subcategories, and see indeterminate checkbox states when only some subcategories are selected.

The collection parts tab currently has flat category filtering using only `parentCategory`. It lacks subcategory data and uses a simple multi-select list.

## Design

### Data Layer

**Add `categoryName` to `CollectionPart`** (`types.ts`):

```ts
export type CollectionPart = {
  // ... existing fields
  parentCategory: string | null;
  categoryName: string | null; // NEW — immediate subcategory
};
```

Populated from `CatalogPart.categoryName` during aggregation in `buildCollectionPart()`. The loose-parts inline literal in `aggregateOwnedParts` (lines 80-96, which bypasses `buildCollectionPart`) must also include `categoryName: meta?.categoryName ?? null`.

**Update `PartsFilter`** to use the same category structure as `InventoryFilter`:

```ts
// Before
export type PartsFilter = {
  source: PartsSourceFilter;
  categories: string[]; // flat
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

**Update `DEFAULT_PARTS_CONTROLS`** to use `parents: []` and `subcategoriesByParent: {}` instead of `categories: []`.

**Compute `subcategoriesByParent`** in `CollectionPartsView` (or a helper in `sorting.ts`): iterate source-filtered parts, group `categoryName` values under `parentCategory`, return `Record<string, string[]>` with sorted subcategory arrays. Same approach as `useInventoryViewModel` lines 164-190.

**Update `filterByCriteria`** in `sorting.ts`: replace the flat `categories` check with parent+subcategory logic. When `parents` is empty, skip the category filter entirely (no-filter case). When parents are selected: if a parent has no explicit subcategories in `subcategoriesByParent`, all parts with that `parentCategory` match. If explicit subcategories are listed, only parts whose `categoryName` is in the list match.

**Update `extractCategoryOptions`**: rename or adapt to return parent category options (behavior stays the same — it already extracts unique `parentCategory` values).

### Shared Logic

**Move `categoryFilterHelpers.ts`** from `app/components/set/controls/` to `app/components/ui/categoryFilterHelpers.ts`.

**Generalize the type parameter**. The helpers currently operate on `InventoryFilter`. Extract a minimal shape:

```ts
export type CategoryFilterFields = {
  parents: string[];
  subcategoriesByParent: Record<string, string[]>;
};
```

Each function becomes generic: `<T extends CategoryFilterFields>(filter: T, ...) => T`. The helpers spread `...filter` when returning, so the extra fields on `InventoryFilter` or `PartsFilter` pass through unchanged.

**Update `SidebarCategoryPanel`** to import from the new `ui/` location. No behavior change.

### UI — Collection Category Panel

**New component: `CollectionCategoryPanel`** co-located at `app/components/collection/parts/CollectionCategoryPanel.tsx`.

Renders inside the existing `DropdownPanelFrame` for the category filter. Two states managed by local `useState<string | null>`:

**Parent view** (default):

- `RowButton` + `RowCheckbox` per parent category
- Checkbox uses `getParentState()` for checked/indeterminate
- Chevron button on the right to drill into subcategories (shown when parent has >1 subcategory)
- `ClearAllButton` at bottom when any parents are selected

**Subcategory view** (when a parent is drilled into):

- Header row: back button (ChevronLeft) + parent name
- `RowButton` + `RowCheckbox` per subcategory
- `ClearAllButton` to reset that parent's subcategory selections

Callbacks use `toggleParent`, `toggleSubcategory`, `clearParentSubcategories` from the shared helpers.

### Props changes to `CollectionPartsControlBar`

Replace `categoryOptions: string[]` with:

- `parentOptions: string[]` — sorted parent category names
- `subcategoriesByParent: Record<string, string[]>` — subcategory data

The `filter` prop type change (`categories` → `parents` + `subcategoriesByParent`) flows through naturally.

**Update `categoryLabel`** in the control bar: rewrite from referencing `filter.categories` to `filter.parents`. Show "Category" when no parents selected, the parent name when one is selected, or "Category (N)" when multiple are selected.

**localStorage migration**: the `useCollectionPartsControls` hook persists filter state. The old shape has `categories: []`; the new shape has `parents: []` and `subcategoriesByParent: {}`. Since the hook spreads `{ ...DEFAULT_PARTS_CONTROLS, ...stored }`, old stored data won't crash (new defaults fill in), but the stale `categories` key will linger harmlessly. No explicit migration needed — silent reset is acceptable.

### Files Changed

| File                                                            | Change                                                                                            |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `app/components/collection/parts/types.ts`                      | Add `categoryName` to `CollectionPart`; update `PartsFilter` and `DEFAULT_PARTS_CONTROLS`         |
| `app/components/collection/parts/aggregation.ts`                | Populate `categoryName` from `partMeta` in `buildCollectionPart`                                  |
| `app/components/collection/parts/sorting.ts`                    | Update `filterByCriteria` for parent+subcategory logic; add `extractSubcategoriesByParent` helper |
| `app/components/collection/parts/CollectionPartsView.tsx`       | Compute `subcategoriesByParent`; pass to control bar                                              |
| `app/components/collection/parts/CollectionPartsControlBar.tsx` | Replace category `SingleSelectList` with `CollectionCategoryPanel`; update props                  |
| `app/components/collection/parts/CollectionCategoryPanel.tsx`   | **New** — drill-down category panel                                                               |
| `app/components/ui/categoryFilterHelpers.ts`                    | **Moved** from `set/controls/`; generalized type                                                  |
| `app/components/set/controls/SidebarCategoryPanel.tsx`          | Update import path for helpers                                                                    |
| `app/components/set/controls/categoryFilterHelpers.ts`          | **Deleted** (moved to `ui/`)                                                                      |
| `app/hooks/useCollectionPartsControls.ts`                       | Update for new filter shape (if it references `categories`)                                       |
| `app/components/collection/parts/__tests__/sorting.test.ts`     | Update tests for new filter shape                                                                 |
| `app/components/collection/parts/__tests__/aggregation.test.ts` | Add `categoryName` to test fixtures                                                               |

### What Stays Unchanged

- `SidebarCategoryPanel` stays in `set/controls/` (set-specific sidebar layout)
- `SidebarColorPanel` stays in `set/controls/` (no hierarchy needed for colors)
- Color multi-select in collection parts stays as-is (flat list, already working)
- `useControlBarDropdown` — no changes needed
- Search and user collection control bars — unaffected
