# Active Context

## Current Focus

- **Stripe UI/UX Enforcement** - Wire up billing UI (Account page, upgrade CTAs, inline upsells) and feature gating (SSR preload, API guards, usage counters). **Two tiers at launch: Free + Plus only** (Pro deferred).
- **BrickLink API Compliance** — Pricing must be free for all users (BL ToS prohibits paywalling). ~~Remove entitlement checks from pricing routes~~ (done). Contact `apisupport@bricklink.com` pre-launch to confirm commercial use case.
- Keep the MVP flows (search, inventory, owned vs missing, CSV exports, optional pricing) stable.
- Preserve anonymous/local-only experience while signed-in users sync to Supabase.

## Recently Completed (February 2026)

- **BrickLink API Compliance — Group A (Code Changes)**:
  - Removed `pricing.full_cached` entitlement checks from `/api/prices/bricklink` and `/api/prices/bricklink-set` — pricing is now free for all users regardless of tier.
  - Created migration `20260216053312_delete_stale_feature_flags.sql` to delete stale feature flag seeds (`pricing.full_cached`, `bricklink.byo_key`, `mocs.custom`) from the database.
  - Added BrickLink attribution text to `InventoryItemModal` part detail view per BL API ToS requirements.
  - Remaining BL compliance work: contact `apisupport@bricklink.com` pre-launch, monitor API quota post-launch.

- **Dead Code Cleanup & Identify Pipeline Fixes (Post-Plan 10)**:
  - **Legacy ID translation code removed**: Deleted `mapToBrickLink()` pipeline (`app/lib/mappings/rebrickableToBricklink.ts`), `/api/colors/mapping` route, `/api/parts/bricklink` route, and associated test.
  - **`part_id_mappings` removed from identity resolution**: `buildResolutionContext()` no longer queries `part_id_mappings` — uses `rb_parts.bl_part_id` directly + same-by-default fallback. Table still exists (used by `bl-not-found` negative caching) but not in the hot path.
  - **Pricing simplified**: `pricing.ts` no longer falls back to `mapToBrickLink()` — items without BL IDs are skipped (all inventory items have identity).
  - **BL validation self-heals to `rb_parts`**: `/api/parts/bricklink/validate` now writes corrections to `rb_parts.bl_part_id` directly instead of `part_id_mappings`.
  - **Identify pipeline BL link fix**: Added `bricklinkPartId` field throughout the identify pipeline (`resolve.ts` → `findSets.ts` → `handlers/part.ts`). BL URLs now use correct BL part IDs from catalog instead of RB IDs (~80% of parts had wrong BL links before).
  - **Dual external links**: All UI surfaces now show both BrickLink and Rebrickable links — `IdentifyResultCard`, `InventoryItemModal`, `InventoryItem` dropdown. `IdentifyClient.tsx` threads `bricklinkPartId` through all `setPart()` calls and session cache.
  - 367 tests passing, clean tsc.

- **Bricklinkable Minifig & Part ID Mapping Ingest (Plan 10)**:
  - **SOLVED**: RB↔BL minifig ID mapping — 98.1% catalog-level coverage (16,229/16,535 minifigs) stored in `rb_minifigs.bl_minifig_id` from bricklinkable pipeline. Runtime BL API fallback only for unmapped 2%.
  - **Complete part ID coverage**: 48,537 of 60,947 parts have explicit `rb_parts.bl_part_id` (where BL ID differs from RB ID). Remaining ~12,410 parts have identical IDs in both systems — same-by-default handles them correctly.
  - Schema: Added `bl_part_id` to `rb_parts`, added `bl_minifig_id`/`bl_mapping_confidence`/`bl_mapping_source` to `rb_minifigs` (migration `20260214034914`).
  - One-time ingest: `scripts/ingest-bricklinkable.ts` — ingested 16,229 minifig mappings, 48,000 part mappings, 466 backfilled from `external_ids` JSON.
  - Catalog query simplified: `getSetInventoryLocal()` now selects `bl_part_id` directly instead of parsing `external_ids` JSON. Removed `extractBricklinkPartId()` helper from `sets.ts`.
  - Minifig fast-path: `inventory.ts` skips `getSetMinifigsBl()` BL API sync when all minifigs have `bl_minifig_id` mappings from catalog.
  - `PartIdentity` extended with `rbFigNum` field — enables RB export to use correct Rebrickable fig_num for minifig rows.
  - Ongoing matching: Added tier-1 (set-based + elimination) and tier-2 (fingerprinting) matching to `ingest-rebrickable.ts` for newly-released minifigs.

- **Same-by-Default BrickLink Part ID Mapping (Plan 09)**:
  - Core fix: `identityResolution.ts` now defaults `blPartId` to `rbPartId` when no explicit mapping exists (was `null`).
  - Priority chain: explicit BL ID from `rb_parts.bl_part_id` → assume same as RB ID.
  - Color IDs are NOT same-by-default (RB Black=0, BL Black=11) — `blColorId` keeps `?? null`.
  - **Key finding**: ~80% of parts (48,537 of 60,947) have different BL IDs — mainly printed/decorated parts. The remaining ~12,410 parts have identical IDs in both systems.
  - New test file: `app/lib/services/__tests__/identityResolution.test.ts` (8 tests).

