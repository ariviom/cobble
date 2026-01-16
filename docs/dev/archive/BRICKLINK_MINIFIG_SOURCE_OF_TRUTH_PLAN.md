# Bricklink Minifigure Source of Truth Migration Plan

**Created:** December 16, 2025  
**Status:** Planning Phase  
**Priority:** 🟠 High

---

## Executive Summary

This plan migrates from Rebrickable to Bricklink as the **exclusive** source of truth for minifigure data (IDs, metadata, and component parts). The goal is to eliminate all complex ID reconciliation logic, remove manual review tooling, and create a deterministic system that aligns with future pricing features.

**Key Decision:** Use Bricklink as the **only** source for minifigures and minifig parts. No fallbacks to Rebrickable for minifig data. Maintain Rebrickable only for set inventories and part catalogs.

**Context:** Pre-launch, single user. Can be aggressive with refactoring. User data can be nuked and reimported. Self-healing migration system will handle sets as they're viewed.

---

## Current State Analysis

### Minifigure ID Handling

**Current Flow:**

1. Primary IDs: Rebrickable `fig_num` (from `rb_minifigs` CSV)
2. Mapping Logic: Complex multi-step reconciliation via:
   - `bl_set_minifigs` (per-set mappings with `rb_fig_id` → `minifig_no`)
   - `bricklink_minifig_mappings` (global RB→BL mappings)
   - Heuristic matching in `minifig-mapping-core.ts` (name normalization, image hashing, Jaccard similarity)
3. Runtime Resolution: `getMinifigMappingsForSetBatched()` with on-demand sync triggers

**Problems:**

- Manual review required for edge cases
- Mapping failures result in missing Bricklink IDs
- Complex fallback chains across multiple tables
- Inconsistent data between RB and BL sources

### Minifigure Parts/Subparts

**Current Flow:**

1. Storage: `rb_minifig_parts` table (Rebrickable data)
2. Fetching: On-demand via Rebrickable API (`/lego/minifigs/{figNum}/parts/`)
3. Bricklink Mapping: Extract BL part IDs from `external_ids` field in RB part data
4. Caching: `minifigPartsCache` (1hr TTL) + `rb_minifig_parts` table

**Problems:**

- Requires API calls to Rebrickable for parts
- Bricklink part IDs may be missing or incorrect in `external_ids`
- Separate mapping logic for minifig component parts (`bl_minifig_parts` table exists but underutilized)

### Existing Bricklink Infrastructure

**Already Ingested:**

- `bricklink_minifigs`: Full minifig catalog (from XML download via `ingest-bricklink-minifigs.ts`)
- `bl_set_minifigs`: Minifigs per set (batch ingested via `processSetForMinifigMapping()`)
  - Includes: `minifig_no`, `name`, `quantity`, `image_url`, `image_hash`, `rb_fig_id` (mapped)
- `bl_minifig_parts`: Minifig component parts (cached via `fetchAndCacheMinifigParts()`)
  - Includes: `bl_minifig_no`, `bl_part_id`, `bl_color_id`, `quantity`, `name`

**Key Insight:** We already have Bricklink minifig data per set. The infrastructure exists; we just need to use it as primary instead of secondary.

---

## Feasibility Assessment

### ✅ Pros of Using Bricklink as Source of Truth

1. **Deterministic IDs**: Bricklink minifig IDs are stable and don't require reconciliation
2. **Pricing Alignment**: Future pricing features require Bricklink IDs anyway
3. **Infrastructure Exists**: Batch ingestion already in place (`bl_set_minifigs`, `bl_minifig_parts`)
4. **Complete Data**: Bricklink provides minifig metadata, images, and component parts
5. **No Manual Review**: Eliminates need for mapping approval workflows
6. **Single Source**: Reduces complexity from dual-source reconciliation

### ⚠️ Cons and Challenges

1. **Set Inventory Dependency**: Set inventories (`rb_inventory_minifigs`) still use Rebrickable IDs
   - **Solution**: Keep RB→BL mapping for inventory lookups only (simplified, one-way, self-healing)
2. **Historical Data**: Existing user data (`user_minifigs`) uses Rebrickable IDs
   - **Solution**: Export user set IDs, nuke user minifigs, reimport from sets using BL IDs
3. **Search/Discovery**: Rebrickable search API may be better for finding minifigs
   - **Solution**: Keep RB search for discovery, but map results to BL IDs immediately
4. **Missing Mappings**: Older sets may not have complete BL minifig data yet
   - **Solution**: Self-healing system - trigger BL sync on-demand when viewing sets, no RB fallback
5. **API Rate Limits**: Bricklink API has stricter rate limits than Rebrickable
   - **Solution**: Batch ingestion already handles this; runtime uses cached data; on-demand sync is rate-limited

### 📊 Data Completeness Analysis

**Bricklink Coverage:**

