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
      - Matches RB ↔ BL minifigs by normalized name, Jaccard similarity, and a greedy fallback within the set’s small candidate list.
      - Upserts mappings into `bl_set_minifigs` and a global `bricklink_minifig_mappings` cache.
    - A server-only helper (`app/lib/minifigMapping.ts`) that:
      - Reads per-set mappings (`mapSetRebrickableFigsToBrickLink`).
      - Provides an **on-demand** variant (`mapSetRebrickableFigsToBrickLinkOnDemand`) that:
        - Detects missing RB fig IDs for a set.
        - Checks `bl_sets.minifig_sync_status` and, if not `'ok'`, runs `processSetForMinifigMapping` to hit BrickLink once for that set.
        - Re-reads `bl_set_minifigs` and merges the new mappings so the UI shows BrickLink IDs instead of “Not mapped”.
      - Falls back to the global `bricklink_minifig_mappings` table for any remaining unmapped RB IDs.

## Persistence & Auth Patterns

- **Local-first owned state**
  - Owned quantities live in a Zustand store backed by `localStorage` under a versioned key.
  - Reads hydrate from local cache; writes are debounced and prefer `requestIdleCallback` when available to avoid blocking the main thread.
- **Supabase-backed sync**
  - Supabase tables hold user profiles, preferences, per-set status, per-set owned parts, and optional global parts inventory.
  - The intended flow is: anonymous users use local-only; on first login, local owned state is migrated into Supabase and then kept in sync.
- **Group builds**
  - Collaborative sessions are represented by `group_sessions` and related tables in Supabase.
  - The host’s owned state is the single source of truth; participant edits stream via Supabase Realtime channels keyed by `group_sessions.id` and are applied to the host’s rows.

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
- **Future catalog tables**
  - New BrickLink/Rebrickable-backed catalog tables should default to the same internal-only pattern unless there is an explicit requirement for direct anon/auth reads.
  - If anon/auth reads are ever needed, add explicit `SELECT` policies in the creating migration and document the decision here.

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

## Performance Notes

- Inventory tables are virtualized to keep large sets responsive.
- Heavy derived calculations (sorting, grouping, totals) belong in `useInventoryViewModel` or similar view-model hooks, not in leaf components.
- The `useInventory` hook currently recomputes `totalMissing` on each owned-store change; for very large sets, consider:
  - Moving aggregate totals into the store as derived state,
  - Using incremental updates instead of full recomputation,
  - Or limiting initial work to visible rows and calculating the rest on demand.



