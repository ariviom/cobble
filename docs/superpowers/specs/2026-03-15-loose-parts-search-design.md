# Loose Parts Search & Increment

## Overview

Add part search to the search route, and enable loose part quantity management via the part modal on both search and identify routes. Also includes a minor UX fix for minifig search results (theme label positioning).

## 1. CollectionPartModal Redesign

### Current State

`CollectionPartModal` accepts a `CollectionPart` with a fixed `colorId`. No color switching. Tightly coupled to collection context.

### Changes

Generalize the modal props to support three caller contexts:

- **Collection route** — full `CollectionPart` data, color pre-selected (entry is one card per part+color combo, unchanged)
- **Search route** — minimal part data + available colors from search result, default color pre-selected
- **Identify route** — identified part data + available colors, identified color pre-selected

**New props interface:**

```ts
type PartModalProps = {
  partNum: string;
  partName: string;
  imageUrl: string | null;
  colorId: number; // pre-selected color (always resolved — see "Color Selection on Open")
  colorName: string;
  availableColors: Array<{
    // all colors this part comes in
    colorId: number;
    colorName: string;
    imageUrl: string | null;
  }>;
  // Optional collection enrichment (omitted in search/identify contexts)
  ownedFromSets?: number;
  setSources?: CollectionPartSetSource[];
  onClose: () => void;
  onLooseQuantityChange: () => void;
};
```

### Color Selection on Open

`colorId` is always a resolved number — never null. Callers are responsible for providing a valid default:

- **Collection route** — uses the card's `colorId` (same as today)
- **Search route** — uses the default display color (white preferred, else first available)
- **Identify route** — uses the identified `selectedColorId`

This ensures the Rebrickable URL, BrickLink URL, loose quantity editor, and hero image are all valid immediately on open with no "no color selected" empty state.

### Modal Layout (top to bottom)

1. **Hero image** — updates when selected color changes
2. **Identity bar** — part number + selected color name
3. **Color picker** — rounded thumbnails in a `flex flex-wrap` row. Each thumbnail shows the part in that color. Selected color gets a ring/border highlight. Always visible when `availableColors` has entries. When `availableColors` is empty (e.g., newly ingested part), the color picker row is hidden and the modal shows only the pre-selected color.
4. **Quantity summary** — "Total owned: N" with breakdown (from sets + loose). When no collection context, only shows loose count.
5. **Per-set breakdown** — table shown only when `setSources.length > 1` (same as today)
6. **Loose quantity editor** — `LooseQuantityControl` (unchanged). Operates on the currently selected `partNum + colorId` pair.
7. **External links footer** — BrickLink, Rebrickable, View Details

### Color Switching Behavior

When the user taps a different color thumbnail:

- Hero image updates to that color's `imageUrl`
- Identity bar updates color name
- Modal internally reads loose quantity from IndexedDB for `(partNum, newColorId)` via a `useEffect` on `selectedColorId` that calls `getLoosePart(partNum, colorId)` (new single-key read — see section 6)
- Quantity summary updates
- Persistence is per `partNum + colorId` (already how `localLooseParts` works)

**Parent notification:** `onLooseQuantityChange` stays as-is: a void signal with no color argument. The modal manages its own loose quantity state internally and does not depend on the parent. Parents that display per-color loose quantities should be aware that the user may have edited a _different_ color than the one originally opened — `onLooseQuantityChange` means "some loose quantity changed for this part; refresh if needed." In practice, search/identify callers don't display per-color loose counts, and the collection caller opens per-color cards so the re-fetch on close is sufficient.

### Minifigs

When the identified part is a minifig, the thumbnail in `IdentifyResultCard` is **not clickable**. Minifigs are tracked separately (minifig ownership, not loose parts) and don't have meaningful color variants. The loose parts modal is only for standard parts.

## 2. Part Search Backend

### New API Route

`GET /api/search/parts?q=<query>&page=<n>&pageSize=<n>`