- Minifig catalog: Complete (all minifigs from XML download)
- Set minifigs: Batch ingested per set (via `bl_set_minifigs`)
- Minifig parts: Cached on-demand (via `bl_minifig_parts`)

**Gaps:**

- Some older sets may not have BL minifig data synced yet
- Component part mapping may be incomplete for some minifigs

**Mitigation:**

- Use `bl_sets.minifig_sync_status` to identify gaps
- **Self-healing migration**: When viewing a set without BL data, trigger sync on-demand
- Continue batch sync process to fill gaps proactively
- **No RB fallback** - if BL data unavailable, show empty state or trigger sync

---

## Where Else to Use Bricklink?

### Current Rebrickable Usage

| Data Type           | Source                           | Could Use Bricklink? | Recommendation                                          |
| ------------------- | -------------------------------- | -------------------- | ------------------------------------------------------- |
| **Set Inventories** | RB CSV (`rb_inventory_parts`)    | ❌ No                | Keep RB - more complete, includes spare flags           |
| **Part Catalog**    | RB CSV (`rb_parts`)              | ❌ No                | Keep RB - more comprehensive metadata                   |
| **Color Catalog**   | RB CSV (`rb_colors`)             | ⚠️ Maybe             | Keep RB - already standardized, BL colors less detailed |
| **Minifig Catalog** | RB CSV (`rb_minifigs`)           | ✅ Yes               | **Switch to BL** - primary source                       |
| **Minifig Parts**   | RB API (`rb_minifig_parts`)      | ✅ Yes               | **Switch to BL** - use `bl_minifig_parts`               |
| **Set Minifigs**    | RB CSV (`rb_inventory_minifigs`) | ✅ Yes               | **Switch to BL** - use `bl_set_minifigs`                |
| **Search**          | RB API                           | ⚠️ Keep              | Keep RB for discovery, map results to BL IDs            |

### Recommendation

**Switch to Bricklink for:**

- ✅ Minifig IDs (primary identifier)
- ✅ Minifig metadata (name, image, year)
- ✅ Minifig component parts
- ✅ Set-to-minifig associations

**Keep Rebrickable for:**

- ✅ Set inventories (parts lists)
- ✅ Part catalog
- ✅ Color catalog
- ✅ Search/discovery (map results to BL IDs)

---

## Self-Healing Migration System

**Principle:** Migrate sets on-demand as they're viewed, rather than requiring upfront batch migration.

**How It Works:**

1. User views a set page or requests minifig data
2. System checks `bl_sets.minifig_sync_status`
3. If status is not 'ok', trigger `processSetForMinifigMapping()` on-demand
4. Cache results in `bl_set_minifigs` and `bl_minifig_parts`
5. Display data from BL tables
6. Future requests use cached BL data (no sync needed)

**Benefits:**

- No upfront migration required
- Sets migrate naturally as users interact with them
- Works for any user (not just you)
- Handles edge cases gracefully (missing data triggers sync)

**Implementation Points:**

- `getSetInventoryRowsWithMeta()` - Check sync status, trigger if needed
- `app/api/minifigs/[figNum]/route.ts` - Check parts sync, trigger if needed
- `app/api/user/minifigs/sync-from-sets/route.ts` - Check sync status per set
- All minifig data access points check and trigger sync if needed

---

## Implementation Plan

### Phase 1: Database Schema Updates

**Goal:** Ensure Bricklink tables are the primary source for minifig data

**Changes:**

1. **Add reverse lookup index** on `bl_set_minifigs.rb_fig_id` (if not exists)
   - Enables efficient RB→BL lookups during migration
2. **Ensure `bl_minifig_parts` is complete**
   - Verify schema supports all needed fields
   - Add any missing indexes for performance

**Files:**

- `supabase/migrations/YYYYMMDDHHMMSS_bricklink_minifig_primary.sql`

**No Breaking Changes:** Existing tables remain; new indexes only

---

### Phase 2: Update Core Minifig Services

**Goal:** Change primary identifier from RB `fig_num` to BL `minifig_no` with **no RB fallbacks**

#### 2.1 Update `getSetInventoryRowsWithMeta()`

**File:** `app/lib/services/inventory.ts`

**Current:** Uses `getMinifigMappingsForSetBatched()` to map RB→BL IDs

**New:**

- Query `bl_set_minifigs` directly for set minifigs
- Use `minifig_no` as primary ID
- **Self-healing**: If `bl_sets.minifig_sync_status !== 'ok'`, trigger sync on-demand
- Store `rb_fig_id` as metadata only (for inventory lookups, not display)

**Changes:**

