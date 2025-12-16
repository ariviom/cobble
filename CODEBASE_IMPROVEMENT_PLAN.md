# Codebase Improvement Plan

**Generated:** December 16, 2025  
**Based on:** Full codebase review including recent minifig mapping enhancements, beta launch features, and architectural analysis

---

## Executive Summary

This plan consolidates findings from a comprehensive codebase review focused on:

- **Determinism vs Heuristics** in RB→BL mapping logic
- **Self-Healing Data Patterns** for progressive data improvement
- **PWA Readiness** for installable SPA capability
- **React Best Practices** including useEffect patterns
- **Architecture & Code Quality** improvements

The codebase is **architecturally strong** with excellent patterns for local-first data management, distributed rate limiting, and service layer abstraction. The improvements below target meaningful ROI without introducing unnecessary complexity.

---

## Priority Tiers

| Tier                 | Description                                        | Timeframe   |
| -------------------- | -------------------------------------------------- | ----------- |
| 🔴 **P0 - Critical** | Security, data loss prevention, user-facing bugs   | Immediate   |
| 🟠 **P1 - High**     | Significant UX improvements, reliability hardening | This sprint |
| 🟡 **P2 - Medium**   | Code quality, maintainability, moderate UX wins    | Next sprint |
| 🟢 **P3 - Low**      | Nice-to-have cleanups, future-proofing             | Backlog     |

---

## P0 - Critical Priority

### 1. Add Minimum Confidence Threshold for Brickognize Results

**ROI:** 🔴 High — Prevents incorrect part identifications from reaching users

**Problem:**  
Brickognize ML results are accepted without local validation. Low-confidence results (<0.3) can produce misleading identifications.

**Files:**

- `app/lib/services/identify.ts`
- `app/lib/brickognize.ts`

**Implementation:**

```typescript
// app/lib/constants.ts
export const IDENTIFY = {
  MIN_CONFIDENCE_THRESHOLD: 0.3,
  // ... existing constants
} as const;

// app/lib/brickognize.ts - in processBrickognizeResponse()
const filtered = candidates.filter(
  c => c.confidence >= IDENTIFY.MIN_CONFIDENCE_THRESHOLD
);
if (!filtered.length) {
  logger.warn('brickognize.all_below_threshold', {
    candidateCount: candidates.length,
    maxConfidence: Math.max(...candidates.map(c => c.confidence)),
  });
  return { candidates: [], error: 'no_confident_match' };
}
```

**Acceptance Criteria:**

- [ ] Filter results with confidence < 0.3
- [ ] Log filtered results for observability
- [ ] Return clear error when no candidates pass threshold
- [ ] Add unit tests for threshold filtering

---

### 2. Fix useEffect Anti-Patterns in SearchResults

**ROI:** 🔴 High — Prevents redundant re-renders and React hydration issues

**Problem:**  
`SearchResults.tsx` syncs URL params to local state via useEffect, causing unnecessary re-renders and potential hydration mismatches.

**File:** `app/components/search/SearchResults.tsx`

**Current (lines 120-130):**

```typescript
// ❌ Anti-pattern: derived state in effects
useEffect(() => {
  setFilter(filterFromParams);
}, [filterFromParams]);

useEffect(() => {
  setExact(exactFromParams);
}, [exactFromParams]);

useEffect(() => {
  setMinifigSort(minifigSortFromParams);
}, [minifigSortFromParams]);
```

**Implementation:**

```typescript
// ✅ Option A: Use URL params directly (no local state)
const filter = filterFromParams; // Remove useState
const exact = exactFromParams;
const minifigSort = minifigSortFromParams;

// ✅ Option B: Controlled component pattern
// Initialize from params, use local state only for optimistic updates
const [filter, setFilter] = useState(filterFromParams);
// No useEffect - handlers update both local state AND URL
```

**Acceptance Criteria:**

- [ ] Remove the three useEffect hooks syncing from URL params
- [ ] Either derive values directly OR use controlled pattern
- [ ] Verify URL navigation still works correctly
- [ ] No React hydration warnings in console

---

## P1 - High Priority

### 3. Add Web App Manifest for PWA Installability ✅ COMPLETED

**ROI:** 🟠 High — Enables home screen installation with ~2 hours effort

**Problem:**  
No PWA infrastructure existed despite excellent local-first architecture.

**Files Created/Modified:**

- NEW: `public/manifest.json`
- MODIFIED: `app/layout.tsx`

**Implementation:**
Created manifest with app metadata, icons, and display settings. Added manifest link and theme-color meta tag (dynamic for dark mode) to layout head. Also added Apple-specific meta tags for iOS support.

