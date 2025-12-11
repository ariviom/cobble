# RB → BL Mapping Hardening Plan

## Purpose

Make Rebrickable → BrickLink mappings deterministic, observable, and resilient across parts, colors, minifigs, and component parts. Reduce ambiguous picks, silent fallbacks, and sticky cache states.

## Current Mapping Surfaces (code pointers)

- Parts: `mapToBrickLink` (`app/lib/mappings/rebrickableToBricklink.ts`) → uses `/api/colors/mapping` and `/api/parts/bricklink`.
- Part lookup API: `resolveBrickLinkId` (`app/api/parts/bricklink/route.ts`) → table `part_id_mappings`, Rebrickable `external_ids`, suffix stripping.
- Colors: `/api/colors/mapping` builds RB→BL color map from Rebrickable `ext_ids` + fallback map.
- Pricing/CSV consumers: `pricing.ts` (price guide) and `export/bricklinkCsv.ts` call `mapToBrickLink`.
- Minifig IDs: `app/lib/minifigMappingBatched.ts` (runtime lookup, caches), `scripts/minifig-mapping-core.ts` (batch creation), `app/api/minifigs/[figNum]/route.ts` (on-demand + subparts).
- Minifig component parts: mapped in `scripts/minifig-mapping-core.ts` and persisted to `part_id_mappings`.
- Inventory ingestion: `rebrickable/inventory.ts` and `catalog/sets.ts` attach `bricklinkPartId` from RB `external_ids`.

## Rebrickable API Notes (relevant)

- `GET /lego/colors/` → `external_ids.BrickLink.ext_ids` array; include `inc_colors=1` on part endpoints if needed.
- `GET /lego/parts/{partId}/?inc_part_details=1` → includes `external_ids`, `print_of`; `external_ids.BrickLink` can be array or object with `ext_ids`.
- `GET /lego/parts/?bricklink_id={id}&page_size=5&inc_part_details=1` → RB search by BL id (used as hint).
- `GET /lego/sets/{set}/parts/?inc_part_details=1&page_size=1000` → inventories with `external_ids`.
- `GET /lego/minifigs/{id}/parts/?inc_part_details=1&page_size=1000` → minifig subparts with `external_ids`.
- Pagination: `next` URL provided; follow until null.
- Rate limiting: keep per-IP budget conservative; prefer catalog-backed data when available.

## BrickLink API Notes (relevant)

- `/items/SET/{setNum}/subsets` → minifigs and components for a set.
- `/items/MINIFIG/{minifigNo}/subsets` → component parts of a minifig.
- Price guide: `/priceguide` endpoints (via `blGetPartPriceGuide`) require item type (`PART`/`MINIFIG`), item no, optional color.
- Item IDs are case-insensitive alphanumerics; colors are numeric ids.
- Rate limits: daily call caps (internal budget ~2500/day noted in scripts); batch and cache aggressively.

## Determinism & Brittleness Risks

- Color mapping: picks first `ext_ids` entry; empty map on fetch failure; no TTL; nulls not cached separately.
- Part IDs: `mapToBrickLink` falls back to RB id silently; `resolveBrickLinkId` picks first non-empty external id and a single suffix strip; no validation against BL format.
- External IDs: multiple BL ids are unordered; extraction always takes first; trimming/normalizing is shallow.
- Minifig mapping: name-normalized uniqueness + Jaccard + greedy “single remaining pair” can change with data order; low-confidence matches persisted without guardrails.
- Component part mapping: category + first-available candidate; ordering of BL parts can change results; tie-breakers missing.
- Caching: in-memory caches for colors, part mappings, minifig mappings store successes (and sometimes nulls) without TTL; bad early results stick.
- On-demand minifig mapping: null results cached; later successful syncs may not be observed without cache invalidation.

## Hardening Recommendations

Quick wins (implement first)

- Deterministic color mapping: normalize/trim ids, sort numerically, prefer non-zero; cache with TTL (e.g., 15–60 min) and cache nulls separately; log missing colors.
- Deterministic external id pick: normalize strings, dedupe, sort (numeric first, then lexicographic), return primary + alternates for logging.
- Remove silent RB-id fallback in `mapToBrickLink`: return `null` with reason (`no_color`, `no_part_mapping`, `ambiguous_ids`) and let callers collect unmapped rows.
- Add short TTL for minifig/part caches and invalidate after on-demand sync completes; clear null entries on sync success.
- Confidence gating: require threshold (e.g., ≥0.6) before upserting minifig mappings; skip or mark “pending” when below.
- Tie-breakers in component mapping: prefer color match, then quantity match, then lexicographic id; if ambiguous, do not persist.

Medium-term

- Ambiguity tracking: persist ambiguous candidates to a review table or log with metrics; avoid auto-upsert when multiple BL ids survive filters.
- Deterministic ordering in minifig mapping: sort RB/BL candidates by normalized name then id before similarity passes; drop “single remaining pair” unless confidence is reasonable.
- Suffix strategy: only persist suffix-stripped mapping when the base id is confirmed via external_ids; otherwise leave unmapped.
- Validation before persist: ensure BL id matches allowed pattern and (optionally) exists via a cached BL catalog check for low-confidence cases.
- Structured mapping status: expose `mapped | unmapped | ambiguous` to callers (pricing, CSV) and surface unmapped counts to users.

## Testing & Validation

- Unit tests: `extractBricklinkPartId` deterministic selection; color mapping selection; suffix-handling; minifig matching tie-breaks.
- Replay/determinism report: run mappings twice on the same dataset; flag any non-identical outputs and ambiguous selections.
- CSV import smoke tests: generate BrickLink wanted list CSV from a sample set and import into BrickLink test account; verify rejects are only unmapped rows.
- Metrics: missing colors, ambiguous ids, low-confidence skipped, cache hit/miss/null-hit, suffix auto-maps, on-demand sync success/fail.

## Implementation Pointers (suggested order)

1. Tighten `extractBricklinkPartId` (normalize, sort, return primary+alternates; callers log ambiguity).
2. Add TTL + null-TTL to caches (colors, part mappings, minifig mappings) and invalidate on sync completion.
3. Change `mapToBrickLink` to fail fast (no RB-id fallback) and propagate structured reasons to pricing/CSV.
4. Add confidence thresholds and deterministic ordering to `processSetForMinifigMapping`; gate component-part upserts behind tie-breakers.
5. Add observability (metrics/logs) and a small “determinism report” script/route to catch regressions early.
