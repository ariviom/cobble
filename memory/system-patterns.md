# System Patterns

## Core Data Flows

- **Search**
  - `GET /api/search` wraps `searchSetsPage` from `app/lib/services/search`.
  - Query, sort, filters, paging, and exact-match flags are parsed and validated in the route handler before hitting the service.
- **Inventory**
  - Set pages load inventories through Route Handlers that talk to the Rebrickable/Supabase catalog.
  - TanStack Query owns server data (inventories, prices); Zustand owns UI state and per-set owned quantities.
  - The `useInventoryViewModel` hook centralizes sorting, filtering, grouping, and derived totals so table components remain largely presentational.
  - Minifigure parent rows are enriched server-side with BrickLink minifig IDs using:
    - A per-set mapping table (`bl_set_minifigs`) that stores `set_num`, BrickLink `minifig_no`, and the corresponding Rebrickable `rb_fig_id`.
    - A shared script module (`scripts/minifig-mapping-core.ts`) that:
      - Calls BrickLink `/items/SET/{setNum}/subsets` to fetch minifigs.
      - Loads Rebrickable inventories/minifigs for the same set from Supabase.
      - Matches RB ↔ BL minifigs by normalized name, Jaccard similarity, and a greedy fallback within the set's small candidate list.
      - Upserts mappings into `bl_set_minifigs` and a global `bricklink_minifig_mappings` cache.
      - Optionally fetches minifig component parts via `/items/MINIFIG/{minifigNo}/subsets` and maps RB minifig parts → BL parts.
    - **Batched mapping module** (`app/lib/minifigMappingBatched.ts`) that reduces DB round-trips:
      - `getMinifigMappingsForSetBatched()` fetches mappings + sync status in a single parallel query (down from 6-8 sequential calls).
      - Built-in request deduplication via `inFlightSyncs` Map prevents duplicate BrickLink API calls for concurrent requests.
      - `getGlobalMinifigMappingsBatch()` efficiently looks up multiple fig IDs in one query.
      - Legacy functions (`mapSetRebrickableFigsToBrickLinkOnDemand`, etc.) re-exported for backward compatibility.
    - **Minifig sync module** (`app/lib/sync/minifigSync.ts`) separates read and write concerns:
      - `checkSetSyncStatus()` is a pure read operation.
      - `triggerMinifigSync()` explicitly triggers sync with deduplication and cooldown.
      - Sync status tracking with `'ok' | 'error' | 'pending' | 'never_synced'` states.
      - 60-second cooldown between syncs to prevent API hammering.
    - The inventory service (`app/lib/services/inventory.ts`) uses the batched module and returns optional `minifigMappingMeta` with sync status, mapped/unmapped counts.
- **Part ID Mapping** (RB → BL):
  - `part_id_mappings` table stores manual and auto-generated mappings with columns `rb_part_id`, `bl_part_id`, `source`, `confidence`.
  - Sources include: `'auto-suffix'` (automatic suffix stripping), `'minifig-component'` (from minifig part mapping), `'manual'`.
  - `/api/parts/bricklink` route lookup order:
    1. Check `part_id_mappings` table first.
    2. Fall back to Rebrickable API's `external_ids.BrickLink`.
    3. For parts matching `/^\d+[a-z]$/i` (like `3957a`), try stripping the suffix and looking up base ID.
    4. If suffix stripping succeeds, auto-persist to `part_id_mappings` for future lookups.
  - `bl_minifig_parts` caches BrickLink minifig component parts; `bricklink_minifigs.parts_sync_status` tracks sync state.
  - Bulk mapping scripts have two phases:
    - Phase 1: Map minifigs for each set (1 BL API call per set).
    - Phase 2: Map minifig component parts (1 BL API call per unique minifig, capped by `MINIFIG_COMPONENT_API_BUDGET`).

## Persistence & Auth Patterns