- **Export Fixes & On-Demand BL Validation (Plan 08)**:
  - BL export: removed `mapToBrickLink()` fallback — `generateBrickLinkCsv()` is now synchronous, identity-only. Rows without BL IDs go to `unmapped` list. No HTTP calls during export (eliminates 429s).
  - RB export: added `includeMinifigs` toggle (default: false). Filters out rows where `identity?.rowType` starts with `minifig_`. Warning shown when minifigs included about BL IDs.
  - `blValidatePart()` in `bricklink.ts`: 404-safe validation that doesn't trip circuit breaker. Uses new `BrickLinkNotFoundError` + `safe404` option on `blGet`.
  - Negative caching: `part_id_mappings` entries with `source = 'bl-not-found'` and `bl_part_id = ''`. 30-day re-validation window. `buildResolutionContext()` skips these entries.
  - On-demand validation: new `/api/parts/bricklink/validate` route. Validates stored BL ID, tries fallback candidates (raw RB ID, suffix-stripped), self-heals by persisting corrected mappings (`source: 'auto-validate'`).
  - `InventoryItemModal`: `useBricklinkValidation` hook with session-level cache. Shows "Checking BrickLink..." → validated link or "This part is not available on BrickLink".
  - Tests updated: removed `mapToBrickLink` mock, all tests now use identity objects. 356 tests passing, clean tsc.

- **SyncEngine — Extract Sync Worker to App Root (Plan 05)**:
  - Fixed critical bug: sync worker only ran on group page, owned changes from main sets page never synced to Supabase
  - Created `SyncWorker` class (`app/lib/sync/SyncWorker.ts`) — plain TS, no React dependency, extracts all sync logic from DataProvider
  - Created `SyncProvider` (`app/components/providers/sync-provider.tsx`) — thin React wrapper, mounted in root `app/layout.tsx`
  - Provides `useSyncStatus()` hook for optional UI consumers (sync indicator, error toast)
  - Deleted `DataProvider` (533 lines) and `LocalDataProviderBoundary` (15 lines) — zero external consumers of `useDataContext`
  - Moved `parseInventoryKey` to `app/lib/domain/inventoryKey.ts` (re-exported from `ownedSync.ts`)
  - 30 new SyncWorker tests, 338 total tests passing, clean tsc, clean lint
  - Same IndexedDB tables, no schema change — zero data loss risk

- **Server-Driven Inventory — Eliminate Client-Side Minifig Enrichment (Plan 03)**:
  - Server now self-heals missing minifig subparts via `getMinifigPartsBl()` with 10s timeout per minifig
  - Removed entire client enrichment pipeline: `useMinifigEnrichment.ts`, `/api/minifigs/enrich/route.ts`, `minifigEnrichment.ts` (~419 lines deleted)
  - Removed `minifigEnrichmentNeeded` from `InventoryResult` type and API response
  - Simplified `useInventory.ts`: removed enrichment merge, IndexedDB re-cache effect, enrichment state (~190 lines removed)
  - Cleaned up `useInventoryViewModel`, `InventoryProvider`, `Inventory`, `InventoryItem` — removed enrichment toast, `isEnriching` prop
  - Net ~690 lines removed. All tests pass, clean tsc, clean lint.

- **Unified Part Identity (Plan 02)** — Resolved all RB↔BL ID reconciliation into a single `PartIdentity` object, created server-side once at inventory load time:
  - **NEW** `app/lib/domain/partIdentity.ts` — `PartIdentity` type, 4 factory functions, `getLegacyKeys()`, `parseCanonicalKey()`
  - **NEW** `app/lib/services/identityResolution.ts` — `ResolutionContext`, `buildResolutionContext()`, `resolveCatalogPartIdentity()`, `resolveMinifigSubpartIdentity()`
  - **REFACTORED** `app/lib/services/inventory.ts` — Replaced dual-index dedup (`existingRowsByKey` + `blKeyToInventoryKey`) with single `rowsByCanonicalKey` map using identity resolution. Moved `getRbToBlColorMap()` to identity service.
  - **UPDATED** `app/components/set/types.ts` — Added `identity?: PartIdentity` to `InventoryRow`
  - **UPDATED** Client-side: `useInventory.ts`, `inventory-utils.ts`, `InventoryItem.tsx`, `InventoryItemModal.tsx` — All key derivations prefer `identity?.canonicalKey`
  - **UPDATED** Exports: `bricklinkCsv.ts` fast path skips `mapToBrickLink()` when identity has BL IDs; `rebrickableCsv.ts` `MissingRow` extended with identity
  - **UPDATED** Pricing: `useInventoryPrices.ts` → `route.ts` → `pricing.ts` thread BL IDs directly, fallback to `mapToBrickLink()`
  - **UPDATED** Owned data: `migrateOwnedKeys()` in `ownedStore.ts` for legacy BL-keyed data; `parseInventoryKey()` handles `bl:` prefix
  - **UPDATED** IndexedDB cache: `CatalogSetPart` + `catalogCache.ts` round-trip identity through cache
  - 33 new tests (275 total passing), clean `tsc`, zero behavior change for existing flows
  - Phase 7 (cleanup) deferred — fallback paths to `mapToBrickLink()` kept for stale cache safety

