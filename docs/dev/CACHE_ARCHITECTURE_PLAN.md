# Cache Architecture Plan

**Created:** December 16, 2025  
**Status:** Planning Phase  
**Priority:** 🔴 Critical

---

## Executive Summary

After deep analysis, the caching architecture is more nuanced than initially assessed. The key insight is that **not all caches need version awareness** - only caches that store data derived from our Supabase catalog. External API caches (BrickLink, direct Rebrickable API calls, Brickognize) operate independently and benefit from longer TTLs.

This plan establishes a **context-aware caching strategy** that:

1. Adds version awareness where it provides value (catalog-derived data)
2. Preserves long TTLs where they make sense (external API responses, image recognition)
3. Reduces unnecessary complexity and database queries

---

## Comprehensive Cache Inventory

### Category 1: Catalog-Derived Caches (Version-Sensitive) ✅ Need Version Awareness

These caches store data that originates from our Supabase catalog (ingested from Rebrickable CSV downloads). When we run the ingestion script, this data changes.

| Cache                     | Location | TTL     | Size      | Data Flow                  | Version Needed?   |
| ------------------------- | -------- | ------- | --------- | -------------------------- | ----------------- |
| IndexedDB catalogSetParts | client   | 30 days | unlimited | Supabase → API → IndexedDB | ✅ Already has it |
| IndexedDB catalogSetMeta  | client   | 30 days | unlimited | Supabase → API → IndexedDB | ✅ Already has it |

**Current Status:** Client-side caching is already version-aware via `inventoryVersion` field in `catalogSetMeta`. The client fetches `/api/catalog/versions` and validates before using cached data.

### Category 2: Spare Parts Cache (Special Case) ⚠️ Needs Analysis

| Cache      | Location     | TTL    | Size | Data Flow                       |
| ---------- | ------------ | ------ | ---- | ------------------------------- |
| spareCache | inventory.ts | 7 days | 200  | Rebrickable API (live) → memory |

**Analysis:** This cache fetches spare part flags directly from Rebrickable API (`/lego/sets/{set}/parts/`), NOT from our Supabase catalog. The spare designation doesn't change based on our ingestion - it changes when Rebrickable updates their data.

**Recommendation:**

- Reduce TTL from 7 days to 24 hours (Rebrickable data updates periodically)
- No version-keying needed (not catalog-dependent)
- Add negative caching for sets with no spares

### Category 3: External API Response Caches (NOT Version-Sensitive) ❌ No Version Needed

These caches store responses from external APIs. The data freshness depends on the external service, not our catalog version.

| Cache             | Location                | TTL   | Size | Data Source     | Rationale                                  |
| ----------------- | ----------------------- | ----- | ---- | --------------- | ------------------------------------------ |
| subsetsCache      | bricklink.ts            | 1hr   | 500  | BrickLink API   | BL data changes rarely; 1hr is appropriate |
| supersetsCache    | bricklink.ts            | 1hr   | 500  | BrickLink API   | BL data changes rarely; 1hr is appropriate |
| colorsCache       | bricklink.ts            | 1hr   | 500  | BrickLink API   | Color lists are very stable                |
| priceGuideCache   | bricklink.ts            | 30min | 500  | BrickLink API   | Prices fluctuate; 30min is good balance    |
| minifigPartsCache | rebrickable/minifigs.ts | 1hr   | 500  | Rebrickable API | Minifig part lists stable; 1hr fine        |
| getSetsForMinifig | rebrickable/minifigs.ts | 1hr   | 500  | Rebrickable API | Set associations stable                    |
| getSetsForPart    | rebrickable/parts.ts    | 1hr   | 500  | Rebrickable API | Set associations stable                    |
| resolvedPartCache | rebrickable/parts.ts    | 24hr  | 1000 | Rebrickable API | Part identity rarely changes               |
| categoriesCache   | rebrickable/parts.ts    | 1hr   | N/A  | Rebrickable API | Categories very stable                     |

**Recommendation:** Leave these as-is. They're well-tuned for their use cases.

### Category 4: Search Caches (NOT Version-Sensitive) ❌ No Version Needed

| Cache                 | Location              | TTL   | Size | Data Source     | Status                         |
| --------------------- | --------------------- | ----- | ---- | --------------- | ------------------------------ |
| aggregatedSearchCache | rebrickable/search.ts | 10min | 100  | Rebrickable API | Disabled by default (env flag) |

**Analysis:** Search results come directly from Rebrickable API, not our catalog. The cache is disabled by default to avoid stale results.