```typescript
// Before: Fetch RB minifigs, then map to BL
const rbMinifigs = await getSetInventoryLocal(setNumber);
const mappings = await getMinifigMappingsForSetBatched(setNumber, rbFigIds);

// After: Fetch BL minifigs directly, self-healing if missing
const { data: blSet } = await supabase
  .from('bl_sets')
  .select('minifig_sync_status')
  .eq('set_num', setNumber)
  .maybeSingle();

if (blSet?.minifig_sync_status !== 'ok') {
  // Self-healing: trigger sync on-demand
  await processSetForMinifigMapping(
    supabase,
    setNumber,
    '[inventory:on-demand]'
  );
}

const blMinifigs = await supabase
  .from('bl_set_minifigs')
  .select('minifig_no, name, quantity, image_url, rb_fig_id')
  .eq('set_num', setNumber);
```

#### 2.2 Update Minifig Detail API

**File:** `app/api/minifigs/[figNum]/route.ts`

**Current:** Accepts RB `figNum`, maps to BL ID, loads from `rb_minifig_parts`

**New:**

- Accept BL `minifig_no` as primary (no RB fallback)
- Load metadata from `bricklink_minifigs` table
- Load parts from `bl_minifig_parts` table
- **Self-healing**: If parts missing, trigger BL API fetch on-demand

**Changes:**

```typescript
// Before: figNum is RB ID, load from rb_minifig_parts
async function loadSubpartsFromDb(figNum: string) {
  // Query rb_minifig_parts
}

// After: figNum is BL ID, load from bl_minifig_parts
async function loadSubpartsFromDb(blMinifigNo: string) {
  const parts = await supabase
    .from('bl_minifig_parts')
    .select('bl_part_id, bl_color_id, quantity, name')
    .eq('bl_minifig_no', blMinifigNo);

  if (!parts.data?.length) {
    // Self-healing: trigger BL API fetch
    await fetchAndCacheMinifigParts(supabase, blMinifigNo, '[api:on-demand]');
    // Re-query
  }
}
```

#### 2.3 Update Minifig Enrichment

**File:** `app/lib/services/minifigEnrichment.ts`

**Current:** Fetches from Rebrickable API, stores in `rb_minifig_parts`

**New:**

- **Only** load from `bl_minifig_parts` (no RB API calls)
- **Self-healing**: If missing, trigger BL API fetch on-demand
- Remove all Rebrickable API calls for minifig parts

**Changes:**

```typescript
// Before: Always fetch from RB API
const components = await getMinifigPartsCached(figNum);

// After: Only load from BL cache, self-healing if missing
const blParts = await loadBlMinifigParts(blMinifigNo);
if (!blParts.length) {
  // Self-healing: trigger BL API fetch (cached)
  await fetchAndCacheMinifigParts(
    supabase,
    blMinifigNo,
    '[enrichment:on-demand]'
  );
  // Re-query bl_minifig_parts
}
```

---

### Phase 3: Update Client-Side Code

**Goal:** Use Bricklink IDs in UI and local storage

#### 3.1 Update Inventory Display

**File:** `app/components/set/items/InventoryItem.tsx`

**Current:** Displays RB `fig_num`, maps to BL ID for links

**New:**

- Display BL `minifig_no` as primary
- Store BL ID in `bricklinkFigId` field
- Use BL ID for Bricklink links

**Changes:**

- `partId` field: Change from `fig:fig-006572` (RB) to `fig:sw0001` (BL)
- Display logic: Show BL ID, not RB ID

#### 3.2 Update Local Storage Schema

**File:** `app/lib/localDb/schema.ts`

**Current:** `catalogMinifigs` uses `figNum` (RB ID)

**New:**

- Add `blId` as primary key (or make it the primary)
- Keep `rbFigId` as optional metadata
- Update cache key to use BL ID

**Migration:**

- Existing cached data: Map RB→BL on first access
- New data: Store with BL ID

#### 3.3 Update Minifig Detail Page

**File:** `app/minifigs/[figNum]/page.tsx` (if exists)

**Changes:**

- Accept BL `minifig_no` in URL (no RB support)
- Load data from `bricklink_minifigs` + `bl_minifig_parts`
- Self-healing: Trigger BL sync if data missing

---

### Phase 4: Remove Old Mapping Logic and Dev Tooling

**Goal:** Complete removal of complex reconciliation and manual review tooling

#### 4.1 Remove Mapping Functions

**Files to Delete/Simplify:**

- `app/lib/minifigMapping.ts` - **DELETE** (replaced by direct BL queries)
- `app/lib/minifigMappingBatched.ts` - **DELETE** (replaced by direct `bl_set_minifigs` queries)
- `scripts/minifig-mapping-core.ts` - **KEEP** but simplify (only for batch sync, remove mapping logic)

**Functions to Remove:**

- `mapSetRebrickableFigsToBrickLink()` - **DELETE**
- `mapSetRebrickableFigsToBrickLinkOnDemand()` - **DELETE**
- `mapRebrickableFigToBrickLink()` - **DELETE**
- `mapRebrickableFigToBrickLinkOnDemand()` - **DELETE**
- `getMinifigMappingsForSetBatched()` - **DELETE** (replaced by direct query)
- `getGlobalMinifigMapping()` - **DELETE**
- `getGlobalMinifigMappingsBatch()` - **DELETE**