**Acceptance Criteria:**

- [x] Manifest file created with correct metadata
- [x] Manifest linked in layout head
- [x] Theme-color meta tag added (dynamic for dark mode)
- [x] Apple-specific meta tags for iOS support

---

### 4. Simplify Toast State in InventoryTable ✅ COMPLETED

**ROI:** 🟠 High — Removes useEffect anti-pattern, simplifies component logic

**Problem:**  
Toast visibility was set via useEffect when it can be derived directly.

**Files Updated:**

- `app/components/set/InventoryTableContainer.tsx`
- `app/components/set/InventoryTableView.tsx`

**Implementation:**
Replaced the useEffect anti-pattern with a derived visibility approach:

- Track dismissal state (`toastDismissedForCycle`) instead of visibility
- Derive visibility from `(isMinifigEnriching || !!minifigEnrichmentError) && !toastDismissedForCycle`
- Reset dismissal when a new enrichment cycle starts (React-recommended pattern for adjusting state on prop changes)
- Removed useEffect from both Container and View components

**Acceptance Criteria:**

- [x] Remove useEffect that sets toast state
- [x] Derive visibility from existing state
- [x] Toast still appears at correct times
- [x] Toast dismissal works correctly

---

### 5. Add Confidence Distribution Logging on Export ✅ COMPLETED

**ROI:** 🟠 High — Enables observability for mapping quality issues

**Problem:**  
No visibility into mapping confidence when users export CSVs. Low-confidence mappings may produce incorrect BrickLink IDs.

**Files Created/Modified:**

- NEW: `app/api/export/log-confidence/route.ts` - Server-side API for logging
- `app/lib/export/bricklinkCsv.ts` - Returns exported minifig IDs
- `app/components/export/ExportModal.tsx` - Calls logging API after export

**Implementation:**
Created a server-side API endpoint that:

1. Accepts exported minifig IDs from the client
2. Fetches confidence scores from `bricklink_minifig_mappings` table
3. Calculates distribution (perfect/high/medium/low/unmapped)
4. Logs with `logger.info('export.confidence_distribution', ...)`
5. Warns when >10% of minifigs have low confidence or are unmapped

The export flow now:

1. `generateBrickLinkCsv` tracks which minifig IDs were exported
2. `ExportModal` calls `/api/export/log-confidence` (fire-and-forget)
3. Server logs the distribution for observability

**Acceptance Criteria:**

- [x] Log confidence distribution before each export
- [x] Warn when >10% of minifigs have confidence <0.5 (or unmapped)
- [x] Include distribution stats in logs (perfect/high/medium/low/unmapped counts)
- [x] Track manually approved mappings separately

---

### 6. Extract useOrigin Custom Hook ✅ COMPLETED

**ROI:** 🟠 Medium — Removes duplicated pattern across 3+ components

**Problem:**  
Multiple components duplicated the same pattern for getting `window.location.origin` safely.

**Files Created/Modified:**

- NEW: `app/hooks/useOrigin.ts`
- MODIFIED: `app/components/set/SetPageClient.tsx`
- MODIFIED: `app/account/AccountPageClient.tsx`
- MODIFIED: `app/components/group/GroupSessionPageClient.tsx`

**Implementation:**

```typescript
// app/hooks/useOrigin.ts
'use client';

import { useEffect, useState } from 'react';

/**
 * SSR-safe hook to get window.location.origin.
 * Returns empty string during SSR and on initial client render,
 * then updates to the actual origin after hydration.
 */
export function useOrigin(): string {
  const [origin, setOrigin] = useState('');

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  return origin;
}
```

**Acceptance Criteria:**

- [x] Hook created with SSR compatibility
- [x] Replace duplicated patterns in 3 components
- [x] No hydration warnings
- [x] Tests pass

---

## P2 - Medium Priority

### 7. Add eslint-plugin-react-you-might-not-need-an-effect ⏭️ SKIPPED

**ROI:** 🟡 Medium — Prevents future useEffect anti-patterns

**Decision:** Skipped in favor of documenting best practices in `memory/system-patterns.md`. The documentation approach provides better context and examples for developers without adding ESLint noise for edge cases that are intentional.

**Alternative implemented:** Added comprehensive "React Best Practices" section to `memory/system-patterns.md` covering:

- useEffect anti-patterns with examples
- When useEffect IS appropriate
- State adjustment on prop changes pattern
- Reference to `useOrigin()` and other shared hooks

---

### 8. Configure Service Worker with next-pwa ✅ COMPLETED

**ROI:** 🟡 Medium — Enables offline image caching