- **Local-first with IndexedDB (SyncedDB architecture)**
  - Primary client storage uses Dexie-backed IndexedDB (`app/lib/localDb/`) with normalized tables:
    - `catalogSets`, `catalogParts`, `catalogColors`, `catalogSetParts`, `catalogSetMeta` — cached catalog data
    - `localOwned` — owned quantities per set (mirrors `user_set_parts`)
    - `syncQueue` — pending write operations for Supabase sync
    - `meta` — key-value store for sync timestamps, catalog versions, migration state
  - Zustand store (`app/store/owned.ts`) maintains an in-memory cache with:
    - Synchronous reads from in-memory cache only (no localStorage fallback)
    - Async hydration from IndexedDB on set page load via `hydrateFromIndexedDB()`
    - Debounced writes to IndexedDB only
    - Exposes `isHydrated(setNumber)` and `isStorageAvailable()` for UI state
  - `useOwnedSnapshot` hook returns `{ ownedByKey, isHydrated, isStorageAvailable }`:
    - `isHydrated` is false until IndexedDB hydration completes for that set
    - `isStorageAvailable` is false if IndexedDB is unavailable (in-memory only mode)
  - `InventoryTable` shows:
    - Loading spinner with "Loading your progress…" while `isHydrating` (not hydrated but not loading inventory)
    - Warning banner when `!isStorageAvailable`: "Local storage unavailable; your progress will be lost when you close this tab"
  - `DataProvider` (`app/components/providers/data-provider.tsx`) manages:
    - Database initialization on app start
    - localStorage → IndexedDB migration for owned data with write+read verification
    - Deletion of localStorage keys after successful migration
    - Sync worker that batches pending operations and sends to `/api/sync`
- **Inventory caching**
  - `useInventory` fetches lightweight versions from `/api/catalog/versions` (inventory_parts) before reading cache.
  - Cache hit uses version + TTL (30d); cache miss fetches `/api/inventory` and stores rows with the version.
  - `/api/inventory` returns `inventoryVersion` sourced from `rb_download_versions`.
- **Minifig metadata caching**
  - Dexie schema includes `catalogMinifigs` (figNum, blId, name, imageUrl, numParts, year, themeName, cachedAt) with 24h TTL.
  - `setCachedInventory` upserts minifig entries whenever inventories are cached so mappings and metadata are reusable across sets.
  - `useMinifigMeta` reads from and populates the minifig cache before/after hitting `/api/minifigs/[figNum]`.
- **Sync queue for Supabase writes**
  - Owned quantity changes are enqueued to `syncQueue` table instead of direct Supabase writes
  - `/api/sync` endpoint accepts batched operations and applies them transactionally
  - Sync worker runs every 30 seconds, on visibility change, and on page unload
  - Conflict resolution: last-write-wins based on timestamps
- **Supabase-backed sync**
  - Supabase tables hold user profiles, preferences, per-set status, per-set owned parts, and optional global parts inventory.
  - Anonymous users use local-only storage; authenticated users sync via the queue
  - Migration prompts handle divergent local vs cloud data on first load
- **Status semantics**
  - `user_sets` and `user_minifigs` store only `'owned'` or `'want'`; partial/in-progress states are inferred from owned-piece tallies and list membership rather than additional enum values.
- **Group builds**
  - Collaborative sessions are represented by `group_sessions` and related tables in Supabase.
  - The host's owned state is the single source of truth; participant edits stream via Supabase Realtime channels keyed by `group_sessions.id` and are applied to the host's rows.

## SSR vs Client Architecture

- **Supabase auth & SSR**
  - `@supabase/ssr` is used to create:
    - A browser client (`getSupabaseBrowserClient`) for all client hooks and UI.
    - An auth-aware server client (`getSupabaseAuthServerClient`) that reads Supabase cookies via `next/headers` and is used in Server Components and Route Handlers.
  - A shared middleware (`utils/supabase/middleware.ts` + root `middleware.ts`) keeps Supabase auth cookies refreshed on each matched request so SSR code can trust `supabase.auth.getUser()` / `getClaims()` without manual Bearer headers.