**Functions to Keep (Simplified):**

- `mapBrickLinkFigToRebrickable()` - **KEEP** (one-way lookup for inventory only, simplified)
  - Query `bl_set_minifigs.rb_fig_id` or `bricklink_minifig_mappings` only
  - No complex heuristics

#### 4.2 Remove Manual Review UI and APIs

**Files to Delete:**

- `app/dev/minifig-review/MinifigReviewClient.tsx` - **DELETE** (859 lines, no longer needed)
- `app/dev/minifig-review/page.tsx` - **DELETE**
- `app/api/dev/minifig-mappings/review/route.ts` - **DELETE**
- `app/api/dev/minifig-mappings/fix/route.ts` - **DELETE**
- `app/api/dev/minifig-mappings/set-minifigs/route.ts` - **DELETE** (if exists)

**Database Changes:**

- `bricklink_minifig_mappings.manually_approved` - **KEEP** (for historical data, but no longer used)
- `bricklink_minifig_mappings.confidence` - **KEEP** (for historical data, but no longer used)
- `bricklink_minifig_mappings.image_similarity` - **KEEP** (for historical data, but no longer used)

#### 4.3 Remove Mapping Scripts

**Scripts to Delete/Simplify:**

- `scripts/fix-all-unmapped-minifigs.ts` - **DELETE** (no longer needed)
- `scripts/backfill-confidence-scores.ts` - **DELETE** (no longer needed)
- `scripts/backfill-image-hashes.ts` - **KEEP** (still useful for image matching, but not for mapping)
- `scripts/build-minifig-mappings-from-user-sets.ts` - **KEEP** (simplified, only triggers BL sync)

**Simplify:**

- `scripts/minifig-mapping-core.ts` - Remove all mapping logic, keep only:
  - `processSetForMinifigMapping()` - Fetch BL minifigs, cache in `bl_set_minifigs`
  - `fetchAndCacheMinifigParts()` - Fetch BL parts, cache in `bl_minifig_parts`
  - Remove: `createMinifigMappingsForSet()`, `mapMinifigComponentParts()`, all heuristic matching

---

### Phase 5: User Data Migration

**Goal:** Export user set IDs, nuke user minifigs, reimport from sets using BL IDs

#### 5.1 Export User Set IDs

**Script:** `scripts/export-user-set-ids.ts`

**Purpose:** Export owned/wishlist set IDs for manual reimport

**Output:** JSON file with:

```json
{
  "owned": ["75192-1", "75191-1", ...],
  "wishlist": ["75190-1", ...]
}
```

**Logic:**

1. Query `user_sets` for all sets with status 'owned' or 'want'
2. Export to `user-set-ids-export.json`
3. Log count of sets exported

#### 5.2 Nuke User Minifigs

**Script:** `scripts/nuke-user-minifigs.ts`

**Purpose:** Delete all user minifig data (safe since we can reimport)

**Logic:**

1. Query count of `user_minifigs` rows
2. Delete all rows from `user_minifigs`
3. Log deletion count

**Safety:** Only run after export script completes successfully

#### 5.3 Update Sync-From-Sets to Use BL IDs

**File:** `app/api/user/minifigs/sync-from-sets/route.ts`

**Current:** Uses `getSetMinifigsLocal()` which returns RB IDs

**New:**

- Query `bl_set_minifigs` directly for each set
- Use `minifig_no` (BL ID) instead of `fig_num` (RB ID)
- **Self-healing**: If set not synced, trigger sync on-demand

**Changes:**

```typescript
// Before: Uses RB IDs
const minifigs = await getSetMinifigsLocal(row.set_num);
for (const fig of minifigs) {
  contributions.set(fig.figNum, ...); // RB ID
}

// After: Uses BL IDs directly
const { data: blMinifigs } = await supabase
  .from('bl_set_minifigs')
  .select('minifig_no, quantity')
  .eq('set_num', row.set_num);

if (!blMinifigs?.length && blSet?.minifig_sync_status !== 'ok') {
  // Self-healing: trigger sync
  await processSetForMinifigMapping(supabase, row.set_num, '[sync:on-demand]');
  // Re-query
}

for (const fig of blMinifigs) {
  contributions.set(fig.minifig_no, ...); // BL ID
}
```

#### 5.4 Reimport User Minifigs

**Process:**

1. User runs sync-from-sets API endpoint (now uses BL IDs)
2. Or: User manually re-adds sets, sync happens automatically
3. All new minifigs use BL IDs from `bl_set_minifigs`

#### 5.5 Collection Lists Migration

**Table:** `collection_list_items` (if uses minifig IDs)

**If exists:** Similar approach - export, nuke, reimport with BL IDs

---

### Phase 6: Update API Endpoints

**Goal:** Accept Bricklink IDs exclusively, remove RB ID support

#### 6.1 Identify API

**File:** `app/api/identify/sets/handlers/minifig.ts`

