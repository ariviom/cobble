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
- Supabase SSR & auth-aware surfaces:
  - `@supabase/ssr` wired for both browser (`getSupabaseBrowserClient`) and server (`getSupabaseAuthServerClient`) clients.
  - Root `middleware.ts` + `utils/supabase/middleware.ts` keep Supabase auth cookies synchronized for SSR.
  - `app/layout.tsx` now uses Supabase SSR to load `user_preferences.theme` and passes an `initialTheme` into `ThemeScript` and `ThemeProvider` to avoid theme flicker between Supabase and local state.
  - `/api/user-sets` uses the SSR server client and cookies instead of manual Bearer tokens; `useHydrateUserSets` calls it with `credentials: 'same-origin'` and no longer logs “no access token available”.
  - `/api/prices/bricklink` and `/api/prices/bricklink-set` use Supabase SSR to load per-user pricing preferences when authenticated; `useInventoryPrices` calls `/api/prices/bricklink` without embedding Supabase tokens.
  - `app/account/page.tsx` is now an async Server Component that preloads user + profile + pricing preferences and delegates interactive behavior to `AccountPageClient`.
  - Group-session APIs:
    - `/api/group-sessions` and `/api/group-sessions/[slug]/end` use Supabase SSR auth and cookies to enforce host-only actions.
    - `/api/group-sessions/[slug]/join` uses the SSR client to attach `user_id` to participants when authenticated while still allowing anonymous joins.
    - `SetPageClient` calls group-session APIs with `credentials: 'same-origin'` instead of constructing Authorization headers.
 - Supabase catalog security:
   - Added a Supabase CLI migration (`20251201060928_enable_rls_on_catalog_tables.sql`) that enables RLS on internal BrickLink/Rebrickable catalog tables (`bricklink_minifigs`, `bricklink_minifig_mappings`, `bl_sets`, `bl_set_minifigs`, `rb_minifig_parts`) so database linter rule `0013_rls_disabled_in_public` is satisfied without exposing these tables to anon/auth roles.
- Part ID mapping infrastructure (RB→BL):
  - Added `part_id_mappings` table for manual and auto-generated part ID mappings.
  - Modified `/api/parts/bricklink` to check mapping table first and auto-persist successful suffix fallbacks (e.g., `3957a` → `3957`).
  - **Fixed** `external_ids` parsing bug: Rebrickable returns `"BrickLink":["3024"]` (array), not `{ext_ids:[...]}` (object).
  - Added `bl_minifig_parts` table to cache BrickLink minifig component parts.
  - Extended `minifig-mapping-core.ts` with `processMinifigComponentMappings()` to map RB minifig parts → BL parts.
  - Updated bulk mapping scripts with two phases:
    - Phase 1: Map minifigs (controlled by `MINIFIG_MAPPING_MAX_SETS`, default 500).
    - Phase 2: Map minifig component parts (controlled by `MINIFIG_COMPONENT_API_BUDGET`, default 500).
  - Total daily BrickLink API budget: 2500 calls split between set mapping and component mapping.
- BrickLink part ID propagation in UI:
  - Added `bricklinkPartId` field to `InventoryRow` type.
  - Updated `getSetInventoryLocal` (catalog.ts) to fetch `external_ids` and extract BrickLink IDs.
  - Updated `getSetInventory` (rebrickable.ts) to include `inc_part_details=1` for external_ids.
  - Updated `getMinifigPartsCached` to include `inc_part_details=1` for minifig components.
  - Updated `InventoryItem.tsx` to use `bricklinkPartId` for constructing BrickLink URLs.