- **Where SSR is used**
  - **Layout & theming**
    - `app/layout.tsx` is an async Server Component that uses `getSupabaseAuthServerClient` to read `user_preferences.theme` and passes an `initialTheme` into:
      - `ThemeScript` (inline head script) so the first paint uses the account theme.
      - `ThemeProvider` so client hydration doesn’t re-resolve theme from system/local-only state.
  - **Account & user preferences**
    - `app/account/page.tsx` is an async Server Component that:
      - Reads the current user via Supabase SSR.
      - Preloads `user_profiles` row (when present).
      - Loads pricing preferences via `loadUserPricingPreferences`.
      - Passes these into the client-only `AccountPageClient` component for interactive behavior.
  - **User sets hydration**
    - `/api/user-sets` uses `getSupabaseAuthServerClient` and `supabase.auth.getUser()` to fetch `user_sets` with joined `rb_sets` metadata.
    - `useHydrateUserSets` is a client hook that calls `/api/user-sets` with `credentials: 'same-origin'` and never touches access tokens directly.
  - **Pricing**
    - `/api/prices/bricklink` and `/api/prices/bricklink-set` use `getSupabaseAuthServerClient` to:
      - Detect the current user from cookies.
      - Load pricing preferences via `loadUserPricingPreferences`.
      - Default to `DEFAULT_PRICING_PREFERENCES` for anonymous users.
    - `useInventoryPrices` runs entirely on the client and calls `/api/prices/bricklink` with JSON + `credentials: 'same-origin'`; it no longer builds or forwards Supabase access tokens.
  - **Group sessions**
    - `/api/group-sessions` (create host session) uses `getSupabaseAuthServerClient` and `supabase.auth.getUser()` to ensure only authenticated hosts can create sessions; the client (`SetPageClient`) calls it with `credentials: 'same-origin'` and no Authorization header.
    - `/api/group-sessions/[slug]/end` similarly uses Supabase SSR auth to verify the current user is the host before ending a session.
    - `/api/group-sessions/[slug]/join` uses the SSR client to:
      - Look up the session by slug.
      - Optionally attach `user_id` to participants when the caller is authenticated (still allows anonymous participants).
- **Where client-only remains the right choice**
  - Catalog-backed flows (`/api/search`, `/api/inventory`, Identify, Rebrickable catalog queries) remain **auth-agnostic Route Handlers** that:
    - Prefer Supabase catalog tables and Rebrickable APIs.
    - Are consumed via TanStack Query on the client.
  - Owned state, filters, and local inventory overlays continue to live in client-side stores (`Zustand` + `localStorage`), with Supabase acting as an optional sync layer for signed-in users.

## Identify Flow

- **RB-first, BL-supersets fallback**
  - `POST /api/identify` accepts an image, calls Brickognize, and extracts candidate part numbers (including optional BrickLink IDs).
  - Candidates are resolved to Rebrickable parts via `resolvePartIdToRebrickable`; colors and sets come from `getPartColorsForPart` and `getSetsForPart`.
  - If no Rebrickable candidate yields sets, the handler falls back to BrickLink supersets (including per-color supersets and subset-inferred colors) and then enriches sets with Rebrickable summaries where possible.
- **Color handling**
  - Available colors for a part are sourced from Rebrickable; a single available color is auto-selected.
  - For BrickLink fallbacks, BL color IDs are mapped to human-readable names via the Rebrickable colors catalog.
- **Rate limiting and budgets**
  - `/api/identify` enforces per-client rate limits.
  - An `ExternalCallBudget` limits outgoing external API calls per request; budget exhaustion yields a structured `identify_budget_exceeded` error.

## Catalog & Ingestion

- **Rebrickable catalog mirror**
  - `scripts/ingest-rebrickable.ts` downloads compressed CSVs (themes, colors, part categories, parts, sets, inventories, minifigs) and streams them into Supabase `rb_*` tables using batched `upsert`s.
  - Ingestion versions are tracked in `rb_download_versions` so unchanged sources are skipped.
- **Usage in the app**
  - App code prefers catalog-backed queries (via `app/lib/catalog.ts` / Supabase) for search and inventories when possible.
  - Live Rebrickable API calls are reserved for gaps or very recent data.

## Supabase RLS & Catalog Security

- **Public schema exposure**
  - All tables in the `public` schema that are exposed via PostgREST must have row level security (RLS) enabled; database linter rule `0013_rls_disabled_in_public` is treated as a hard error.
