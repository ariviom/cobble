# Collection Parts Tab — Design Spec

**Date:** 2026-03-11
**Status:** Draft

## Overview

Build out the Parts tab on the collection route (`/collection/[handle]?type=parts`) to display a user's aggregated parts inventory across owned sets and loose parts. Includes filter/sort/export controls, a "Missing" view grouped by set, part detail modal, and a `/parts/[partId]` detail page.

Follows existing UI patterns from the set inventory view and collection control bar — no new design language.

## Part Sources

| Source        | Storage                                                            | Editable from Parts Tab?        |
| ------------- | ------------------------------------------------------------------ | ------------------------------- |
| Set parts     | `localOwned` in IndexedDB, keyed by `setNumber + inventoryKey`     | No (derived from set inventory) |
| Loose parts   | `localLooseParts` in IndexedDB, keyed by `partNum + colorId`       | Yes (via modal and detail page) |
| Missing parts | Computed: `catalogSetParts.quantityRequired - localOwned.quantity` | No (derived)                    |

## Data Model

### Scope

The parts tab displays **regular parts only** — not minifig parent rows (`fig:*` keys) or unmatched BrickLink subparts (`bl:*` keys). Minifigs have their own collection tab. If a set inventory contains minifig subparts (the individual pieces of a minifig), those are regular parts and ARE included.

### Aggregated Part Shape

```typescript
type CollectionPart = {
  // Identity — regular parts only (no fig: or bl: prefix keys)
  partNum: string;
  colorId: number;
  canonicalKey: string; // "{rbPartId}:{rbColorId}" (regular parts only)

  // Display
  partName: string;
  colorName: string;
  imageUrl: string | null;
  parentCategory: string | null;

  // Quantities
  ownedFromSets: number; // Sum across all owned sets
  looseQuantity: number; // From loose parts store
  totalOwned: number; // ownedFromSets + looseQuantity

  // Set breakdown (for modal/detail page)
  setSources: Array<{
    setNumber: string;
    setName: string;
    quantityInSet: number; // Required for this set
    quantityOwned: number; // User's owned count for this set
  }>;

  // Missing context (for Missing filter)
  missingFromSets: Array<{
    setNumber: string;
    setName: string;
    quantityMissing: number; // required - owned for this set
    quantityRequired: number;
  }>;
};
```

### Aggregation Hook: `useCollectionParts`

- Respects the "Sync parts from sets" account preference — when disabled, `ownedFromSets` is 0 for all parts, and set-sourced parts are excluded from the view
- Aggregates by `partNum:colorId` across all owned sets
- Excludes minifig parent rows (`fig:*` keys) and unmatched BL subparts (`bl:*` keys) during aggregation
- Returns full `CollectionPart[]` array, memoized
- Filter/sort/paginate happens downstream in a view-model hook

**Aggregation strategy — two paths:**

**Path A: All / Owned / Loose filters** (collection-scoped)

1. Get owned set numbers from `useUserSetsStore` (sets marked `owned: true`)
2. Load `catalogSetParts` rows for those set numbers only (batched, uses `[setNumber+inventoryKey]` index)
3. Build a lookup map: `Map<canonicalKey, CatalogSetPart[]>` from catalog rows, skipping `fig:*` and `bl:*` keyed entries
4. Read `localOwned` entries for each owned set, join against the catalog map to get part metadata (name, color, image, category)
5. Merge `localLooseParts` into the same map by `partNum:colorId`
6. Produce final `CollectionPart[]` with aggregated quantities

**Path B: Missing filter** (all-sets-with-owned-data scope)

1. Enumerate ALL set numbers with owned data: `db.localOwned.orderBy('setNumber').uniqueKeys()` — includes non-owned, non-collection sets
2. Load `catalogSetParts` rows for all enumerated set numbers
3. Same steps 3-6 as Path A, but computing `missingFromSets` (required - owned per set) instead of aggregated totals
4. Only include parts where `quantityMissing > 0` for at least one set

### Memory Profile

With ~80 sets averaging ~300 unique part/color combos, heavy cross-set overlap reduces to ~5k-15k unique `CollectionPart` rows. At ~200-500 bytes each, this is 3-7MB — well within comfort for in-memory state. The 50k figure (total pieces) is the sum of quantities, not unique rows.

## Parts Tab View

### Layout

Follows existing collection tab pattern (`UserCollectionOverview`):

- **Control bar**: Sticky, horizontally scrolling. Uses existing `ControlBar` + `DropdownTrigger` / `DropdownPanelFrame` components. Replaces `CollectionControlBar` when `collectionType === 'parts'`.
- **Summary line**: Shows counts (e.g., "12,847 unique parts · 49,312 total pieces")
- **Parts grid**: Uses same grid layout as set inventory (`grid-cols-*` responsive). Supports grid, list, and thumbnail display modes.
- **Pagination**: Load all data into memory, paginate rendered output at ~50-100 items per page. Top and bottom pagination controls. Preserves all display modes without virtualization.

### Part Cards

Adapted from `InventoryItem` pattern:

