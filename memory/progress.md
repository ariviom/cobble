# Progress

## Completed

- Next.js app scaffold (App Router, TypeScript) with global layout and styles.
- React Query provider wired via `components/providers/react-query-provider`.
- Rebrickable-backed search and inventory APIs:
  - `app/api/search/route.ts` (set search).
  - `app/api/inventory/route.ts` (set inventory).
- `lib/rebrickable.ts` wrapper with `searchSets`, `getSetInventory`, `getSetSummary` using server-only env and caching.
- Set search UI with debounce and result linking (`app/components/search`).
- Search bar label moved above input; inline clear "x" appears when text is entered, with a touch-friendly target.
- Set page `app/sets/[setNumber]/page.tsx` renders inventory for a set using `SetPageClient`.
- Virtualized inventory table with images, per-row owned input, bulk actions, missing totals, and a refactored `useInventoryViewModel` hook that centralizes sorting/filtering/grouping.
- Inventory controls support sorting by name/color/size/category, grouping, and filters for All/Missing/Owned, parent categories, and colors.
- Owned-quantity persistence via `app/store/owned.ts` with in-memory cache, versioned `localStorage` key, and debounced writes.
- Export modal (`ExportModal`) supports Rebrickable CSV and BrickLink wanted list CSV generation, including basic unmapped-row reporting.
- Optional BrickLink pricing via `/api/prices/bricklink`, `/api/prices/bricklink-set`, and `useInventoryPrices`, triggered per-row and at the set level, with per-part BrickLink links and aggregate totals/ranges.
- **BrickLink as Source of Truth for Minifigs (December 2025)**:
  - Migrated from Rebrickable to BrickLink as the exclusive source of truth for minifigure data.
  - New BL-only data access module: `app/lib/bricklink/minifigs.ts`
    - `getSetMinifigsBl()` - Fetch minifigs for a set from `bl_set_minifigs`
    - `getMinifigPartsBl()` - Fetch component parts from `bl_minifig_parts`
    - `getMinifigMetaBl()` - Fetch catalog metadata from `bricklink_minifigs`
    - `mapBlToRbFigId()` - Reverse lookup for RB compatibility
  - Self-healing system: APIs automatically trigger BrickLink sync when data is missing
  - Updated services:
    - `app/lib/services/inventory.ts` - Uses BL IDs directly, no RB→BL mapping needed
    - `app/lib/services/minifigEnrichment.ts` - BL-only enrichment
    - `app/api/minifigs/[figNum]/route.ts` - Accepts BL minifig_no as primary ID
    - `app/api/identify/sets/handlers/minifig.ts` - BL-first identification
    - `app/api/user/minifigs/sync-from-sets/route.ts` - Uses BL IDs for user minifigs
  - Deleted old RB→BL mapping logic:
    - Removed `app/lib/minifigMapping.ts`
    - Removed `app/lib/minifigMappingBatched.ts`
    - Removed dev tooling: `app/api/dev/minifig-mappings/*`, `app/dev/minifig-review/`
  - Added database migration for BL indexes (`20251229100047_bricklink_minifig_primary.sql`)
  - User data migration scripts:
    - `scripts/export-user-set-ids.ts` - Backup user sets before migration
    - `scripts/nuke-user-minifigs.ts` - Clear user minifig data for re-sync
- **BrickLink-Only Minifig Architecture (January 2026)**:
  - **Removed RB↔BL mapping**: Dropped heuristic-based mappings that were unreliable. BrickLink is now the exclusive source of truth for minifig IDs.
  - **Database cleanup**: Migration `20260119030048_drop_rb_minifig_mapping.sql` drops `bricklink_minifig_mappings` table and `rb_fig_id` column from `bl_set_minifigs`.
  - **Centralized sync orchestration**: `app/lib/sync/minifigSync.ts` is now the single source of truth for all minifig sync operations (set-minifigs and minifig-parts) with centralized in-flight tracking.
  - **Inventory service refactored**: `inventory.ts` now filters OUT all RB minifig rows and replaces entirely with BL data. Batch-fetches all minifig subparts in one query.
  - **Deleted scripts**: `build-minifig-mappings-from-all-sets.ts`, `build-minifig-mappings-from-user-sets.ts` (mapping logic removed).
  - **New color handling**: Added `app/lib/bricklink/colors.ts` for BrickLink color name lookup.
  - **Type cleanup**: Removed unused `'pending'` from `SyncStatus`; renamed fields for clarity (`minifigNo` → `blMinifigId`).
  - All 221 tests pass.