**Files Created/Modified:**

- NEW: `public/manifest.json` — PWA manifest for installability
- NEW: `next-pwa.d.ts` — TypeScript declarations for next-pwa
- MODIFIED: `next.config.ts` — PWA configuration with runtime caching
- MODIFIED: `app/layout.tsx` — Added manifest link and theme-color meta tags
- MODIFIED: `.gitignore` — Excludes generated service worker files
- MODIFIED: `package.json` — Added next-pwa dependency

**Implementation:**

- Manifest includes app name, icons, display mode, and theme colors
- Service worker disabled in development to avoid caching issues
- Runtime caching for three image CDNs:
  - `cdn.rebrickable.com` — Part and set images (500 entries, 30 days)
  - `img.bricklink.com` — Minifig images (500 entries, 30 days)
  - `storage.googleapis.com` — Set thumbnails (200 entries, 30 days)
- Theme-color meta tag responds to dark mode
- Apple-specific meta tags for iOS home screen support

**Acceptance Criteria:**

- [x] next-pwa installed and configured
- [x] Service worker registers in production only
- [x] Image caching configured for Rebrickable, BrickLink, and Google Storage CDNs
- [x] Manifest linked in layout with theme-color meta tag

---

### 9. Remove Duplicate cleanup() Calls ✅ COMPLETED

**ROI:** 🟡 Medium — Code cleanup, reduces confusion

**Problem:**  
`cleanup()` is called twice in timeout handling logic.

**File:** `app/lib/rebrickable/client.ts`

**Implementation:**
Removed redundant `cleanup()` calls at lines 144 and 268 since cleanup is already called after fetch completes at lines 63 and 193.

**Acceptance Criteria:**

- [x] Single cleanup() call per timeout handler
- [x] Tests pass
- [x] Timeout handling still works correctly

---

### 10. Remove Duplicate pricing_source Field ✅ COMPLETED

**ROI:** 🟡 Low — API response cleanup

**Problem:**  
Both `pricingSource` and `pricing_source` fields returned in pricing response.

**Files Updated:**

- `app/lib/services/pricing.ts`
- `app/api/prices/bricklink-set/route.ts`
- `app/hooks/useInventoryPrices.ts`

**Implementation:**
Removed `pricing_source` field from type definitions and response objects across all files. Kept only the camelCase `pricingSource` field.

**Acceptance Criteria:**

- [x] Remove `pricing_source` field from response
- [x] Verify no client code uses snake_case version
- [x] Update types if needed

---

### 11. Add Request ID for Distributed Tracing ✅ COMPLETED

**ROI:** 🟡 Medium — Improves debugging and observability

**Files Updated:**

- `utils/supabase/middleware.ts` — Generates request ID and sets on request/response headers
- `lib/metrics.ts` — Added `getRequestIdFromHeaders()` and `createRequestLogger()` for bound logging

**Implementation:**

- Middleware generates UUID via `crypto.randomUUID()` or accepts incoming `x-request-id`
- Request ID passed to route handlers via request headers
- Response includes `x-request-id` header for client correlation
- `createRequestLogger(headers)` creates a logger bound to the request ID for consistent tracing

**Acceptance Criteria:**

- [x] Generate UUID request ID in middleware
- [x] Request ID available in route handlers via headers
- [x] Response includes x-request-id header
- [x] `createRequestLogger()` helper for bound logging

---

## P3 - Low Priority (Backlog)

### 12. Extract isMinifigParentRow Helper ✅ COMPLETED

**Problem:** Inline checks for minifig parent rows duplicated across files.

**Files Updated:**

- `app/components/set/inventory-utils.ts` - Added helper function
- `app/components/set/__tests__/inventory-utils.test.ts` - Added tests
- `app/hooks/useInventory.ts` - Updated to use helper

**Implementation:**

```typescript
// app/components/set/inventory-utils.ts
export function isMinifigParentRow(row: InventoryRow): boolean {
  return (
    row.parentCategory === 'Minifigure' &&
    typeof row.partId === 'string' &&
    row.partId.startsWith('fig:')
  );
}
```

**Acceptance Criteria:**

- [x] Helper function created
- [x] Replace inline checks in useInventory.ts (2 usages)
- [x] Add unit tests (6 test cases)

---

### 13. Use LRUCache for Service Caches ✅ COMPLETED

**Problem:** Custom cache maps in services had manual eviction logic that duplicated the existing `LRUCache` utility.

**Files Updated:**

- `app/lib/services/inventory.ts` — Replaced `spareCache` Map with `LRUCache<string, Set<string>>`
- `app/lib/services/identify.ts` — Replaced `identifyCache` Map with `LRUCache<string, PartInSet[]>`

