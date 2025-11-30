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