- **Internal-only catalog tables**
  - Tables used only by ingestion scripts and service-role clients (for example, `bricklink_minifigs`, `bricklink_minifig_mappings`, `bl_sets`, `bl_set_minifigs`, `rb_minifig_parts`) are treated as internal catalog data:
    - They have `ALTER TABLE public.<table> ENABLE ROW LEVEL SECURITY;` in a Supabase CLI migration.
    - They do not define `SELECT` policies for `anon` / `authenticated`; access happens through the `SUPABASE_SERVICE_ROLE_KEY` client, which bypasses RLS.
- **Centralized client selection** (`app/lib/db/catalogAccess.ts`)
  - Tables are classified into three access levels:
    - **ANON_READABLE_TABLES**: `rb_sets`, `rb_parts`, `rb_colors`, `rb_themes`, `rb_part_categories`, `rb_set_parts`, `rb_download_versions` → use `getCatalogReadClient()` (anon key)
    - **SERVICE_ROLE_TABLES**: `rb_inventories`, `rb_inventory_parts`, `rb_inventory_minifigs`, `rb_minifigs`, `rb_minifig_parts`, `rb_minifig_images`, `bl_*`, `bricklink_*`, `part_id_mappings` → use `getCatalogWriteClient()` (service role)
    - **USER_TABLES**: `user_profiles`, `user_preferences`, `user_sets`, `user_minifigs`, etc. → use auth server client or service role depending on context
  - This eliminates the mental overhead of choosing the right client per-table and documents RLS policy requirements in one place.
- **Future catalog tables**
  - New BrickLink/Rebrickable-backed catalog tables should default to the same internal-only pattern unless there is an explicit requirement for direct anon/auth reads.
  - If anon/auth reads are ever needed, add explicit `SELECT` policies in the creating migration and document the decision here.
  - Always add new tables to the appropriate set in `catalogAccess.ts` to maintain centralized client selection.

## Exports & Pricing

- **CSV export adapters**
  - Rebrickable CSV and BrickLink wanted-list CSV are implemented as adapters that map the same internal inventory model into provider-specific field sets.
  - BrickLink wanted lists are named `"{setNumber} — {setName} — mvp"`; condition defaults are accepted and per-row condition is deferred.
- **BrickLink pricing**
  - Pricing is opt-in and triggered explicitly (per-row or at the set level) via UI actions.
  - Route Handlers call BrickLink price guide endpoints server-side; the UI surfaces aggregate ranges and per-part links without storing sensitive pricing settings client-side.

## Error Handling & UX Patterns

- **Normalized errors**
  - Domain errors use `AppError` / `throwAppErrorFromResponse` to translate HTTP failures into consistent codes and messages.
  - API routes always return JSON payloads (including error cases) so clients never attempt to parse empty responses.
- **Key UI patterns**
  - `InventoryFilterTabs` exposes All/Missing/Owned and category/color filters with horizontal scrolling and enlarged touch targets.
  - The search bar uses an above-field label and inline clear button with a large hit target.
  - The set top bar composes set metadata, owned/missing summary, user status chips, and pricing actions into a single, reusable component.

## Logging & Telemetry

- Use the shared logger from `@/lib/metrics` (`logger.debug|info|warn|error`) for all diagnostics.
- `no-console` lint rule blocks `console.log/info/debug` (warn/error allowed); prefer `logger`.
- In dev-only verbose paths, gate with `if (process.env.NODE_ENV !== 'production') logger.debug(...)`.
- Production builds emit JSON logs via `logger`; Next.js `removeConsole` strips raw console calls as a safety net.

## Performance Notes

- Inventory tables are virtualized to keep large sets responsive.
- Heavy derived calculations (sorting, grouping, totals) belong in `useInventoryViewModel` or similar view-model hooks, not in leaf components.
- The `useInventory` hook currently recomputes `totalMissing` on each owned-store change; for very large sets, consider:
  - Moving aggregate totals into the store as derived state,
  - Using incremental updates instead of full recomputation,
  - Or limiting initial work to visible rows and calculating the rest on demand.