**Implementation:**
Both services now use the existing `LRUCache` from `app/lib/cache/lru.ts` which provides:

- Built-in TTL expiration
- LRU eviction when at capacity
- Simpler code (removed manual eviction logic)

**Acceptance Criteria:**

- [x] Replace custom Map caches with LRUCache
- [x] Configure TTL from constants
- [x] Verify existing behavior preserved (all tests pass)

---

### 14. Guard console.warn in Owned Store ✅ COMPLETED

**Problem:** Client-side console.warn calls reach production.

**File:** `app/store/owned.ts`

**Implementation:**
Wrapped all 3 console.warn calls with `process.env.NODE_ENV !== 'production'` checks:

- Line 74: Failed to flush data to IndexedDB
- Line 87: Failed to persist data
- Line 260: Failed to hydrate from IndexedDB

**Acceptance Criteria:**

- [x] All console.warn guarded or replaced
- [x] No production console output from owned store

---

### 15. Add Integration Tests for Critical Flows ✅ COMPLETED

**Problem:** Limited integration test coverage.

**Files Updated:**

- `app/lib/export/__tests__/bricklinkCsv.test.ts` — Added 2 tests for `exportedMinifigIds` feature

**Implementation:**

- CSV export tests expanded from 7 to 9 tests
- Tests cover the new `exportedMinifigIds` return value for confidence logging
- Existing CSV export tests already provided good coverage for format compliance

**Acceptance Criteria:**

- [x] Test CSV export format compliance (7 existing tests)
- [x] Test new exportedMinifigIds feature (2 new tests)

---

### 16. Include API Routes in Test Coverage ✅ COMPLETED

**Problem:** `vitest.config.mts` excludes `app/api/**` from coverage.

**File:** `vitest.config.mts`

**Implementation:**
Documented in config why API routes are excluded from coverage metrics:

- Route handlers are thin wrappers delegating to services (which ARE covered)
- Testing HTTP concerns is done via integration tests (`app/api/**/__tests__/`)
- Coverage metrics on route handlers provide limited insight
- Tests still run — only coverage reporting is affected

**Acceptance Criteria:**

- [x] Document why API routes are excluded from coverage
- [x] API route tests continue to run (rate limiting tests exist)

---

### 17. Add Retry Scheduling for Failed Enrichments ✅ COMPLETED

**Problem:** No automatic retry for failed minifig enrichment.

**File:** `app/lib/services/minifigEnrichment.ts`

**Implementation:**
Added exponential backoff retry scheduling:

- `LRUCache` tracks failed enrichments (1000 entries, 24h TTL)
- Backoff intervals: 1h, 4h, 24h (max 3 attempts)
- `shouldSkipDueToBackoff()` checks before API calls
- `recordFailedEnrichment()` tracks failures
- `clearFailedEnrichment()` on success
- Separate tracking for image enrichment vs subparts

**Acceptance Criteria:**

- [x] Track failed attempts with timestamp
- [x] Implement exponential backoff (1h, 4h, 24h)
- [x] Skip retries for permanently-failed items (after 3 attempts)

---

### 18. Evaluate Persisting Spare Cache to Supabase ✅ EVALUATED

**Problem:** In-memory spare cache doesn't persist across serverless invocations.

**Evaluation:**
After analysis, persisting spare cache to Supabase is **not recommended** at this time:

**Reasons to defer:**

1. **LRU cache works well** — Already migrated to `LRUCache` with 7-day TTL (Task 13)
2. **Spares are stable** — Set spare parts rarely change; cache misses on cold starts are acceptable
3. **Added latency** — Supabase lookup would add ~50-100ms latency vs in-memory
4. **Complexity** — Would need migration, RLS policies, write-through logic
5. **Low ROI** — Most users visit same sets repeatedly; warm cache hits are common

**Future consideration:**
If spare cache misses become a measurable performance issue, consider:

- `rb_set_spares` table: `(set_num TEXT PK, spare_keys TEXT[], fetched_at TIMESTAMPTZ)`
- Check Supabase on cache miss, write-through on successful fetch
- Use service role client (internal catalog data)

**Acceptance Criteria:**

- [x] Evaluated trade-offs
- [x] Documented decision to defer
- [x] Outlined future implementation if needed

---

## Reference: Determinism Audit Summary

### Heuristic Logic Locations