**Recommendation:** Current approach is correct. Keep disabled or enable with short TTL.

### Category 5: Identify/Brickognize Caches (NOT Version-Sensitive) ❌ No Version Needed - LONG TTL is CORRECT

| Cache                 | Location              | TTL  | Size         | Data Source      | Rationale                        |
| --------------------- | --------------------- | ---- | ------------ | ---------------- | -------------------------------- |
| localIdentifyCache    | api/identify/route.ts | 24hr | unbounded    | Brickognize API  | Same image → same recognition ✅ |
| identifyResponseCache | IdentifyClient.tsx    | 24hr | 20 (session) | API response     | Same image → same results ✅     |
| identifyCache (sets)  | services/identify.ts  | 5min | 200          | Rebrickable API  | Short-lived session data         |
| failedEnrichments     | minifigEnrichment.ts  | 24hr | 1000         | Failure tracking | Prevents retry storms            |

**Analysis:** Image recognition results are deterministic - the same image should return the same parts identification. The 24-hour TTL is **correct and valuable**:

- Reduces Brickognize API calls (rate-limited)
- Improves UX for repeated scans of same parts
- Cache key is image content hash, not catalog version

**Recommendation:** Keep 24hr TTL. This is a good example of context-appropriate caching.

### Category 6: Client-Side UI Caches (NOT Version-Sensitive) ❌ No Version Needed

| Cache       | Location        | TTL                | Size | Purpose                       |
| ----------- | --------------- | ------------------ | ---- | ----------------------------- |
| React Query | useInventory.ts | 5min stale, 1hr gc | N/A  | Network request deduplication |
| recentSets  | IndexedDB       | unlimited          | N/A  | UX history (user-generated)   |
| uiState     | IndexedDB       | unlimited          | N/A  | User preferences              |

**Recommendation:** Leave as-is. These serve different purposes.

---

## Revised Problem Statement

After analysis, the actual problems are **narrower** than initially assessed:

| Problem                     | Actual Scope | Impact                                                            |
| --------------------------- | ------------ | ----------------------------------------------------------------- |
| Server → Client version gap | Moderate     | Server may return inventory data that's newer than client expects |
| spareCache over-long TTL    | Low          | Spare designation might be stale for up to 7 days                 |
| No graceful degradation     | Low          | If version fetch fails, client falls back to TTL                  |

**What's NOT a problem:**

- External API caches don't need version awareness
- Brickognize 24hr cache is correctly designed
- BrickLink caches are appropriately tuned

### Data Flow (Current - Already Well-Designed)

```
User visits /sets/75192-1
    │
    ▼
useInventory() → React Query
    │
    ├── Cache hit? → Return stale (staleTime: 5min)
    │
    ├── Fetch /api/catalog/versions → Get inventory_parts version
    │
    ├── Check IndexedDB (30-day TTL + version match) ✅ Already version-aware
    │   └── If valid → Return cached rows
    │
    └── Fetch /api/inventory?set=75192-1
        │
        ▼
    getSetInventoryRowsWithMeta()
        │
        ├── getSetInventoryLocal() → Supabase rb_inventory_parts ✅ Fresh from DB
        │
        ├── getSpareCacheEntry() → spareCache (7-day LRU) ⚠️ Too long, but not version-dependent
        │
        └── Return rows with inventoryVersion → Cache in IndexedDB
```

**Key Insight:** The client-side version checking is already implemented and working well. The server-side caches are mostly for external API responses that don't depend on our catalog version.

---

## Proposed Changes (Targeted)

### Design Principles (Revised)

1. **Context-appropriate caching**: Not all caches need version awareness
2. **Preserve what works**: External API caches are correctly designed
3. **Fix actual problems**: Focus on the spareCache TTL and graceful degradation
4. **Avoid unnecessary complexity**: No version manager polling if we don't need it
5. **Performance first**: Avoid adding database queries where they don't add value

### What's Changing vs What's Staying

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         KEEP AS-IS (Working Well)                        │
├─────────────────────────────────────────────────────────────────────────┤
│  Client:                                                                 │
│  • IndexedDB version checking ✅                                         │
│  • React Query stale/gc times ✅                                         │
│  • Identify response 24hr cache ✅ (image hash based)                    │
│                                                                          │
│  Server External API Caches:                                             │
│  • BrickLink caches (1hr/30min) ✅                                       │
│  • Rebrickable API caches ✅                                             │
│  • resolvedPartCache (24hr) ✅                                           │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                         CHANGES (Targeted Fixes)                         │
├─────────────────────────────────────────────────────────────────────────┤
│  1. spareCache TTL: 7 days → 24 hours (more appropriate for RB data)    │
│  2. Version endpoint: Add Cache-Control header for client efficiency    │
│  3. Documentation: Clarify cache purposes and TTL rationale             │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Implementation Plan (Simplified)