- Supabase SSR & auth-aware surfaces:
  - `@supabase/ssr` wired for both browser (`getSupabaseBrowserClient`) and server (`getSupabaseAuthServerClient`) clients.
  - Root `middleware.ts` + `utils/supabase/middleware.ts` keep Supabase auth cookies synchronized for SSR.
- `app/layout.tsx` now uses Supabase SSR to load `user_preferences.theme` and passes an `initialTheme` into `ThemeProvider` (via next-themes) to avoid theme flicker between Supabase and local state.
  - `/api/user-sets` uses the SSR server client and cookies instead of manual Bearer tokens; `useHydrateUserSets` calls it with `credentials: 'same-origin'` and no longer logs "no access token available".
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
    - `getSetInventoryRowsWithMeta()` returns optional `minifigMeta` with sync status.
    - `/api/inventory` now accepts `includeMeta=true` query param to return mapping metadata.
  - **Local minifig cache (IndexedDB)**:
    - Added `catalogMinifigs` table to Dexie schema with 24h TTL.
    - `setCachedInventory` now upserts minifig entries for cross-set reuse.
    - `useMinifigMeta` checks and populates the local cache before/after API calls.
  - **Version-aware inventory cache**:
    - Added `/api/catalog/versions` to read `rb_download_versions` (uses `inventory_parts` source).
    - `useInventory` fetches the version first, then validates IndexedDB cache (30d TTL) before network.
    - `/api/inventory` now returns `inventoryVersion`; cached inventories store version in Dexie meta.
- **Legal and Compliance Documentation**:
  - Terms of Service (`app/terms/page.tsx`) updated for subscriptions and beta phase (payment and BYO key sections commented out).
  - Privacy Policy (`app/privacy/page.tsx`) updated for image identification (Brickognize) and usage tracking (Stripe and API key sections commented out).
- **UI and Feature Gating**:
  - Commented out "Bring Your Own API Key" and "Rebrickable account" UI from the Account and Pricing pages.
- **Caching strategy review** (December 2025):
  - Conducted deep analysis of all 20+ caches in the codebase (see `docs/dev/CACHE_ARCHITECTURE_PLAN.md`).
  - Key finding: Most server caches are external API responses (BrickLink, Rebrickable) that don't need catalog version awareness.
  - Client-side IndexedDB already had version checking implemented correctly.
  - Targeted fixes applied:
    - Reduced `spareCache` TTL from 7 days → 24 hours (more appropriate for live Rebrickable API data).
    - Added `Cache-Control` header to `/api/catalog/versions` endpoint (60s max-age, 120s stale-while-revalidate).
  - Documented caching strategy in `memory/system-patterns.md` for future reference.
- **Exclusive Pieces Feature** (January 2026):
  - New page at `/exclusive-pieces` to discover parts that appear in exactly one LEGO set worldwide.
  - Service layer (`app/lib/services/exclusivePieces.ts`) queries `rb_inventory_parts_public` to find globally unique part+color combinations.
  - Supports two search modes: by theme (includes all sub-themes) or by specific set numbers (e.g., user's collection).
  - API route at `/api/exclusive-pieces` with theme ID or set numbers as query params.
  - Client page with theme selector dropdown and results grid showing part image, name, color, and the exclusive set.

## Planned / In Progress

See `docs/BACKLOG.md` for the full consolidated backlog.

**High priority:**
- Stripe UI/UX enforcement (Account page, upgrade CTAs, feature gating)

**Medium priority:**
- Multi-device sync (pull-on-login)
- Error states hardening

## Status

Core MVP is feature-complete: search, inventory, owned tracking, CSV exports, pricing, and identify flows are all working. Auth and Supabase persistence are wired up. **BrickLink is the exclusive source of truth for minifigure data** with self-healing capabilities. Main remaining work is Stripe UI/UX enforcement and multi-device sync.

## Known Issues / Risks

- Rebrickable rate limits or incomplete inventories for very old sets.
- ID/color mapping mismatches between Rebrickable and BrickLink affecting CSV exports.
  - Mitigated by `part_id_mappings` table with auto-suffix fallback (e.g., `3957a` → `3957`).
  - Mitigated by minifig component part mapping pipeline for heads, torsos, legs, etc.
- Large inventories (>1000 parts) may require careful virtualization and memoization to stay fast.
- CSV specs must exactly match marketplace requirements to import successfully.
- Debounced owned writes delay flush by ~500ms; acceptable trade-off for UI responsiveness.
- BrickLink API rate limits (2500/day) constrain bulk mapping throughput; scripts are capped accordingly.