- **Split InventoryProvider into 5 Focused Contexts** (0b19ce9):
  - Replaced monolithic 58-field `InventoryContextValue` with 5 targeted contexts: Data (27), Controls (20), Pricing (3), Pinned (3), UI (7)
  - Single provider component still orchestrates all hooks; only the distribution changes (5 separate `useMemo` + nested providers)
  - Migrated all 5 consumers: `SetTopBar`, `SetTabContainer`, `PinnedPanel`, `InventoryControls`, `Inventory`
  - Deleted old `useInventoryContext()` — consumers now use `useInventoryData()`, `useInventoryControls()`, `useInventoryPricing()`, `useInventoryPinned()`, `useInventoryUI()`
  - Re-render isolation: toggling export modal no longer re-renders SetTopBar; price loads no longer re-render InventoryControls
  - Part of architectural rewrite plans tracked in `memory/working/00-summary.md` (Plan 01 of 7)
  - 6 files changed, 201 insertions, 152 deletions. 242/243 tests pass, clean tsc.

- **Cross-Device Sync: Recently Viewed & Continue Building**:
  - New `user_recent_sets` table with RLS for cross-device recently viewed sync
  - Added `found_count` column to `user_sets` with backfill migration
  - New `/api/recent-sets` route (GET: pull with metadata join, POST: fire-and-forget push)
  - `useSyncRecentSet` hook fires POST to cloud on set view (authenticated users only)
  - `useRecentSets` hook merges local (localStorage) + cloud (Supabase) recent sets by newest `lastViewedAt`
  - Wired sync into 3 call sites: `SetTabContainer`, `SetPageRedirector`, `SetPageClient`
  - `/api/sync` now computes and updates `found_count` on affected `user_sets` after processing parts
  - `/api/user-sets` returns `foundCount` in response; store and hydration updated
  - `useCompletionStats` simplified: reads `foundCount` from user sets Zustand store instead of expensive paginated `user_set_parts` scan
  - Removed `fetchCloudOwnedBySet` and `fetchCloudSetMeta` functions (no longer needed)
  - All 243 tests passing, clean type check, no lint errors

See `docs/BACKLOG.md` for full backlog of remaining work.

## Notes

- **Target test sets**: 1788, 6781, 6989, 40597, 21322
- **Pricing**: USD + `country_code=US` default; currency/country preference is future work.
- **Identify flow**: See `memory/system-patterns.md` for Identify pipeline documentation.

## RB↔BL ID Mapping — Solved

**Minifig IDs**: 98.1% coverage (16,229/16,535) stored catalog-level in `rb_minifigs.bl_minifig_id` from bricklinkable pipeline (set-based matching, elimination, fingerprinting). Runtime BL API fallback handles the remaining 2%.

**Part IDs**: 100% coverage. 48,537 parts have explicit `rb_parts.bl_part_id` (where BL ID differs from RB ID, sourced from bricklinkable + Rebrickable API `external_ids`). Remaining ~12,410 parts have identical IDs in both systems — handled by same-by-default fallback in identity resolution.

**Data sources**: `scripts/ingest-bricklinkable.ts` (primary, from bricklinkable project) + `scripts/ingest-rebrickable.ts` (secondary, Rebrickable API enrichment). Both only store mappings where IDs differ.

## Active Decisions

- MVP remains fully usable without auth; Supabase accounts are additive.
- **Data sources**: Rebrickable catalog for all entity data (parts, sets, colors, minifigs); BrickLink API for pricing and identify fallback only.
- **BrickLink pricing is free for all users** (Feb 2026 decision). On-demand API calls with ≤6hr server cache. BrickLink API ToS prohibits gating their free-to-members data behind a paywall. See `docs/BACKLOG.md` BrickLink API Compliance section.
- **Two tiers at launch: Free + Plus.** Pro deferred until features warrant it (custom MoCs, instructions uploads, BYO BrickLink key pending BL approval). Schema already supports Pro — no migration needed when ready.
- **Plus tier includes**: unlimited tabs, identifies, exports, lists, Search Party, sync, part rarity indicators. Exclusive pieces moved from Pro → Plus.
- **Removed feature flags**: `prices.detailed`, `pricing.full_cached` (pricing free for all), `bricklink.byo_key` and `mocs.custom` (Pro deferred).
- **ID mapping tables are ToS-compliant** — sourced from bricklinkable community data and Rebrickable, not BrickLink API.
- Out of scope: BrickOwl export, advanced rarity analytics.
- Accessibility: "good enough for MVP"; complex widgets to be revisited (see `docs/BACKLOG.md`).