After contextual analysis, the implementation is significantly simpler than originally planned.

### Phase 1: Fix spareCache TTL (Quick Win)

**File:** `app/lib/services/inventory.ts`

**Change:** Reduce spareCache TTL from 7 days to 24 hours.

```typescript
// Before:
const SPARE_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// After:
const SPARE_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
```

**Rationale:**

- Spare part designations come from Rebrickable API (not our catalog)
- Rebrickable updates their data periodically
- 24 hours is appropriate for this type of data
- No version-keying needed since it's not catalog-dependent

### Phase 2: Add Version Endpoint Caching (Quick Win)

**File:** `app/api/catalog/versions/route.ts`

**Change:** Add Cache-Control header to reduce redundant version checks.

```typescript
return NextResponse.json(
  { versions },
  {
    headers: {
      'Cache-Control': 'public, max-age=60, stale-while-revalidate=120',
    },
  }
);
```

**Rationale:**

- Version endpoint is called on every inventory fetch
- Versions change infrequently (only on ingestion)
- 60-second cache with stale-while-revalidate is safe and efficient
- Browser and CDN can cache, reducing Supabase queries

### Phase 3: Documentation (Reference)

Create a `CACHING.md` guide documenting:

- Each cache's purpose and TTL rationale
- When to use version awareness vs TTL-only
- Guidelines for adding new caches

---

## What We're NOT Doing (And Why)

### ❌ Server-Side Version Manager

**Original Plan:** Create `CacheVersionManager` that polls `rb_download_versions` every 60 seconds and adds version to all cache keys.

**Why Not:**

- Only one server-side cache (spareCache) could benefit from versioning
- spareCache doesn't even use catalog data - it fetches from Rebrickable API directly
- Would add a database query to every request for minimal benefit
- External API caches (BrickLink, Rebrickable direct) don't need versioning

### ❌ Version-Keyed Server Caches

**Original Plan:** Add version to cache keys like `${setNumber}:v:${version}`.

**Why Not:**

- Most server caches are external API responses, not catalog data
- Version-keying external API responses would cause unnecessary cache misses
- The client-side IndexedDB already handles version checking correctly

### ❌ React Query Version Integration

**Original Plan:** Include version in React Query keys.

**Why Not:**

- `useInventory` already handles version checking via IndexedDB
- Adding version to query key would cause re-fetches even when IndexedDB has valid cached data
- Current flow is optimal: React Query → check version → IndexedDB → API if needed

---

## Final Cache TTL Strategy

| Layer                           | Current TTL | New TTL     | Rationale                          |
| ------------------------------- | ----------- | ----------- | ---------------------------------- |
| **Client-Side**                 |
| React Query staleTime           | 5min        | 5min ✅     | Good balance for UI responsiveness |
| React Query gcTime              | 1hr         | 1hr ✅      | Appropriate for session lifetime   |
| IndexedDB inventory             | 30 days     | 30 days ✅  | Version check provides freshness   |
| Identify response (client)      | 24hr        | 24hr ✅     | Same image = same result           |
| **Server-Side (Catalog)**       |
| spareCache                      | 7 days      | **24hr** 🔧 | More appropriate for RB API data   |
| **Server-Side (External APIs)** |
| BrickLink subsets/supersets     | 1hr         | 1hr ✅      | BL data rarely changes             |
| BrickLink priceGuide            | 30min       | 30min ✅    | Prices need freshness              |
| BrickLink colors                | 1hr         | 1hr ✅      | Color lists very stable            |
| resolvedPartCache               | 24hr        | 24hr ✅     | Part identity stable               |
| minifigPartsCache               | 1hr         | 1hr ✅      | Minifig parts stable               |
| getSetsForPart                  | 1hr         | 1hr ✅      | Set associations stable            |
| getSetsForMinifig               | 1hr         | 1hr ✅      | Set associations stable            |
| categoriesCache                 | 1hr         | 1hr ✅      | Categories very stable             |
| **Server-Side (Identify)**      |
| identifyCache (sets)            | 5min        | 5min ✅     | Session-scoped                     |
| localIdentifyCache              | 24hr        | 24hr ✅     | Same image = same result           |
| failedEnrichments               | 24hr        | 24hr ✅     | Prevents retry storms              |

