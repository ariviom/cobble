# Progress

## What Works

- Next.js app scaffold (App Router, TypeScript) with global layout and styles.
- React Query provider wired via `components/providers/react-query-provider`.
- Rebrickable proxy Route Handlers:
  - `app/api/search/route.ts` (set search)
  - `app/api/inventory/route.ts` (set inventory)
- `lib/rebrickable.ts` wrapper with `searchSets`, `getSetInventory`, `getSetSummary` using server-only env and caching.
- Set search UI with debounce and result linking (`app/components/search`).
- Search bar label moved above input; inline clear “x” appears when text entered with touch-friendly target.
- Set page `app/sets/[setNumber]/page.tsx` renders inventory for a set using `SetPageClient`.
- Virtualized inventory table with images, per-row owned input, bulk actions, missing totals, and a refactored `useInventoryViewModel` hook that centralizes sorting/filtering/grouping.
- Inventory controls support sorting by name/color/size/category, grouping, and filters for All/Missing/Owned, parent categories, and colors.
- Owned-quantity persistence via `app/store/owned.ts` with in-memory cache, versioned localStorage key, and debounced writes.
- Export modal (`ExportModal`) supports Rebrickable CSV and BrickLink wanted list CSV generation, including basic unmapped-row reporting.
- Optional BrickLink pricing via `/api/prices/bricklink` and `useInventoryPrices`, now triggered manually per set through a "Get prices" action in the set top bar, with per-part BrickLink links and aggregate totals/ranges.

## What's Left to Build

- Simple auth and user accounts (Supabase), with a path to sync local state (owned, pinned, user sets) to the backend.
- Error states and retries for search and inventory requests are partially implemented; error codes are normalized via `AppError`, but the UI still uses mostly generic messages.
- Tests for export generators (Rebrickable + BrickLink) and for Rebrickable client retry/backoff behavior.

## Current Status

Implementation in progress with core data flow working via server proxies and virtualized table. Owned persistence, sorting, filters, exports, and manual pricing are implemented; remaining to reach the next milestone are auth/Supabase integration and hardening of exports and error handling.

## Known Issues / Risks

- Rebrickable rate limits or incomplete inventories for very old sets.
- ID/color mapping mismatches between Rebrickable and BrickLink affecting CSV exports.
- Large inventories (>1000 parts) may require careful virtualization and memoization to stay fast.
- CSV specs must exactly match marketplace requirements to import successfully.
- Search UI fetch handler needs a small JSON parsing fix before returning results.
 - Debounced owned writes delay flush by ~500ms; acceptable trade-off for UI responsiveness.