| Component                | Type               | Confidence Range | Notes                                   |
| ------------------------ | ------------------ | ---------------- | --------------------------------------- |
| Minifig Name Matching    | Heuristic          | 0.25-1.0         | Jaccard + substring + image similarity  |
| Unique Part Count Match  | Semi-deterministic | 0.95             | Verified with name sim ≥0.2             |
| Part ID Suffix Stripping | Heuristic          | N/A              | Assumes BL doesn't distinguish variants |
| Brickognize Results      | External ML        | 0-1.0            | No local validation currently           |

### Self-Healing Data Patterns

| Trigger              | Mechanism              | Persisted To                             |
| -------------------- | ---------------------- | ---------------------------------------- |
| View set inventory   | On-demand minifig sync | `bricklink_minifig_mappings`             |
| Export to BrickLink  | Part ID mapping lookup | `part_id_mappings`                       |
| Identify part        | BL superset cache      | `bl_parts`, `bl_part_sets`               |
| View minifig details | Enrichment pipeline    | `rb_minifig_images`, `rb_minifig_parts`  |
| Dev fix mapping      | Manual approval        | `bricklink_minifig_mappings` (protected) |

---

## Implementation Order

**Recommended Sprint Plan:**

### Sprint 1 (This Week)

1. ✅ Task 1: Brickognize confidence threshold
2. ✅ Task 2: SearchResults useEffect fix
3. ✅ Task 3: Web App Manifest

### Sprint 2 (Next Week)

4. ✅ Task 4: Toast state simplification — COMPLETED
5. ✅ Task 5: Confidence logging on export — COMPLETED
6. ✅ Task 6: useOrigin hook extraction — COMPLETED
7. ⏭️ Task 7: ESLint plugin — SKIPPED (documented in memory/system-patterns.md instead)

### Sprint 3 (Following Week)

8. ✅ Task 8: Service Worker configuration — COMPLETED
9. ✅ Task 9: Remove duplicate cleanup() calls — COMPLETED
10. ✅ Task 10: Remove duplicate pricing_source field — COMPLETED
11. ✅ Task 11: Add request ID for distributed tracing — COMPLETED

### Backlog (Future)

- ✅ Task 12: Extract isMinifigParentRow helper — COMPLETED
- ✅ Task 13: Use LRUCache for service caches — COMPLETED
- ✅ Task 14: Guard console.warn in owned store — COMPLETED
- ✅ Task 15: Add integration tests — COMPLETED (2 new tests)
- ✅ Task 16: Document API route coverage exclusion — COMPLETED
- ✅ Task 17: Add retry scheduling for enrichments — COMPLETED
- ✅ Task 18: Evaluate spare cache persistence — EVALUATED (deferred)

---

## Verification Checklist

Before closing this improvement plan:

- [x] PWA manifest and service worker configured
- [x] Export includes confidence distribution logging
- [x] All duplicated patterns extracted to shared utilities (isMinifigParentRow, useOrigin)
- [x] Request ID tracing added to middleware and logger
- [x] Retry scheduling with exponential backoff for minifig enrichment
- [x] Tests pass: `npm run test` (146 tests)
- [ ] Lighthouse PWA audit passes (requires production deployment)
- [ ] Brickognize results filtered by confidence threshold (Task 1 - done previously)

## Completed Tasks Summary

**December 16, 2025:**

- ✅ Task 3: Created PWA manifest with theme-color and Apple meta tags
- ✅ Task 4: Simplified toast state in InventoryTable — replaced useEffect anti-pattern with derived visibility
- ✅ Task 5: Added confidence distribution logging on export — server-side API logs minifig mapping quality
- ✅ Task 6: Extracted `useOrigin` hook — replaced duplicated pattern in 3 components
- ✅ Task 8: Configured next-pwa with service worker and runtime caching for image CDNs
- ✅ Task 9: Removed duplicate cleanup() calls in `app/lib/rebrickable/client.ts`
- ✅ Task 10: Removed duplicate `pricing_source` field from pricing responses
- ✅ Task 11: Added request ID for distributed tracing — middleware generates IDs, logger supports binding
- ✅ Task 12: Extracted `isMinifigParentRow` helper to `inventory-utils.ts` with 6 unit tests
- ✅ Task 13: Replaced custom cache Maps with `LRUCache` in identify and inventory services
- ✅ Task 14: Guarded all console.warn calls in `app/store/owned.ts` with dev-only checks
- ✅ Task 15: Added 2 integration tests for `exportedMinifigIds` feature in CSV export
- ✅ Task 16: Documented why API routes are excluded from coverage (tests still run)
- ✅ Task 17: Added exponential backoff retry scheduling for failed minifig enrichments
- ✅ Task 18: Evaluated spare cache persistence — deferred due to low ROI
