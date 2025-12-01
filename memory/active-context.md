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
  - Layout + theme bootstrap (`app/layout.tsx` + `ThemeScript` + `ThemeProvider`).
  - Account page (`app/account/page.tsx` + `AccountPageClient`).
  - User sets hydration (`/api/user-sets` + `useHydrateUserSets`).
  - BrickLink pricing endpoints (`/api/prices/bricklink` and `/api/prices/bricklink-set`) and `useInventoryPrices`.
  - Group-session host actions (`/api/group-sessions`, `/api/group-sessions/[slug]/end`) and group participant join (`/api/group-sessions/[slug]/join`).
- Build and refine a shared minifig mapping module (`scripts/minifig-mapping-core.ts`) plus:
  - CLI entrypoints for bulk mapping:
    - `npm run build:minifig-mappings:user` (user sets, respects `MINIFIG_MAPPING_MAX_SETS`, default 2500).
    - `npm run build:minifig-mappings:all` (all `rb_sets`, same cap).
  - A server-only adapter (`app/lib/minifigMapping.ts`) that uses the same core logic for:
    - Per-request, per-set lookups.
    - On-demand mapping when a set is loaded that hasn’t been synced yet.

## Notes

- Target test sets:
  - 1788 — Pirate Treasure Chest
  - 6781 — SP-Striker
  - 6989 — Mega Core Magnetizer
  - 40597 — Scary Pirate Island
  - 21322 — Pirates of Barracuda Bay
- BrickLink pricing requests currently use USD + `country_code=US` by default; exposing currency/country as a user preference is future work.

## Active Decisions

- MVP remains fully usable without auth; Supabase accounts are additive and should not break local-only flows.
- Rebrickable stays the canonical source for parts/sets; BrickLink is used only for pricing and supersets in Identify.
- BrickOwl export and advanced rarity analytics remain out of scope for now.
- Accessibility is “good enough for MVP” but complex widgets (filters, color pickers, Identify chips, modals) should be revisited as part of the improvements backlog.
- Once minifig RB↔BL coverage is high and stable, plan to phase out and remove the `bricklink_minifig_mappings` table (and its runtime usage), treating `bl_set_minifigs` as the canonical mapping source and deriving any global RB→BL views from it instead.
