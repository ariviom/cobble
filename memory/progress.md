# Progress

## What Works

- Next.js app scaffold (App Router, TypeScript) with global layout and styles.
- React Query provider wired via `components/providers/react-query-provider`.
- Rebrickable proxy Route Handlers:
  - `app/api/search/route.ts` (set search)
  - `app/api/inventory/route.ts` (set inventory)
- `lib/rebrickable.ts` wrapper with `searchSets`, `getSetInventory`, `getSetSummary` using server-only env and caching.
- Set search UI with debounce and result linking (`components/search/set-search.tsx`).
- Search bar label moved above input; inline clear “x” appears when text entered with touch-friendly target.
- Set page `app/set/[setNumber]/page.tsx` renders inventory for a set.
- Virtualized inventory table with images, per-row owned input, bulk actions, and total missing (`components/set/inventory-table.tsx`).
- Tabbed filters for inventory: All (default), Missing, Owned, and per-category tabs with horizontal scroll and arrow controls.

## What's Left to Build

- Complete owned-quantity persistence: implement `store/owned.ts` (`storageKey`, `write`) and maintain an in-memory map to avoid repeated `localStorage` reads.
- Sorting for inventory table columns (name, color, size). (Required/Owned/Missing handled by filters.)
- Export generators: Rebrickable CSV and BrickLink CSV (wanted list) named "{setNumber} — {setName} — mvp"; add ID/color mapping module.
- Persist last viewed set in `localStorage` and restore on home.
- Error states and retries for search and inventory requests; surface query errors in UI.

## Current Status

Implementation in progress with core data flow working via server proxies and virtualized table. Needs owned persistence, sorting, and export features to reach MVP.

## Known Issues / Risks

- Rebrickable rate limits or incomplete inventories for very old sets.
- ID/color mapping mismatches between Rebrickable and BrickLink affecting CSV exports.
- Large inventories (>1000 parts) may require careful virtualization and memoization to stay fast.
- CSV specs must exactly match marketplace requirements to import successfully.
- `store/owned.ts` persistence is incomplete; owned inputs won't persist yet.
- Search UI fetch handler needs a small JSON parsing fix before returning results.