- Part image with neutral ring (reuse `OptimizedImage` + `ring-1 ring-foreground-accent` styling). No green "complete" ring — that pattern is specific to set inventory where parts are marked found against a required count. The collection parts tab is an inventory view, not a completion tracker.
- Part name (truncated)
- Part ID + color name metadata line
- **Quantity metadata**: `Owned: X | Loose: Y` displayed below part name (replaces the `owned/required` ratio from set inventory)
- **Selection checkbox**: Top-left corner of card. Gated behind Plus entitlement (see Entitlements section).
- Click card → opens part modal
- More dropdown: BrickLink, Rebrickable, More info (links to detail page)

No `OwnedQuantityControl` on the card itself — quantity editing happens in the modal (for loose parts) or on the set inventory page (for set parts).

### Filter Controls

**Source filter** (replaces the set inventory's "All / Missing / Owned" display filter):

| Option    | Behavior                                                                      |
| --------- | ----------------------------------------------------------------------------- |
| All Parts | Shows all parts (set-sourced + loose), flat grid. Default.                    |
| Owned     | Shows only parts with `ownedFromSets > 0` (from owned sets with sync enabled) |
| Loose     | Shows only parts with `looseQuantity > 0`                                     |
| Missing   | Shows missing parts grouped by set (see Missing Parts View section)           |

**Category filter**: Reuses existing `SidebarCategoryPanel` pattern with `parentCategory` options.

**Color filter**: Reuses existing `SidebarColorPanel` pattern.

**Sort options**: Name, Color, Category, Quantity (total owned), with asc/desc toggle.

**Group by**: None, Color, Category (same as set inventory, minus size/rarity).

**View mode**: List, Grid, Thumbnail (same as set inventory).

### State Persistence

- **Filter/sort/view state**: Persisted to localStorage. Returning to the parts tab restores the user's last filter, sort, view mode, and page number.
- **Selection state**: Persisted to localStorage. Selections survive navigation to part detail pages and back. Key: per-user, keyed by canonical part key.
- **Clear Selections**: Button always visible in control bar, disabled when no selections. Triggers confirmation modal before clearing.

## Missing Parts View

Activated when the user selects "Missing" from the source filter. This is a special grouped view.

### Data Source

Missing parts come from ANY set where the user has `localOwned` data — not just owned sets, not just collection sets. If a user searched for a set, opened its inventory, and marked some parts, those missing parts appear here.

**Enumeration strategy**: Uses Path B from the aggregation hook (see Data Model section). `db.localOwned.orderBy('setNumber').uniqueKeys()` returns all set numbers with any owned data — an efficient index scan on the existing `setNumber` index. For each set number, load catalog parts and compute missing = required - owned.

**Sync prerequisite**: For Plus users with cloud sync enabled, the Missing view should ensure `localOwned` is up-to-date before computing missing parts. Trigger a sync pull (via `SyncWorker.performSync()`) on initial load of the Missing filter to reconcile any pending cloud changes before displaying results. This prevents stale local data from showing incorrect missing counts.

### Grouped by Set

- Each set with missing parts gets a collapsible section
- **Set header**: Set thumbnail, set name, set number, missing count badge, expand/collapse chevron
- **Tri-state checkbox** on set header:
  - Unchecked: no parts from this set are selected for export
  - Partial (dash): some parts from this set are selected
  - Checked: all parts from this set are selected
  - Clicking cycles: none → all → none
- **Expanded**: Shows part cards in a grid within the section
- **Collapsed**: Hides part cards, only shows set header
- Default state: all expanded

### Missing Part Cards

Same as standard part cards but:

- No `Owned: X | Loose: Y` metadata — replaced with **"Need X"** count (quantity missing for this specific set)
- The "Need X" value is the export quantity when selected
- Red ring on part image (missing indicator, matching set inventory pattern)

### Pagination

Pagination applies across all set groups. A page break can occur mid-set-group. Set headers re-render at the top of a new page if their group continues.

## Selection & Export

### Selection

- Checkboxes appear on all part cards (all filter modes, not just Missing)
- Selection is independent from filtering — selecting parts in one filter, switching filters, and selecting more parts accumulates selections
- **Export button** in control bar shows running count badge (e.g., "Export (12)")
- **Clear Selections** button always visible in control bar, disabled when no selections. Triggers confirmation modal before clearing.

### Export Quantity

- In **Missing** view: export quantity = the missing count for that set (`quantityRequired - quantityOwned`)
- In **other views**: selecting a part defaults export quantity to 1. A small inline numeric input appears on the card (or in the export modal) to adjust quantity.
- Parts selected from multiple sets in Missing view export as separate rows (one per set occurrence)

### Export Modal

Reuses existing `ExportModal` pattern. Same three formats:

- Rebrickable CSV
- BrickLink Wanted List CSV
- LEGO Pick-a-Brick CSV — **note**: only valid for parts with a LEGO element ID (`elementId` field). Parts without element IDs are silently excluded from PAB exports. The export summary should warn: "X of Y selected parts have element IDs for Pick-a-Brick"

Shows summary: "Exporting X parts (Y total pieces)" before download.

### Entitlements

The **list builder** (selection + custom export) is Plus only. This is distinct from basic set-level exports (which remain free for all tiers per the existing "exports unlimited" decision in the backlog). The list builder is a new feature — curating custom cross-set parts lists for targeted purchasing — not a restriction on existing export functionality.

- Free/guest users see disabled checkboxes (greyed out)
- Clicking a checkbox or the Export button triggers the `UpgradeModal` with the relevant feature gate
- New feature flag: `list_builder.enabled` (Plus tier)
- Basic per-set "export all missing" from the set inventory view remains free

## Part Modal

Triggered by clicking a part card. Follows existing `InventoryItemModal` pattern:

- **Hero image**: Full-width part image
- **Identity bar**: Part name, part ID, color name
- **Quantity summary**:
  - Total owned: X (from Y sets + Z loose)
  - Per-set breakdown table (if part appears in multiple sets): set name, set number, owned/required
- **Loose quantity editor**: `OwnedQuantityControl` component (reuse from set inventory), editing `localLooseParts` for this part/color. No upper bound (unlike set inventory where it's capped at required).
- **Links**: BrickLink, Rebrickable, "View Details" → navigates to `/parts/[partId]`
- **Price**: Show BrickLink price if available (same on-demand fetch pattern as set inventory modal)

## Part Detail Page

New route: `/parts/[partNum]`

### Server Component

- Fetches part metadata from catalog (`rb_parts` table)
- Renders SEO metadata (title, description, OG tags)
- Sitemap generation is out of scope for this plan

### Page Content

- Part hero image (large)
- Part name, part number, available colors
- **For authenticated users with this part in their inventory**:
  - Owned quantity summary (from sets + loose)
  - Per-set breakdown with links to each set's inventory page
  - Loose quantity editor
- **For all users**:
  - **Set count**: "Appears in X sets" — sourced from `rb_part_rarity.set_count` (already precomputed per `part_num + color_id` during catalog ingestion, also cached in `catalogSetParts.setCount` in IndexedDB). This is an O(1) lookup, no additional query needed.
  - Sets containing this part (query `mv_set_parts` by `part_num + color_id`, which has an index on `(part_num, color_id)`)
  - BrickLink + Rebrickable external links
  - Price guide (if available)

### Color Handling

Parts come in multiple colors. The detail page shows the part generically, with a color selector or color grid showing which colors the user owns. Clicking a color filters the set breakdown and quantities to that specific `partNum:colorId`.

## Account Settings

### "Sync parts from sets" Toggle

New preference in account settings, similar to the existing minifig sync toggle:

- **Enabled (default)**: Parts from owned sets are included in the collection parts tab. The `ownedFromSets` quantity is calculated from set inventories.
- **Disabled**: Only loose parts appear in the parts tab (under All/Loose filters). Set-sourced parts are excluded. Missing view still works (it queries sets with owned data regardless of this toggle).

Storage: User preferences table (same pattern as minifig sync preference).

### Import Checkboxes

When importing from Rebrickable or BrickScan formats (existing import flow in account settings), ensure there are checkboxes for:

- Import sets (existing)
- Import loose parts (needs verification — may already exist in the import flow)

## Public Collection View

When a user's collection is public, the parts tab shows the full parts inventory (read-only, no editing controls, no selection/export).

### Data Access

Public view queries `user_parts_inventory` (server-side aggregated table maintained by trigger) rather than client-side aggregation from IndexedDB. This requires a new RLS policy since the current policy only allows `auth.uid() = user_id`:

```sql
create policy "Public profiles can view parts inventory"
  on user_parts_inventory for select
  using (exists (
    select 1 from user_profiles
    where user_profiles.user_id = user_parts_inventory.user_id
    and user_profiles.collections_public = true
  ));
```

**Loose parts caveat**: The `user_parts_inventory` trigger only fires on `user_set_parts` changes. The `loose_quantity` column is managed separately and may lag behind `localLooseParts` for users who haven't synced. For the public view, loose quantities reflect the last-synced state, not real-time local data. This is acceptable — public profiles show synced state by design. Note: if the trigger deletes a row (set quantity drops to 0, loose_quantity is also 0) and a set-part is later re-added, the new row is inserted with `loose_quantity = 0` — any prior loose data for that part/color is lost. This is an existing schema limitation, not introduced by this feature.

## Performance

| Concern        | Strategy                                                                                |
| -------------- | --------------------------------------------------------------------------------------- |
| Memory         | ~5-15k unique parts in memory, 3-7MB — no issue                                         |
| DOM            | Pagination at 50-100 items/page, no virtualization needed                               |
| Aggregation    | Iterate ~80 sets × ~300 parts, group by canonical key — <100ms                          |
| Re-renders     | Memoized part cards with custom `areEqual` comparator (same pattern as `InventoryItem`) |
| Filter/sort    | In-memory on full dataset, instant                                                      |
| Deferred state | `useDeferredValue` for non-critical derivations (counts, filter option lists)           |

## Out of Scope

- Adding loose parts directly from the parts tab (search-to-add). Deferred to future work.
- Sitemap generation for part pages.
- Minifig detail page refactoring (noted as related — clicking minifig in collection could open modal instead of navigating directly to detail page, but this is a separate task).