- Distributed rate limiting backed by Supabase: `rate_limits` table, `consume_rate_limit` RPC, library wrapper with Supabase first + in-memory fallback, and tests for both paths.
- **Local-first IndexedDB architecture (SyncedDB migration)**:
  - Added Dexie for IndexedDB abstraction (`app/lib/localDb/`).
  - Normalized schema with tables:
    - `catalogSets`, `catalogParts`, `catalogColors`, `catalogSetParts`, `catalogSetMeta` — cached catalog data
    - `localOwned` — owned quantities per set
    - `syncQueue` — pending write operations for Supabase sync
    - `meta` — key-value store for sync timestamps and versions
    - `uiState`, `recentSets` — UI preferences (reserved for future use)
  - `DataProvider` component (`app/components/providers/data-provider.tsx`):
    - Initializes IndexedDB on app start
    - Runs localStorage → IndexedDB migration for owned data (with write+read verification)
    - Deletes localStorage keys after successful migration to IndexedDB
    - Implements sync worker that batches operations and sends to `/api/sync` every 30 seconds
  - `useInventory` hook now checks IndexedDB cache first for inventory data (24-hour TTL)
  - `useOwnedStore` refactored to use IndexedDB-only persistence:
    - In-memory cache for synchronous reads
    - Async hydration from IndexedDB on set page load
    - Debounced writes to IndexedDB only (no localStorage)
    - Exposes `isHydrated` and `isStorageAvailable` for UI state
  - `useOwnedSnapshot` returns hydration state (`isHydrated`, `isStorageAvailable`)
  - `InventoryTable` shows:
    - Loading spinner with "Loading your progress…" while hydrating owned data
    - Warning banner when IndexedDB unavailable: "Local storage unavailable; your progress will be lost when you close this tab"
  - `useSupabaseOwned` refactored to use sync queue:
    - Changes enqueued to `syncQueue` table instead of direct Supabase writes
    - Sync worker in DataProvider handles batched sync to `/api/sync`
  - New `/api/sync` endpoint for batched owned quantity sync
- **Data fetching architecture improvements** (2025-12-06):
  - **Batched minifig mapping** (`app/lib/minifigMappingBatched.ts`):
    - `getMinifigMappingsForSetBatched()` reduces DB calls from 6-8 sequential queries to 1-2 parallel queries.
    - Built-in request deduplication via `inFlightSyncs` Map prevents duplicate BrickLink API calls.
    - `getGlobalMinifigMappingsBatch()` efficiently looks up multiple fig IDs at once.
    - Legacy functions re-exported for backward compatibility.
  - **Centralized Supabase client selection** (`app/lib/db/catalogAccess.ts`):
    - Tables classified into `ANON_READABLE_TABLES`, `SERVICE_ROLE_TABLES`, and `USER_TABLES`.
    - `getCatalogReadClient()` and `getCatalogWriteClient()` provide correct client based on table access requirements.
    - Eliminates mental overhead of choosing correct client per-query.
    - Documents RLS policy requirements in a single location.
  - **Minifig sync module** (`app/lib/sync/minifigSync.ts`):
    - Separates read operations (`checkSetSyncStatus()`) from write operations (`triggerMinifigSync()`).
    - Explicit sync control with deduplication and 60-second cooldown.
    - Sync status tracking: `'ok' | 'error' | 'pending' | 'never_synced'`.
  - **Inventory service improvements** (`app/lib/services/inventory.ts`):
    - `getSetInventoryRowsWithMeta()` returns optional `minifigMappingMeta` with sync status.
    - `/api/inventory` now accepts `includeMeta=true` query param to return mapping metadata.
  - **Local minifig cache (IndexedDB)**:
    - Added `catalogMinifigs` table to Dexie schema with 24h TTL.
    - `setCachedInventory` now upserts minifig entries for cross-set reuse.
    - `useMinifigMeta` checks and populates the local cache before/after API calls.
  - **Version-aware inventory cache**:
    - Added `/api/catalog/versions` to read `rb_download_versions` (uses `inventory_parts` source).
    - `useInventory` fetches the version first, then validates IndexedDB cache (30d TTL) before network.
    - `/api/inventory` now returns `inventoryVersion`; cached inventories store version in Dexie meta.

## Planned / In Progress

- Catalog version checking to invalidate stale IndexedDB cache
- Pull-on-login for multi-device sync (fetch user data from Supabase on new device)
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
  - Mitigated by `part_id_mappings` table with auto-suffix fallback (e.g., `3957a` → `3957`).
  - Mitigated by minifig component part mapping pipeline for heads, torsos, legs, etc.
- Large inventories (>1000 parts) may require careful virtualization and memoization to stay fast.
- CSV specs must exactly match marketplace requirements to import successfully.
- Debounced owned writes delay flush by ~500ms; acceptable trade-off for UI responsiveness.
- BrickLink API rate limits (2500/day) constrain bulk mapping throughput; scripts are capped accordingly.
