# Batch Inventory Endpoint

## Problem

When a user has many sets with cold IndexedDB caches (new device, cache clear, bulk import), the collection parts view fires N separate `GET /api/inventory` requests — one per uncached set. Each request triggers ~10 Supabase queries internally. For 20 sets, that's 20 HTTP round trips and ~200 DB queries.

The incremental case (adding one new set) is already efficient — only one API call fires for the uncached set. This optimization targets the cold-cache / bulk scenario.

## Solution

A new `POST /api/inventory/batch` endpoint that accepts up to 50 set numbers, fetches all inventories with shared Supabase queries, and returns per-set results. The client chunks uncached sets into batch requests instead of individual fetches.

## Architecture

### New Route: `POST /api/inventory/batch`

**File:** `app/api/inventory/batch/route.ts`

Accepts:

```typescript
{
  sets: string[];        // 1-50 set numbers
  includeMeta?: boolean; // include minifig metadata
}
```

Returns:

```typescript
{
  inventories: {
    [setNumber: string]: {
      rows: InventoryRow[];
      meta?: { totalMinifigs: number };
    }
  };
  inventoryVersion: string | null;  // shared, fetched once
  partial: boolean;  // true if any set failed
}
```

- Validates max 50 sets via Zod schema
- Calls `getSetInventoriesBatchWithMeta(sets)`
- Gets `inventoryVersion` once (reuses existing `getInventoryVersion`)
- Individual set failures are graceful — successful sets still return, failed sets omitted, `partial: true` set
- Cache-Control: `private, max-age=300` (same as single endpoint)

### New Catalog Function: `getSetInventoriesLocalBatch`

**File:** `app/lib/catalog/sets.ts`

Signature: `(setNumbers: string[]) => Promise<Map<string, InventoryRow[]>>`

Replaces N calls to `getSetInventoryLocal` with shared queries across all sets.

**Phase 1 — Inventory discovery (1 query):**

- `rb_inventories` with `.in('set_num', setNumbers)`
- Pick latest version per set number
- Collect all selected inventory IDs
- Build `inventoryIdToSetNum` mapping

**Phase 2 — Parts + minifigs (2+ parallel queries):**

- `rb_inventory_parts_public` with `.in('inventory_id', allInvIds)`, filtered to `is_spare = false`
- `rb_inventory_minifigs` with `.in('inventory_id', allInvIds)`
- Group results by inventory_id → set_num in memory
- **Row limit handling:** Supabase defaults to 1000 rows per query. For 50 sets averaging 300+ parts, `rb_inventory_parts_public` could return 15,000+ rows. Chunk inventory IDs into groups that keep expected row counts under ~5,000 and use `.limit(10000)` as a safety net. Similarly apply chunking to `rb_parts` in Phase 3 if the deduplicated part count exceeds 1,000.

**Phase 3 — Shared metadata (4 parallel queries):**

- `rb_parts` with `.in('part_num', allPartNums)` — deduplicated across all sets
- `rb_colors` with `.in('id', allColorIds)` — deduplicated
- `getCategoryMap()` — already in-memory cached
- `queryPartRarityBatch(allPartColorPairs)` — all sets combined into one batched rarity query

**Phase 4 — Minifig parent metadata (3 parallel queries):**

- `rb_minifigs` with `.in('fig_num', allFigNums)` — deduplicated
- `rb_minifig_images` with `.in('fig_num', allFigNums)`
- `rb_minifig_rarity` with `.in('fig_num', allFigNums)`

**Phase 5 — Per-set assembly (in-memory only):**

- Loop through sets, build `InventoryRow[]` per set using shared lookup maps
- Same row construction logic as current `getSetInventoryLocal` lines 528-576 (part metadata, color names, categories, rarity, element IDs)
- Same minifig parent row construction as current lines 660-691
- Returns `Map<string, InventoryRow[]>` — sets not found in Supabase return empty arrays

**Legacy fallback:** The current `getSetInventoryLocal` falls back to `rb_set_parts` when `rb_inventories` has no record for a set. The batch function does NOT replicate this fallback — sets missing from `rb_inventories` return empty arrays, which triggers the Rebrickable API fallback in the service layer (step 2). This is intentional: the `rb_set_parts` path lacks minifig data, element IDs, and image URLs, making it lower quality than the API fallback.

**Supabase row limits:** The Supabase JS client defaults to 1000 rows per query. Batch queries that aggregate across many sets can exceed this. Mitigation: chunk inventory IDs in Phase 2 (groups of ~10 to keep part row counts under 5,000), use `.limit(10000)` on parts queries, and chunk `.in()` calls in Phase 3 when deduplicated part/color counts exceed 1,000.

### New Service Function: `getSetInventoriesBatchWithMeta`

**File:** `app/lib/services/inventory.ts`

Signature: `(setNumbers: string[]) => Promise<Map<string, InventoryResult>>`

Orchestrates the full batch pipeline:

1. **Catalog batch:** Call `getSetInventoriesLocalBatch(setNumbers)` → `Map<string, InventoryRow[]>`
2. **Rebrickable fallback:** For sets with empty results, fall back to `getSetInventory(setNumber)` individually. These are rare (set not in Supabase catalog) and rate-limited.
3. **Resolution context:** Build `ResolutionContext` once from all rows combined (1 DB call for color maps, part mappings extracted from all rows)
4. **Per-set identity resolution (in-memory loop):** Apply `resolveCatalogPartIdentity` and `resolveMinifigParentIdentity` to each set's rows using the shared context
5. **Batch minifig subparts:** Single `rb_minifig_parts` query with `.in('fig_num', allFigNums)` across all sets. Group subparts by `fig_num`. Then per-set loop: build child rows, parent/component relations using existing logic from `getSetInventoryRowsWithMeta` lines 170-292.
6. **Batch rarity enrichment:** Collect all subpart rows without `setCount` across all sets, single `queryPartRarity` call
7. **Batch image backfill:** Single `backfillBLImages` call with all rows from all sets combined. Note: `backfillBLImages` has a hard cap of 10 BrickLink API fetches per call — this is acceptable for batch mode since most parts have RB images and the cap only affects cache misses.
8. **Return:** `Map<string, InventoryResult>` with per-set rows and minifig metadata

### Client Changes: `loadCatalogPartsForSets`

**File:** `app/hooks/useCollectionParts.ts`

Update the uncached fetching logic:

```
if uncached.length === 0 → done (all from IndexedDB)
if uncached.length === 1 → existing single GET /api/inventory (unchanged)
if uncached.length > 1  → POST /api/inventory/batch, chunked into groups of 50
```

For each batch response, process per-set:

- `setCachedInventory(setNum, data.rows, { inventoryVersion })` — cache to IndexedDB
- Re-read from IndexedDB into the result map (same as current single-set flow)

### What Stays Untouched

- `GET /api/inventory` route — unchanged, still used for single-set fetches and by `useInventory.ts`
- `useInventory.ts` (TanStack Query hook for individual set view page) — unchanged
- `getSetInventoryLocal` — unchanged, still used by the single endpoint
- IndexedDB schema and caching functions — unchanged
- Identity resolution functions — unchanged (called per-set using shared context)
- `setCachedInventory` / `getCachedInventory` — unchanged

## Query Count Comparison (10 sets)

| Layer                                 | Current (10x single) | Batched |
| ------------------------------------- | -------------------- | ------- |
| HTTP requests                         | 10                   | 1       |
| `rb_inventories`                      | 10                   | 1       |
| `rb_inventory_parts_public`           | 10                   | 1       |
| `rb_inventory_minifigs`               | 10                   | 1       |
| `rb_parts`                            | 10                   | 1       |
| `rb_colors`                           | 10                   | 1       |
| `rb_part_rarity` (batched internally) | 10                   | 1       |
| Minifig parent metadata               | 30 (3 per set)       | 3       |
| Color maps (identity resolution)      | 10                   | 1       |
| `rb_minifig_parts` (subparts)         | 10                   | 1       |
| Subpart rarity (batched internally)   | 10                   | 1       |
| Image backfill (cache lookup)         | 10                   | 1       |
| **Total Supabase queries**            | **~130**             | **~14** |

## Constraints

- **Max 50 sets per batch request** — prevents oversized responses and Vercel function timeouts
- **Client chunks** larger collections into groups of 50
- **Rebrickable fallback** stays per-set — rate-limited external API, not worth batching
- **Supabase `.in()` limit** — deduplicated part/color/fig lists stay well under PostgreSQL limits for 50 sets
- **No auth required** — inventory data is public (same as existing endpoint)
- **Shared `inventoryVersion`** — there is one global version in `rb_download_versions` for `inventory_parts`, not per-set. Fetched once per batch request.
- **Response size** — 50 sets could produce 5-15 MB of JSON. Next.js/Vercel applies gzip compression automatically. The 50-set cap keeps this manageable; if needed we can lower to 25.

## Error Handling

- If the entire batch fails (Supabase down), return 500
- If individual sets fail (e.g., Rebrickable circuit open for a fallback set), omit them from `inventories` and set `partial: true`
- Client falls back gracefully — uncached sets that failed simply won't appear in the collection parts view until next attempt

## Testing

- Unit test `getSetInventoriesLocalBatch` with mocked Supabase responses
- Unit test `getSetInventoriesBatchWithMeta` verifying per-set identity resolution and minifig enrichment
- Unit test route handler validation (empty array, >50 sets, invalid set numbers)
- Integration test: compare batch results against N individual `getSetInventoryRowsWithMeta` calls for same sets — results should be identical
- Test with mixed batch: sets with minifigs + sets without minifigs in the same request
- Test Supabase row limit handling: verify chunking produces complete results when total parts exceed 1,000
- Test client-side chunking at boundaries: exactly 50, 51, and 100 uncached sets