**Current:** Accepts RB or BL ID, maps as needed

**New:**

- Accept BL ID only (no RB support)
- If RB ID provided, map once to BL ID, return BL ID
- All responses use BL IDs

**Changes:**

```typescript
// Before: Supports both RB and BL
const mappedRb = await mapBrickLinkFigToRebrickable(token);
if (mappedRb) {
  figNum = mappedRb;
  bricklinkFigId = token;
} else {
  figNum = token;
  bricklinkFigId = await mapRebrickableFigToBrickLinkOnDemand(figNum);
}

// After: BL ID only
const blMinifigNo = token; // Assume BL ID
// Verify exists in bricklink_minifigs or bl_set_minifigs
```

#### 6.2 Search API

**File:** `app/api/search/route.ts` (if returns minifigs)

**New:**

- Keep Rebrickable search for discovery
- **Immediately map** results to BL IDs before returning
- Return only BL IDs in response (no RB IDs)
- If mapping fails, exclude from results (no fallback)

#### 6.3 Get User Minifigs API

**File:** `app/api/user/minifigs/route.ts` and `app/lib/server/getUserMinifigs.ts`

**Current:** Returns RB IDs, maps to BL IDs for display

**New:**

- Return BL IDs directly (no RB IDs)
- Query `user_minifigs` with BL `fig_num` (after migration)
- Load metadata from `bricklink_minifigs`

---

## Files to Modify

### Core Services (High Priority)

| File                                    | Change                                   | Effort |
| --------------------------------------- | ---------------------------------------- | ------ |
| `app/lib/services/inventory.ts`         | Use `bl_set_minifigs` directly           | 4-6h   |
| `app/api/minifigs/[figNum]/route.ts`    | Load from BL tables, support RB fallback | 3-4h   |
| `app/lib/services/minifigEnrichment.ts` | Use `bl_minifig_parts` as primary        | 2-3h   |

### Client Components (Medium Priority)

| File                                         | Change                             | Effort |
| -------------------------------------------- | ---------------------------------- | ------ |
| `app/components/set/items/InventoryItem.tsx` | Display BL IDs, update links       | 2h     |
| `app/lib/localDb/schema.ts`                  | Update cache schema for BL IDs     | 2-3h   |
| `app/hooks/useMinifigDetails.ts`             | Accept BL IDs, load from BL tables | 2h     |

### Mapping Logic Removal (High Priority - Delete)

| File                                    | Change                               | Effort |
| --------------------------------------- | ------------------------------------ | ------ |
| `app/lib/minifigMappingBatched.ts`      | **DELETE** entire file               | 1h     |
| `app/lib/minifigMapping.ts`             | **DELETE** entire file               | 1h     |
| `scripts/minifig-mapping-core.ts`       | Remove mapping logic, keep sync only | 3-4h   |
| `scripts/fix-all-unmapped-minifigs.ts`  | **DELETE** entire file               | 0.5h   |
| `scripts/backfill-confidence-scores.ts` | **DELETE** entire file               | 0.5h   |

### Dev Tooling Removal (High Priority - Delete)

| File                                                 | Change                 | Effort |
| ---------------------------------------------------- | ---------------------- | ------ |
| `app/dev/minifig-review/MinifigReviewClient.tsx`     | **DELETE** entire file | 0.5h   |
| `app/dev/minifig-review/page.tsx`                    | **DELETE** entire file | 0.5h   |
| `app/api/dev/minifig-mappings/review/route.ts`       | **DELETE** entire file | 0.5h   |
| `app/api/dev/minifig-mappings/fix/route.ts`          | **DELETE** entire file | 0.5h   |
| `app/api/dev/minifig-mappings/set-minifigs/route.ts` | **DELETE** if exists   | 0.5h   |

### Data Migration (One-Time)

| File                                                    | Change               | Effort |
| ------------------------------------------------------- | -------------------- | ------ |
| `scripts/export-user-set-ids.ts`                        | New script           | 1h     |
| `scripts/nuke-user-minifigs.ts`                         | New script           | 0.5h   |
| `app/api/user/minifigs/sync-from-sets/route.ts`         | Update to use BL IDs | 2-3h   |
| `app/lib/server/getUserMinifigs.ts`                     | Update to use BL IDs | 2h     |
| `supabase/migrations/..._bricklink_minifig_primary.sql` | New migration        | 1h     |

### API Endpoints (Medium Priority)

| File                                        | Change                          | Effort |
| ------------------------------------------- | ------------------------------- | ------ |
| `app/api/identify/sets/handlers/minifig.ts` | Prefer BL IDs                   | 1-2h   |
| `app/api/search/route.ts`                   | Map RB search results to BL IDs | 2h     |

### Test Files (High Priority)

