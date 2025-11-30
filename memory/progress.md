# Progress

## Completed

- Next.js app scaffold (App Router, TypeScript) with global layout and styles.
- React Query provider wired via `components/providers/react-query-provider`.
- Rebrickable-backed search and inventory APIs:
  - `app/api/search/route.ts` (set search).
  - `app/api/inventory/route.ts` (set inventory).
- `lib/rebrickable.ts` wrapper with `searchSets`, `getSetInventory`, `getSetSummary` using server-only env and caching.
- Set search UI with debounce and result linking (`app/components/search`).
- Search bar label moved above input; inline clear “x” appears when text is entered, with a touch-friendly target.
- Set page `app/sets/[setNumber]/page.tsx` renders inventory for a set using `SetPageClient`.
- Virtualized inventory table with images, per-row owned input, bulk actions, missing totals, and a refactored `useInventoryViewModel` hook that centralizes sorting/filtering/grouping.
- Inventory controls support sorting by name/color/size/category, grouping, and filters for All/Missing/Owned, parent categories, and colors.
- Owned-quantity persistence via `app/store/owned.ts` with in-memory cache, versioned `localStorage` key, and debounced writes.
- Export modal (`ExportModal`) supports Rebrickable CSV and BrickLink wanted list CSV generation, including basic unmapped-row reporting.
- Optional BrickLink pricing via `/api/prices/bricklink`, `/api/prices/bricklink-set`, and `useInventoryPrices`, triggered per-row and at the set level, with per-part BrickLink links and aggregate totals/ranges.
- Minifig RB↔BL integration:
  - `scripts/minifig-mapping-core.ts` centralizes RB↔BL minifig matching logic, using:
    - Normalized-name equality within a set.
    - Jaccard similarity with tuned thresholds.
    - A greedy fallback pass when RB/BL naming diverges but counts match.
  - Bulk mapping scripts:
    - `npm run build:minifig-mappings:user` for sets in `user_sets`, capped by `MINIFIG_MAPPING_MAX_SETS` (default 2500).
    - `npm run build:minifig-mappings:all` for `rb_sets`, same cap.
  - Supabase tables:
    - `bl_set_minifigs` now stores `set_num`, BrickLink `minifig_no`, RB `rb_fig_id`, and sync timestamps.
    - `bl_sets.minifig_sync_status` tracks whether a set’s minifigs have been successfully synced from BrickLink.
    - `bricklink_minifig_mappings` holds optional global RB→BL mappings as a secondary cache.
  - Runtime mapping:
    - `app/lib/minifigMapping.ts` exposes:
      - `mapSetRebrickableFigsToBrickLink` (per-set lookup from `bl_set_minifigs`).
      - `mapSetRebrickableFigsToBrickLinkOnDemand` (per-set lookup that, when mappings are missing and `minifig_sync_status` ≠ 'ok', invokes `processSetForMinifigMapping` and re-reads the table).
      - `mapRebrickableFigToBrickLink` as a global fallback.
    - `app/lib/services/inventory.ts`:
      - Enriches minifig parent rows with `bricklinkFigId` using the on-demand per-set mapping first, then the global mapping.
      - Ensures all minifigs in user sets (except a small number of heuristic edge cases) have BrickLink IDs in the UI.
    - `InventoryItem.tsx`:
      - Displays BrickLink ID when available and uses it to construct BrickLink URLs for minifigs.
      - Falls back to Rebrickable ID when mapping is genuinely missing.

## Planned / In Progress

- Supabase auth and user accounts, with a path to sync local state (owned, pinned, user sets) to the backend.
- Supabase-backed persistence for user sets/status, collections, and per-set owned parts while keeping anonymous users fully functional.
- Hardening of error states and retries for search and inventory requests; surface normalized `AppError` codes in the UI instead of generic messages.
- Tests for CSV export generators (Rebrickable + BrickLink) and for Rebrickable client retry/backoff behavior.

### Improvement backlog (2025-11-26 review)

- Extract sub-pipelines from the Identify backend into smaller pure helpers (RB candidate resolution, BL supersets fallback, BL-only fallback) and add a per-request budget to cap external calls.
- Improve Identify page UX with clearer sub-states (e.g., “Identifying…”, “Finding sets…”, “Using BrickLink-only data”) and consider debouncing rapid candidate/color changes.
- Refactor Supabase-owned state into a lower-level owned-persistence service plus a higher-level migration coordinator hook, and add lightweight telemetry/logging for Supabase write failures.
- Centralize non-blocking error surfacing (e.g., toasts) for Supabase-backed flows like collection create/toggle and set status updates.
- Upgrade the modal implementation to full accessibility: focus trap, focus restoration, inert background, and robust `aria-labelledby` / `aria-describedby`.
- Tighten accessibility and keyboard support across complex controls (inventory filters, color pickers, identify chips): ensure proper roles, key handling, and ARIA labels.
- Add defensive rate limiting and/or feature flags for Identify and pricing endpoints to prevent overuse of BrickLink/Rebrickable (per-IP and/or per-user limits).
- Cache “identify → sets” resolutions in Supabase keyed by normalized part/color identifiers to avoid repeating heavy Identify pipelines.
- Introduce structured logging and basic metrics (per-route latency/error rates, cache hit/miss, external API throttling) to support higher scale and easier debugging.
- Enhance auth lifecycle handling by subscribing to Supabase `auth.onAuthStateChange` so hooks depending on `useSupabaseUser` react to in-session login/logout.
- Expand automated tests around Identify and pricing flows (mocked RB/BL/Brickognize) and add end-to-end validation for CSV exports against Rebrickable/BrickLink import rules.

## Status

Implementation is in progress: core data flow via server proxies and virtualized table is working, and owned persistence, sorting, filters, exports, and manual pricing are implemented. The next major milestone is Supabase auth/persistence and hardening of Identify, exports, and error handling.

## Known Issues / Risks

- Rebrickable rate limits or incomplete inventories for very old sets.
- ID/color mapping mismatches between Rebrickable and BrickLink affecting CSV exports.
- Large inventories (>1000 parts) may require careful virtualization and memoization to stay fast.
- CSV specs must exactly match marketplace requirements to import successfully.
- Debounced owned writes delay flush by ~500ms; acceptable trade-off for UI responsiveness.
