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
- **Minifig Data — Fully RB Catalog (February 2026, Plan 11)**:
  - All minifig data (metadata, subparts, set membership) sourced from RB catalog tables (`rb_minifigs`, `rb_minifig_parts`, `rb_inventory_minifigs`).
  - BL API retained only for pricing and identify fallback.
  - `rb_minifig_parts` materialized view kept fresh by `materializeMinifigParts()` in ingest pipeline.
  - 98.1% BL ID coverage via `rb_minifigs.bl_minifig_id` from bricklinkable pipeline.
- **Dead Code Cleanup (Plan 12)**:
  - Removed unused BL API functions: `blGetMinifig`, `blGetMinifigSupersets`, `blGetSetSubsets`, `blGetColor`, `blGetPartImageUrl`.
  - Deleted `scripts/ingest-bricklink-minifigs.ts` and npm script.
  - Replaced `bricklink_minifigs` query in `/user/[handle]` with `rb_minifigs` lookup.
  - Dropped dead DB tables: `bl_sets`, `bricklink_minifigs`.
  - Cleaned up `catalogAccess.ts` table classifications.
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
- Part ID mapping infrastructure (RB↔BL):
  - `rb_parts.bl_part_id` column stores BL part IDs directly from bricklinkable + Rebrickable API enrichment.
  - `rb_minifigs.bl_minifig_id` column stores BL minifig IDs from bricklinkable pipeline.
  - `bl_minifig_parts` table caches BrickLink minifig component parts.
  - `getSetInventoryLocal()` loads `bl_part_id` from catalog directly.
  - All UI surfaces use `bricklinkPartId` from identity for correct BL URLs.
  - Dual BrickLink + Rebrickable links in `IdentifyResultCard`, `InventoryItemModal`, `InventoryItem`.
- Distributed rate limiting backed by Supabase: `rate_limits` table, `consume_rate_limit` RPC, library wrapper with Supabase first + in-memory fallback, and tests for both paths.
- **Local-first IndexedDB architecture (SyncedDB migration)**:
  - Added Dexie for IndexedDB abstraction (`app/lib/localDb/`).
  - Normalized schema with tables:
    - `catalogSets`, `catalogParts`, `catalogColors`, `catalogSetParts`, `catalogSetMeta` — cached catalog data
    - `localOwned` — owned quantities per set
    - `syncQueue` — pending write operations for Supabase sync
    - `meta` — key-value store for sync timestamps and versions
    - `uiState`, `recentSets` — UI preferences (reserved for future use)
  - `SyncWorker` class (`app/lib/sync/SyncWorker.ts`) mounted via `SyncProvider` at app root:
    - Initializes IndexedDB on app start
    - Runs localStorage → IndexedDB migration for owned data (with write+read verification)
    - Deletes localStorage keys after successful migration to IndexedDB
    - Implements sync worker that batches operations and sends to `/api/sync` every 30 seconds
    - Works on ALL pages (replaced DataProvider which only ran on group page)
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
    - SyncWorker (app root) handles batched sync to `/api/sync`
  - New `/api/sync` endpoint for batched owned quantity sync
- **Data fetching architecture improvements** (2025-12-06):
  - **Centralized Supabase client selection** (`app/lib/db/catalogAccess.ts`):
    - Tables classified into `ANON_READABLE_TABLES`, `SERVICE_ROLE_TABLES`, and `USER_TABLES`.
    - `getCatalogReadClient()` and `getCatalogWriteClient()` provide correct client based on table access requirements.
    - Eliminates mental overhead of choosing correct client per-query.
    - Documents RLS policy requirements in a single location.
  - **Minifig data**: All minifig inventory data comes from RB catalog (`rb_minifig_parts`). No runtime BL API sync needed.
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
- **RB↔BL ID Mapping Complete** (February 2026):
  - **Part IDs**: 48,537/60,947 parts have explicit `rb_parts.bl_part_id` (where BL ID differs from RB ID). Remaining ~12,410 parts have identical IDs in both systems — same-by-default handles them. Data from bricklinkable project + Rebrickable API `external_ids`.
  - **Minifig IDs**: 16,229/16,535 (98.1%) mapped catalog-level in `rb_minifigs.bl_minifig_id` from bricklinkable pipeline. Runtime BL API fallback for unmapped 2%.
  - Identity resolution simplified: `buildResolutionContext()` reads `bricklinkPartId` from catalog rows. No `part_id_mappings` queries in hot path.
  - Legacy cleanup: Deleted `mapToBrickLink()` pipeline, `/api/parts/bricklink` route, `/api/colors/mapping` route.
  - On-demand validation: `/api/parts/bricklink/validate` self-heals to `rb_parts.bl_part_id` directly.
