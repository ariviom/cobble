# Active Context

## Current Focus

- Keep the MVP flows (search, inventory, owned vs missing, CSV exports, optional pricing) stable on top of the Supabase-backed catalog.
- Introduce simple Supabase-backed accounts and persistence without regressing the anonymous/local-only experience.
- Exercise and harden Identify and pricing flows against real-world sets and parts.
- Harden and extend the **minifig RB↔BL mapping** pipeline so that:
  - All minifigs in **user sets** have a deterministic per-set BrickLink ID mapping stored in Supabase.
  - The UI shows BrickLink IDs (and builds BL URLs/pricing requests) even for sets that weren’t pre-synced, by performing on-demand mapping.

## This Iteration

- Implement and wire Supabase auth and basic user data (profiles, preferences, user sets, owned parts).
- Connect owned/pinned state to Supabase for signed-in users while preserving `localStorage` fallback for anonymous usage.
- Validate CSV exports and Identify responses against Rebrickable/BrickLink import behavior on the target test sets.
- Tighten pricing UX and performance on the set page and inventory table.
- Introduce Supabase SSR auth for:
  - Layout + theme bootstrap (SSR-resolved theme passed to `ThemeProvider` via next-themes).
  - Account page (`app/account/page.tsx` + `AccountPageClient`).
  - User sets hydration (`/api/user-sets` + `useHydrateUserSets`).
  - BrickLink pricing endpoints (`/api/prices/bricklink` and `/api/prices/bricklink-set`) and `useInventoryPrices`.
  - Group-session host actions (`/api/group-sessions`, `/api/group-sessions/[slug]/end`) and group participant join (`/api/group-sessions/[slug]/join`).
- Build and refine a shared minifig mapping module (`scripts/minifig-mapping-core.ts`) plus:
  - CLI entrypoints for bulk mapping:
    - `npm run build:minifig-mappings:user` (user sets, respects `MINIFIG_MAPPING_MAX_SETS`, default 500).
    - `npm run build:minifig-mappings:all` (all `rb_sets`, same cap).
  - A server-only adapter (`app/lib/minifigMapping.ts`) that uses the same core logic for:
    - Per-request, per-set lookups.
    - On-demand mapping when a set is loaded that hasn't been synced yet.
- Enable RLS on internal BrickLink/Rebrickable catalog tables (`bricklink_minifigs`, `bricklink_minifig_mappings`, `bl_sets`, `bl_set_minifigs`, `rb_minifig_parts`, `bl_minifig_parts`, `part_id_mappings`) via Supabase CLI migrations so the database linter stays clean.
- **Part ID mapping** infrastructure for RB→BL part mapping:
  - `part_id_mappings` table stores manual and auto-generated mappings (e.g., suffix stripping `3957a` → `3957`).
  - `/api/parts/bricklink` route checks `part_id_mappings` first, falls back to Rebrickable `external_ids`, and auto-persists successful suffix fallbacks.
- **Minifig component part mapping** extends the minifig mapping pipeline:
  - `bl_minifig_parts` caches BrickLink minifig component parts.
  - Bulk mapping scripts now have a Phase 2 that maps RB minifig parts → BL minifig parts (controlled by `MINIFIG_COMPONENT_API_BUDGET`, default 500).
  - Mappings are stored in `part_id_mappings` with `source='minifig-component'`.
- Add client-side minifig caching (Dexie `catalogMinifigs` table) so minifig lookups and RB→BL mappings can be reused offline and across sets.
- **Minifig data enrichment** to fix inconsistencies between set page and minifig detail page:
  - Create shared `minifigEnrichment.ts` service for on-demand fetching of images, subparts, and BL mappings.
  - Add `/api/minifigs/enrich` batch endpoint for client-side lazy loading.
  - Create `useMinifigEnrichment` hook for lazy enrichment on set pages.
  - Fix broken image fallback URL in `catalog/sets.ts`.
  - Ensure minifig subparts are always visible for piece counting toward totals.

## Notes

- Target test sets:
  - 1788 — Pirate Treasure Chest
  - 6781 — SP-Striker
  - 6989 — Mega Core Magnetizer
  - 40597 — Scary Pirate Island
  - 21322 — Pirates of Barracuda Bay
- BrickLink pricing requests currently use USD + `country_code=US` by default; exposing currency/country as a user preference is future work.
- Identify refactor note: current flows are performant, but logic is duplicated across `/api/identify` (image), `/api/identify/sets` (part/minifig), and `/api/identify/bl-supersets`. Consider extracting a shared “part/minifig → sets with normalized metadata” helper that does enrichment (set summary, theme, numParts), consistent name fallback, and is reused by all three routes to avoid divergence.

## Active Decisions

- MVP remains fully usable without auth; Supabase accounts are additive and should not break local-only flows.
- Rebrickable stays the canonical source for parts/sets; BrickLink is used only for pricing and supersets in Identify.
- BrickOwl export and advanced rarity analytics remain out of scope for now.
- Accessibility is “good enough for MVP” but complex widgets (filters, color pickers, Identify chips, modals) should be revisited as part of the improvements backlog.
- Once minifig RB↔BL coverage is high and stable, plan to phase out and remove the `bricklink_minifig_mappings` table (and its runtime usage), treating `bl_set_minifigs` as the canonical mapping source and deriving any global RB→BL views from it instead.
