# Active Context

## Current Focus

- Keep the MVP flows (search, inventory, owned vs missing, CSV exports, optional pricing) stable on top of the Supabase-backed catalog.
- Introduce simple Supabase-backed accounts and persistence without regressing the anonymous/local-only experience.
- Exercise and harden Identify and pricing flows against real-world sets and parts.
- **BrickLink is now the exclusive source of truth for minifigure data** - the migration from Rebrickable has been completed.

## This Iteration

- **BrickLink Minifig Migration Complete** (December 2025):
  - All minifig data now comes from BrickLink tables directly (`bl_set_minifigs`, `bricklink_minifigs`, `bl_minifig_parts`).
  - Self-healing system triggers BrickLink API sync on-demand when data is missing.
  - Old RB→BL mapping logic has been completely removed.
  - Dev tooling for manual review has been deleted (no longer needed).
- Implement and wire Supabase auth and basic user data (profiles, preferences, user sets, owned parts).
- Connect owned/pinned state to Supabase for signed-in users while preserving `localStorage` fallback for anonymous usage.
- Validate CSV exports and Identify responses against Rebrickable/BrickLink import behavior on the target test sets.
- Tighten pricing UX and performance on the set page and inventory table.
- **Legal and Compliance Updates (December 2025)**:
  - Updated Terms of Service to include subscription tiers (Plus/Pro) and beta transition disclosures (currently commented out awaiting Stripe rollout).
  - Updated Privacy Policy to disclose Brickognize image identification data flow and feature quota tracking (Stripe and API key sections currently commented out).
- **UI and Feature Gating (December 2025)**:
  - Commented out "Bring Your Own API Key" and "Rebrickable account" sections from the Terms, Privacy, Account, and Pricing pages as these features are not yet available.
- Introduce Supabase SSR auth for:
  - Layout + theme bootstrap (SSR-resolved theme passed to `ThemeProvider` via next-themes).
  - Account page (`app/account/page.tsx` + `AccountPageClient`).
  - User sets hydration (`/api/user-sets` + `useHydrateUserSets`).
  - BrickLink pricing endpoints (`/api/prices/bricklink` and `/api/prices/bricklink-set`) and `useInventoryPrices`.
  - Group-session host actions (`/api/group-sessions`, `/api/group-sessions/[slug]/end`) and group participant join (`/api/group-sessions/[slug]/join`).
- Add client-side minifig caching (Dexie `catalogMinifigs` table) so minifig lookups can be reused offline and across sets.

## BrickLink Minifig Architecture (New)

### Data Flow
1. **Set inventory request** → `getSetInventoryRowsWithMeta()` → `getSetMinifigsBl()` 
2. If minifig data missing → Self-heal: `processSetForMinifigMapping()` triggers BrickLink API
3. Minifigs returned with BL IDs as primary identifiers
4. No RB→BL mapping needed - BL is the source of truth

### Key Files
- `app/lib/bricklink/minifigs.ts` - BL-only data access functions
- `scripts/minifig-mapping-core.ts` - Bulk sync logic (exports `processSetForMinifigMapping`, `fetchAndCacheMinifigParts`)
- `app/lib/services/inventory.ts` - Inventory with BL minifig enrichment
- `app/lib/services/minifigEnrichment.ts` - BL-only minifig enrichment

### Self-Healing
When a set's minifig data is accessed and found incomplete:
1. `bl_sets.minifig_sync_status` checked
2. If not 'ok', trigger `processSetForMinifigMapping()`
3. Re-fetch from `bl_set_minifigs` after sync
4. Deduplication via `inFlightSyncs` Map prevents concurrent API calls

## Notes

- Target test sets:
  - 1788 — Pirate Treasure Chest
  - 6781 — SP-Striker
  - 6989 — Mega Core Magnetizer
  - 40597 — Scary Pirate Island
  - 21322 — Pirates of Barracuda Bay
- BrickLink pricing requests currently use USD + `country_code=US` by default; exposing currency/country as a user preference is future work.
- Identify refactor note: current flows are performant, but logic is duplicated across `/api/identify` (image), `/api/identify/sets` (part/minifig), and `/api/identify/bl-supersets`. Consider extracting a shared "part/minifig → sets with normalized metadata" helper that does enrichment (set summary, theme, numParts), consistent name fallback, and is reused by all three routes to avoid divergence.

### Identify — deterministic BL fallback (updated)
- BL response shapes (typed in `app/lib/bricklink.ts`):
  - Supersets come as color buckets: `[{ color_id, entries: [{ item: { no, name, image_url, type }, quantity, appears_as }, ...] }, ...]`, normalized to `BLSupersetItem`.
  - Subsets come as grouped entries: `[{ entries: [...] }, ...]`, normalized to `BLSubsetItem` (component with color/quantity).
- Pipeline order (deterministic):
  1) RB-first: resolve candidates to Rebrickable IDs and fetch sets (with color hints/available colors).
  2) If no RB sets, but a BL candidate exists, go to BL fallback (short-circuit BL-only candidates directly to fallback).
  3) BL fallback order: cache hit (30d TTL) → supersets (uncolored, then per-color) → subset intersection against our RB catalog → supersets of subparts → heuristic component hits. Each stage sets `source` (`bl_supersets`, `bl_subsets_intersection`, `bl_components`).
  4) Results are enriched with RB summaries when possible and upserted into `bl_parts` / `bl_part_sets` with the chosen source.
- Logging: structured `logger.debug/warn` (dev-gated) for cache hit/miss, source chosen, subset availability, and budget errors; avoids raw payload spam in prod.
- BL-only candidates: `resolveCandidates` preserves BL-only when RB resolution fails; `resolveIdentifyResult` short-circuits to BL fallback when only BL candidates remain and returns `source` in the response.

## Active Decisions

- MVP remains fully usable without auth; Supabase accounts are additive and should not break local-only flows.
- Rebrickable stays the canonical source for parts/sets; **BrickLink is now the canonical source for minifigures**.
- BrickOwl export and advanced rarity analytics remain out of scope for now.
- Accessibility is "good enough for MVP" but complex widgets (filters, color pickers, Identify chips, modals) should be revisited as part of the improvements backlog.
- The `bricklink_minifig_mappings` table is kept for historical data but no longer actively used for runtime lookups.