Allowed page sizes: `[20, 50, 100]`. Server rejects other values and defaults to 20. Note: the set search API route (`/api/search`) currently allows `[20, 40, 60, 80, 100]` while the client-side `allowedPageSizes` in `SearchResults.tsx` uses `[20, 50, 100]`. Standardize both set and part search APIs to accept `[20, 50, 100]` to match the client-side options and avoid silent defaults when switching between search types (shared `pageSize` URL param).

### Search Service: `searchPartsPage()`

- **Sanitize first:** Apply the same `sanitizeSearchQuery()` logic used by set search (escape `%`, `_`, `\` for SQL LIKE safety)
- **Dimension normalization second:** After sanitization, normalize dimension patterns by replacing `(\d)\s*[xX]\s*(\d)` with `$1 x $2` so "1x1", "1X2", and "1 x 1" all match the canonical "1 x 1" format in the DB. Also handle multi-dimensional patterns like "2x2x3" → "2 x 2 x 3".
- Query `rb_parts` with `ilike` on `name` and `part_num`
- Results are unique by `part_num`
- For each result part, fetch available colors from `rb_inventory_parts` (distinct `color_id` + `img_url` per part) joined with `rb_colors` for names
- Default display thumbnail: prefer white/light gray color image, else first available color
- Paginate results server-side

### Response Shape

```ts
type PartSearchResult = {
  partNum: string;
  name: string;
  imageUrl: string | null; // default color thumbnail
  categoryName: string | null;
  colors: Array<{
    colorId: number;
    colorName: string;
    imageUrl: string | null;
  }>;
};

type PartSearchPage = {
  results: PartSearchResult[];
  nextPage: number | null;
};
```

### Query Pattern

Uses `getCatalogReadClient()` (anon-readable). Parallel queries for name and part_num matches, merge and deduplicate. Batch color lookups with `.in()` at ~200 batch size.

## 3. Search Route UI Changes

### SearchBar

- Add `'part'` to `SearchType` union: `'set' | 'minifig' | 'part'`
- Add "Parts" option to the `<Select>` dropdown
- Placeholder updates to "Name or part number" when type is `'part'`
- **`popstate` handler** (line ~40): Update from binary `minifig`/`set` check to three-way: `'minifig' | 'part' | 'set'`
- **`onChange` handler** (line ~125): Same — handle all three values from the `<Select>`
- URL serialization: persist `type=part` in URL params (same pattern as `type=minifig`)

### SearchResults

- **`parseTypeParam`** (line ~130): Update to recognize `'part'` as a valid `SearchType` (currently only checks for `'minifig'`, defaulting everything else to `'set'`)
- New branch for `searchType === 'part'`:
  - `useInfiniteQuery` hitting `/api/search/parts`
  - Results rendered in a grid (same layout as sets/minifigs)
  - Page size toggle ("Show 20/50/100") — shared `pageSize` URL param, same as set search
  - No other controls for v1
  - Each card: `PartSearchResultCard` — part thumbnail (default color), part name, part number
  - Clicking a card opens `CollectionPartModal` with available colors from the search result, default color pre-selected

### New Component: `PartSearchResultCard`

Card showing:

- Part thumbnail image (default color)
- Part name (line-clamped)
- Part number
- Clickable — opens the modal

## 4. Identify Route Changes

### IdentifyResultCard

- The part thumbnail (128x128 image area) becomes a clickable button **for non-minifig parts only**
- Clicking opens `CollectionPartModal` with:
  - Part data from identify result (`partNum`, `name`, `imageUrl`, `colorName`)
  - Available colors: the existing `colorOptions` array, extended to include per-color `imageUrl` (fetched from `rb_inventory_parts` — see below)
  - Pre-selected color: the identified color (`selectedColorId`)
- Visual affordance on thumbnail to indicate clickability (cursor, subtle hover effect)

### Color Image URLs for Identify

The upstream `PartAvailableColor` type (in `app/lib/rebrickable/types.ts`) already carries `partImageUrl: string | null`. The data is available from the API — it's being **stripped** in `IdentifyClient.tsx` where `availableColors` is narrowed to `Array<{ id: number; name: string }>` at multiple call sites (lines ~363, ~454, ~564, ~653) and in the `colors` state type.

**Fix:** Widen the `colors` state type in `IdentifyClient.tsx` to `Array<{ id: number; name: string; partImageUrl: string | null }>` and update each `.map()` call site to preserve `partImageUrl`. Also update the `/api/identify/sets` route handler response typing to include `partImageUrl` in the `availableColors` array.

### IdentifyClient

- Add modal open/close state (`selectedPartForModal` or similar)
- Pass modal open handler down to `IdentifyResultCard`
- For minifigs: thumbnail is not clickable, no modal

### Existing Color Dropdown

The color dropdown on the result card stays as-is (it filters the set list below). The modal's color picker is independent — it controls which color's loose quantity is being edited.

## 5. Minifig Search Result Theme Label

### Current

In `MinifigSearchResultItem`, the theme name/path appears below the part count in a small `div`.

### Change

Move the theme label above the minifig name so the visual hierarchy is: theme (small muted text) > name (bold) > ID + parts count.

## 6. loosePartsStore Addition

### Current

`loosePartsStore.ts` exports bulk operations (`getAllLooseParts`, `bulkUpsertLooseParts`, etc.) but no single-key read.

### Addition

Add `getLoosePart(partNum: string, colorId: number): Promise<LocalLoosePart | undefined>` — a single-key read using the compound index `[partNum+colorId]`. Used by the modal on color switch to load the loose quantity for the newly selected color without scanning the full table.

Must follow the same guard-and-catch pattern as existing store functions: check `isIndexedDBAvailable()` first (return `undefined` if not), wrap in `try/catch` with `console.warn` on error. This is called in a `useEffect` on every color change, so it must be safe in SSR and private browsing contexts.

## Files Summary

### Modified

| File                                                      | Change                                                                                                  |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `app/types/search.ts`                                     | Add `'part'` to `SearchType`, add `PartSearchResult`, `PartSearchPage`                                  |
| `app/components/collection/parts/CollectionPartModal.tsx` | Generalize props, add color picker row, support color switching                                         |
| `app/components/search/SearchBar.tsx`                     | Add "Parts" option, update placeholder/aria, fix `popstate` and `onChange` handlers for three-way type  |
| `app/components/search/SearchResults.tsx`                 | Update `parseTypeParam` for `'part'`, add part search branch, query, grid, page size, modal integration |
| `app/components/identify/IdentifyResultCard.tsx`          | Make thumbnail clickable (non-minifig only), add modal trigger                                          |
| `app/identify/IdentifyClient.tsx`                         | Add modal state, wire up open/close, extend color options to include `imageUrl`                         |
| `app/lib/services/search.ts`                              | Add `searchPartsPage()` with sanitization + dimension normalization                                     |
| `app/lib/localDb/loosePartsStore.ts`                      | Add `getLoosePart(partNum, colorId)` single-key read                                                    |
| `app/components/minifig/MinifigSearchResultItem.tsx`      | Move theme label above name                                                                             |
| `app/api/search/route.ts`                                 | Standardize allowed page sizes to `[20, 50, 100]`                                                       |
| `app/api/identify/sets/route.ts`                          | Include `partImageUrl` in `availableColors` response                                                    |

### New

| File                                             | Purpose                                |
| ------------------------------------------------ | -------------------------------------- |
| `app/api/search/parts/route.ts`                  | Part search API route handler          |
| `app/components/search/PartSearchResultCard.tsx` | Card component for part search results |

### Unchanged

- `app/lib/localDb/schema.ts` — no schema changes
- `app/api/sync/route.ts` — sync queue unchanged
- Collection route entry points — still one card per part+color combo