**Legend:** ✅ = Keep as-is, 🔧 = Change

---

## Files to Modify

### Modified Files (Minimal Changes)

| File                                | Change                        | Effort |
| ----------------------------------- | ----------------------------- | ------ |
| `app/lib/services/inventory.ts`     | spareCache TTL: 7 days → 24hr | 5 min  |
| `app/api/catalog/versions/route.ts` | Add Cache-Control header      | 5 min  |

### New Files (Optional - Documentation)

| File                  | Description                  |
| --------------------- | ---------------------------- |
| `docs/dev/CACHING.md` | Cache strategy documentation |

### No Changes Needed

| File                              | Reason                                      |
| --------------------------------- | ------------------------------------------- |
| `app/lib/bricklink.ts`            | External API caches well-tuned              |
| `app/lib/rebrickable/*.ts`        | External API caches well-tuned              |
| `app/lib/services/identify.ts`    | Session-scoped, appropriate TTL             |
| `app/hooks/useInventory.ts`       | Already handles version checking            |
| `app/identify/IdentifyClient.tsx` | 24hr cache is correct for image recognition |

---

## Testing Strategy

### Unit Tests

Since changes are minimal, testing is straightforward:

1. **spareCache TTL change**: No unit test needed - just a constant change
2. **Cache-Control header**: Verify header is present in response

### Manual Testing

1. Open set page, verify inventory loads with spare filtering
2. Check Network tab → `/api/catalog/versions` has Cache-Control header
3. Verify browser caches version endpoint (second request is instant)

### Integration Tests (Optional)

Could add a test that verifies spare cache refreshes within 24 hours, but low value given the simplicity of the change.

---

## Rollback Plan

Changes are minimal and easily reversible:

1. **spareCache TTL**: Change constant back to `7 * 24 * 60 * 60 * 1000`
2. **Cache-Control header**: Remove the headers option from `NextResponse.json()`

---

## Timeline Estimate

| Phase                             | Effort        | Dependencies |
| --------------------------------- | ------------- | ------------ |
| Phase 1: spareCache TTL           | 5 minutes     | None         |
| Phase 2: Version endpoint caching | 5 minutes     | None         |
| Phase 3: Documentation            | 30-60 minutes | None         |
| Testing                           | 15 minutes    | Phases 1-2   |
| **Total**                         | **~1 hour**   |              |

---

## Decision Record

### Q1: Should we version-key ALL server caches?

**Decision:** No.

**Rationale:**

- Most server caches are external API responses (BrickLink, Rebrickable direct)
- External APIs have their own update cycles independent of our catalog
- Version-keying would cause unnecessary cache misses when our catalog updates
- Only catalog-derived data benefits from version awareness

### Q2: Is spareCache catalog-dependent?

**Decision:** No.

**Analysis:**

- `spareCache` fetches from Rebrickable API (`/lego/sets/{set}/parts/`)
- This is a **live API call**, not reading from our Supabase catalog
- Rebrickable updates this data on their schedule
- Our catalog ingestion doesn't change what Rebrickable API returns
- Therefore: no version-keying needed, just appropriate TTL

### Q3: Why keep identify cache at 24 hours?

**Decision:** Keep it.

**Rationale:**

- Cache key is based on image content hash
- Same image → same Brickognize recognition → same results
- 24-hour TTL reduces API calls (Brickognize has rate limits)
- Users benefit from instant results on repeated scans
- This is a correct use of long-lived caching

### Q4: Why not add server-side version polling?

**Decision:** Not needed.

**Rationale:**

- Would add a database query on every request (or polling overhead)
- Only one cache (spareCache) was a candidate, and it doesn't use catalog data
- Client-side version checking already works well
- Complexity cost outweighs minimal benefit

---

## Success Criteria

- [ ] spareCache TTL reduced to 24 hours
- [ ] `/api/catalog/versions` returns Cache-Control header
- [ ] All existing tests pass
- [ ] Build succeeds
- [ ] Inventory loading still works correctly

---

## Future Considerations

If we later identify a need for more sophisticated cache coordination:

1. **Server-side catalog cache**: If we add server-side caching of catalog data (not API responses), version-keying would make sense then
2. **Webhook invalidation**: If we add a webhook after ingestion, we could proactively invalidate caches
3. **Redis caching**: If we move to distributed caching, version-keying becomes more valuable

For now, the existing architecture is well-designed for the application's needs.

---

_Last updated: December 16, 2025_
_Status: Planning complete - ready for implementation_