| File                                                       | Change                                     | Effort |
| ---------------------------------------------------------- | ------------------------------------------ | ------ |
| `app/lib/services/__tests__/inventory.test.ts`             | New: Test BL minifig loading, self-healing | 3-4h   |
| `app/lib/services/__tests__/minifigEnrichment.test.ts`     | New: Test BL parts loading, self-healing   | 2-3h   |
| `app/lib/services/__tests__/testUtils.ts`                  | New: Shared test utilities for BL mocks    | 1-2h   |
| `app/api/minifigs/__tests__/[figNum].test.ts`              | New: Test minifig detail API with BL IDs   | 2-3h   |
| `app/api/user/minifigs/__tests__/sync-from-sets.test.ts`   | New: Test sync with BL IDs                 | 2-3h   |
| `app/api/identify/sets/__tests__/minifig.test.ts`          | Update: Test BL-only ID handling           | 1-2h   |
| `app/api/search/__tests__/search.test.ts`                  | Update: Test RB→BL mapping in results      | 1-2h   |
| `app/lib/services/__tests__/inventory.integration.test.ts` | New: E2E test for set page                 | 2-3h   |
| `app/lib/__tests__/minifig-mapping-removed.test.ts`        | New: Verify deleted files                  | 1h     |
| `scripts/__tests__/export-user-set-ids.test.ts`            | New: Test export script                    | 1h     |
| `scripts/__tests__/nuke-user-minifigs.test.ts`             | New: Test nuke script                      | 1h     |

**Total Estimated Effort:** 40-55 hours (includes aggressive removal + comprehensive testing)

---

## Rollback Plan

### If Issues Arise

1. **Database:** No schema changes break existing data (additive only)
2. **Code:** Feature flags to toggle between RB and BL sources
3. **Data:** Original RB IDs preserved in `bl_set_minifigs.rb_fig_id`

### Rollback Steps

1. Revert code changes (git)
2. No database migration needed (tables remain)
3. User data migration can be reversed if audit log kept

---

## Testing Strategy

### Testing Principles

1. **Test Services, Not Routes**: Focus on `app/lib/services/` and `app/lib/catalog/` - route handlers are thin wrappers
2. **Mock External Dependencies**: Mock Supabase queries and Bricklink API calls
3. **Test Self-Healing Logic**: Verify sync triggers when data is missing
4. **Test BL-Only Behavior**: Ensure no RB fallbacks exist (except for inventory lookups)
5. **Test Migration Paths**: Verify export/nuke/reimport scripts work correctly

### Test Files to Create

#### Unit Tests (Services)

**File:** `app/lib/services/__tests__/inventory.test.ts`

**Tests:**

- `getSetInventoryRowsWithMeta()` loads minifigs from `bl_set_minifigs`
- Self-healing: triggers `processSetForMinifigMapping()` when `minifig_sync_status !== 'ok'`
- Returns BL `minifig_no` as primary ID (not RB `fig_num`)
- Handles sets with no BL data (empty array, not error)
- Performance: single query to `bl_set_minifigs` (no mapping logic)

**Mock Strategy:**

```typescript
const mockSupabase = {
  from: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  // Mock bl_set_minifigs query
  // Mock bl_sets.minifig_sync_status check
  // Mock processSetForMinifigMapping trigger
};
```

**File:** `app/lib/services/__tests__/minifigEnrichment.test.ts`

**Tests:**

- `enrichMinifigs()` loads parts from `bl_minifig_parts` only
- Self-healing: triggers `fetchAndCacheMinifigParts()` when parts missing
- No Rebrickable API calls for minifig parts
- Handles missing parts gracefully (empty array)

**File:** `app/lib/catalog/__tests__/minifigs.test.ts` (if exists, update)

**Tests:**

- `getSetMinifigsLocal()` queries `bl_set_minifigs` directly
- Returns BL IDs, not RB IDs
- Self-healing: triggers sync if status not 'ok'

#### Unit Tests (API Routes)

**File:** `app/api/minifigs/__tests__/[figNum].test.ts` (new)

**Tests:**

- Accepts BL `minifig_no` as parameter
- Loads metadata from `bricklink_minifigs` table
- Loads parts from `bl_minifig_parts` table
- Self-healing: triggers parts sync if missing
- Returns 404 for invalid BL minifig IDs
- No RB ID support (returns 404 if RB ID provided)

**Mock Strategy:**

```typescript
const mockRequest = new NextRequest('http://localhost/api/minifigs/sw0001');
// Mock Supabase queries
// Mock fetchAndCacheMinifigParts if needed
```

**File:** `app/api/user/minifigs/__tests__/sync-from-sets.test.ts` (new)

**Tests:**

- Queries `bl_set_minifigs` for each owned set
- Uses BL `minifig_no` in `user_minifigs` table
- Self-healing: triggers sync for sets with `minifig_sync_status !== 'ok'`
- Aggregates quantities correctly from BL data
- Handles sets with no minifigs gracefully

**File:** `app/api/identify/sets/__tests__/minifig.test.ts` (update existing)

**Tests:**