- **Identify Pipeline & Dual Links** (February 2026):
  - Identify pipeline now batch-lookups `rb_parts.bl_part_id` for resolved candidates, returns `bricklinkPartId` in API response.
  - All UI surfaces show dual BrickLink + Rebrickable links: `IdentifyResultCard`, `InventoryItemModal`, `InventoryItem` dropdown.
  - BL URLs use correct BL part IDs from catalog (was using RB IDs, wrong for ~80% of parts).
  - Removed legacy suffix-stripping from `resolvePartToRebrickable` — `bricklinkId` hint handles BL→RB mapping authoritatively.
  - BL fallback trigger simplified to `!sets.length` only (removed `inputChangedByResolution` heuristic).
  - 367 tests passing, clean tsc.
- **Export Fixes & BL Validation** (February 2026):
  - BL export: `generateBrickLinkCsv()` is synchronous, identity-only. No HTTP calls during export.
  - RB export: `includeMinifigs` toggle (default false). Filters `minifig_*` row types.
  - `blValidatePart()`: 404-safe circuit breaker. `BrickLinkNotFoundError` class, `safe404` option on `blGet`.
  - `InventoryItemModal`: `useBricklinkValidation` hook with session-level cache. Validates BL links on modal open.
- **BrickLink API Compliance — Code Changes** (February 2026):
  - Removed `pricing.full_cached` entitlement checks from both pricing routes — pricing free for all users per BL ToS.
  - Migration `20260216053312` deletes stale feature flag seeds (`pricing.full_cached`, `bricklink.byo_key`, `mocs.custom`).
  - Added BrickLink attribution to `InventoryItemModal` part detail view.
- **Exclusive Pieces Feature** (January 2026):
  - New page at `/exclusive-pieces` to discover parts that appear in exactly one LEGO set worldwide.
  - Service layer (`app/lib/services/exclusivePieces.ts`) queries `rb_inventory_parts_public` to find globally unique part+color combinations.
  - Supports two search modes: by theme (includes all sub-themes) or by specific set numbers (e.g., user's collection).
  - API route at `/api/exclusive-pieces` with theme ID or set numbers as query params.
  - Client page with theme selector dropdown and results grid showing part image, name, color, and the exclusive set.

## Planned / In Progress

See `docs/BACKLOG.md` for the full consolidated backlog.

**High priority:**
- Stripe UI/UX enforcement (Account page, upgrade CTAs, feature gating) — **Free + Plus only at launch**, Pro deferred
- BrickLink API compliance: contact `apisupport@bricklink.com` pre-launch (code changes done — see Completed)

**Post-launch (planned):**
- Derived Pricing System — three-layer DB-backed pricing to replace in-memory-only LRU. Plan at `docs/dev/DERIVED_PRICING_PLAN.md`. New tables: `bl_price_cache`, `bl_price_observations`, `bl_derived_prices`. Independently-computed averages served after 3 observations over 7 days. Batch crawl + on-demand flow both contribute observations.

**Medium priority:**
- Error states hardening

## Status

Core MVP is feature-complete: search, inventory, owned tracking, CSV exports, pricing, and identify flows are all working. Auth and Supabase persistence are wired up. **Rebrickable catalog is the unified source of truth for all entity data** (parts, sets, colors, minifigs). BrickLink API retained only for pricing and identify fallback. **Cross-device sync for recently viewed and continue building is implemented** (pending migration push). **BrickLink API compliance code changes complete** — pricing is free for all users, stale feature flags deleted, BL attribution added. Main remaining work is Stripe UI/UX enforcement (two tiers: Free + Plus) and pre-launch BL contact/monitoring.

## Known Issues / Risks

- Rebrickable rate limits or incomplete inventories for very old sets.
- RB↔BL part ID mapping is complete (48,537 explicit + ~12,410 same-by-default). On-demand BL validation self-heals edge cases.
- RB↔BL minifig ID mapping is 98.1% complete (catalog-level). Runtime BL API fallback handles the remaining 2%.
- Large inventories (>1000 parts) may require careful virtualization and memoization to stay fast.
- CSV specs must exactly match marketplace requirements to import successfully.
- Debounced owned writes delay flush by ~500ms; acceptable trade-off for UI responsiveness.
- BrickLink API rate limits (5,000/day) constrain bulk sync throughput; scripts are capped accordingly.
- **`bl_part_sets` 30-day TTL** (`BL_FALLBACK_TTL_MS` in `blFallback.ts:35`) exceeds BL ToS 6-hour max for API-sourced data. Needs reduction or justification.
- **No persistent metrics** — all `incrementCounter`/`logEvent`/`logger` output goes to ephemeral `console.*`. Cannot measure BL fallback usage or other operational metrics historically.