- Accepts BL minifig ID only (no RB support)
- Returns BL ID in response
- Maps RB→BL if RB ID provided (one-time, returns BL ID)
- Handles invalid BL IDs gracefully

**File:** `app/api/search/__tests__/search.test.ts` (update existing)

**Tests:**

- RB search results are immediately mapped to BL IDs
- Returns only BL IDs in response (no RB IDs)
- Excludes results where RB→BL mapping fails
- Handles search with no minifig results

#### Integration Tests

**File:** `app/lib/services/__tests__/inventory.integration.test.ts` (new)

**Tests:**

- End-to-end: Set page loads minifigs from BL tables
- Self-healing: Set without BL data triggers sync, then displays minifigs
- Performance: No multiple queries or mapping overhead
- Data consistency: Minifigs match `bl_set_minifigs` data exactly

**File:** `app/api/user/minifigs/__tests__/sync-from-sets.integration.test.ts` (new)

**Tests:**

- End-to-end: Sync from sets creates `user_minifigs` with BL IDs
- Self-healing: Sets without BL data trigger sync before sync
- Data consistency: `user_minifigs.fig_num` contains BL `minifig_no`

#### Script Tests

**File:** `scripts/__tests__/export-user-set-ids.test.ts` (new)

**Tests:**

- Exports owned sets correctly
- Exports wishlist sets correctly
- Outputs valid JSON format
- Handles user with no sets gracefully

**File:** `scripts/__tests__/nuke-user-minifigs.test.ts` (new)

**Tests:**

- Deletes all `user_minifigs` rows
- Logs deletion count
- Handles empty table gracefully
- Safety: Requires confirmation or flag

#### Removal Verification Tests

**File:** `app/lib/__tests__/minifig-mapping-removed.test.ts` (new)

**Tests:**

- Verifies `minifigMapping.ts` is deleted (import fails)
- Verifies `minifigMappingBatched.ts` is deleted (import fails)
- Verifies no code imports deleted mapping functions
- Verifies dev review UI is deleted (route 404s)

**Implementation:**

```typescript
describe('Mapping logic removal', () => {
  it('minifigMapping.ts should not exist', () => {
    expect(() => import('@/app/lib/minifigMapping')).rejects.toThrow();
  });

  it('minifigMappingBatched.ts should not exist', () => {
    expect(() => import('@/app/lib/minifigMappingBatched')).rejects.toThrow();
  });
});
```

### Test Utilities to Create

**File:** `app/lib/services/__tests__/testUtils.ts` (new)

**Purpose:** Shared utilities for testing BL-based services

```typescript
export function createMockBlSetMinifigs(
  setNum: string,
  minifigs: Array<{
    minifig_no: string;
    name: string | null;
    quantity: number;
    image_url: string | null;
    rb_fig_id: string | null;
  }>
) {
  // Mock Supabase query for bl_set_minifigs
}

export function createMockBlMinifigParts(
  blMinifigNo: string,
  parts: Array<{
    bl_part_id: string;
    bl_color_id: number;
    quantity: number;
    name: string | null;
  }>
) {
  // Mock Supabase query for bl_minifig_parts
}

export function mockProcessSetForMinifigMapping(supabase: any, setNum: string) {
  // Mock sync trigger
}
```

### Test Coverage Targets

**Update:** `vitest.config.mts`

**New Coverage Requirements:**

- `app/lib/services/inventory.ts`: 80%+ coverage
- `app/lib/services/minifigEnrichment.ts`: 80%+ coverage
- `app/api/minifigs/[figNum]/route.ts`: 70%+ coverage
- `app/api/user/minifigs/sync-from-sets/route.ts`: 80%+ coverage
- `app/lib/server/getUserMinifigs.ts`: 80%+ coverage

**Coverage Exclusions:**

- Keep existing exclusions for API routes (coverage reporting only)
- Tests still run for all files

### Manual Testing Checklist

1. **Set Page with BL Data:**
   - [ ] View set with synced BL minifigs
   - [ ] Verify minifigs display with BL IDs
   - [ ] Verify Bricklink links work correctly
   - [ ] Verify images load from BL URLs

2. **Set Page without BL Data (Self-Healing):**
   - [ ] View set with `minifig_sync_status !== 'ok'`
   - [ ] Verify sync triggers automatically
   - [ ] Verify minifigs appear after sync completes
   - [ ] Verify no errors or empty states

3. **Minifig Detail Page:**
   - [ ] View minifig by BL ID
   - [ ] Verify metadata loads from `bricklink_minifigs`
   - [ ] Verify parts load from `bl_minifig_parts`
   - [ ] Verify self-healing triggers if parts missing

4. **User Minifigs Sync:**
   - [ ] Run sync-from-sets endpoint
   - [ ] Verify `user_minifigs` created with BL IDs
   - [ ] Verify quantities aggregated correctly
   - [ ] Verify self-healing triggers for unsynced sets

5. **Export/Nuke Scripts:**
   - [ ] Run export script, verify JSON output
   - [ ] Run nuke script, verify deletion
   - [ ] Reimport via sync-from-sets, verify BL IDs

6. **Search:**
   - [ ] Search for minifigs
   - [ ] Verify results contain BL IDs only
   - [ ] Verify RB search results are mapped to BL IDs

7. **Removed Functionality:**
   - [ ] Verify `/dev/minifig-review` returns 404
   - [ ] Verify no imports of deleted mapping files
   - [ ] Verify no references to old mapping functions

### Test Execution

**Run All Tests:**

```bash
npm test
```

**Run with Coverage:**

```bash
npm test -- --coverage
```

**Run Specific Test File:**

```bash
npm test app/lib/services/__tests__/inventory.test.ts
```

**Watch Mode:**

```bash
npm test -- --watch
```

### Test Data Setup

**Test Database:**

- Use test Supabase instance or local Supabase
- Seed test data:
  - `bl_sets` with various `minifig_sync_status` values
  - `bl_set_minifigs` with test minifigs
  - `bl_minifig_parts` with test parts
  - `bricklink_minifigs` with test metadata

**Test Fixtures:**

- Create fixture files for common test scenarios
- Example: `__tests__/fixtures/bl-set-minifigs.ts`

---

## Success Criteria

- [ ] Set inventory pages show Bricklink minifig IDs exclusively
- [ ] Minifig detail pages load from `bl_minifig_parts` exclusively
- [ ] No manual review tooling exists (all deleted)
- [ ] No old mapping logic exists (all deleted)
- [ ] User minifigs use BL IDs (nuked and reimported)
- [ ] Self-healing system triggers BL sync when viewing sets without data
- [ ] No RB fallbacks for minifig data (BL only)
- [ ] Performance: No degradation (BL queries are indexed)
- [ ] All tests pass (unit, integration, removal verification)
- [ ] Test coverage meets targets (80%+ for services, 70%+ for APIs)
- [ ] Self-healing logic tested (sync triggers when data missing)
- [ ] BL-only behavior verified (no RB fallbacks except inventory lookups)
- [ ] Export script created for user set IDs
- [ ] Test utilities created for BL mocking

---

## Future Considerations

### Pricing Integration

Once BL IDs are primary, pricing features become straightforward:

- Direct lookup via `minifig_no` (no mapping needed)
- Consistent IDs across inventory and pricing views

### Search Improvements

- Consider Bricklink search API for minifigs (if available)
- Or: Enhance RB search → BL ID mapping for better discovery

### Data Completeness

- Continue batch sync process to fill BL data gaps proactively
- Self-healing system triggers sync on-demand when viewing sets
- Monitor `bl_sets.minifig_sync_status` for sets needing sync
- No RB fallback - if BL data unavailable, trigger sync or show empty state

### Self-Healing Migration

The system will automatically migrate sets as they're viewed:

1. User views set page
2. Check `bl_sets.minifig_sync_status`
3. If not 'ok', trigger `processSetForMinifigMapping()` on-demand
4. Cache results in `bl_set_minifigs`
5. Display minifigs from BL data

This ensures all viewed sets have BL data without manual intervention.

---

## Decision Record

### Q1: Should we use Bricklink for minifig parts?

**Decision:** Yes, use `bl_minifig_parts` as primary source.

**Rationale:**

- Already cached via batch ingestion
- Eliminates need for Rebrickable API calls
- Aligns with Bricklink ID strategy
- Component parts are stable (don't change frequently)

### Q2: Should we keep Rebrickable for set inventories?

**Decision:** Yes, keep Rebrickable for `rb_inventory_parts`.

**Rationale:**

- More complete data (includes spare flags)
- Better metadata (element IDs, images)
- CSV ingestion is reliable and fast
- No need to change what works

### Q3: How to handle sets without BL minifig data?

**Decision:** Self-healing system with on-demand sync, **no RB fallback**.

**Rationale:**

- Pre-launch, can be aggressive
- Self-healing: Trigger BL sync when viewing set without data
- Better than fallback (maintains single source of truth)
- Older sets likely have BL data anyway
- If truly missing, show empty state (better than wrong data)

### Q4: Should we migrate user data immediately?

**Decision:** Yes, nuke and reimport (single user, pre-launch).

**Rationale:**

- Only one user (you), can nuke safely
- Export set IDs for manual reimport
- Reimport uses BL IDs from `bl_set_minifigs` (deterministic)
- Cleaner than migration script (no edge cases)
- Sync-from-sets already exists and will be updated to use BL IDs

### Q5: Should we remove all old mapping logic?

**Decision:** Yes, complete removal.

**Rationale:**

- Pre-launch, can be aggressive
- Eliminates technical debt
- Simpler codebase (easier to maintain)
- No need for backward compatibility
- Self-healing system replaces mapping logic

---

_Last updated: December 16, 2025_  
_Status: Planning complete - ready for review_
