# Previous Improvement Plans Archive

**Consolidated:** December 16, 2025  
**Purpose:** Historical record of completed improvement work. See `CURRENT_IMPROVEMENT_PLAN.md` for active tasks.

---

## Table of Contents

1. [Scaling-Focused Architectural Review (Dec 2025)](#1-scaling-focused-architectural-review-dec-2025) - Post-beta scaling prep
2. [Codebase Review Issues (Dec 2025)](#2-codebase-review-issues-dec-2025) - Critical fixes for beta launch
3. [Codebase Improvement Plan (Dec 2025)](#3-codebase-improvement-plan-dec-2025) - PWA, React patterns, self-healing data
4. [Improvement Plan V2 (Dec 2025)](#4-improvement-plan-v2-dec-2025) - Security, stability, performance
5. [Original Improvement Plan (Dec 2024)](#5-original-improvement-plan-dec-2024) - Architecture, testing, code quality
6. [Initial Codebase Review (Nov 2025)](#6-initial-codebase-review-nov-2025) - First comprehensive audit
7. [Minifig Mapping System (Dec 2025)](#7-minifig-mapping-system-dec-2025) - RB→BL mapping algorithms, confidence scoring, review tools
8. [BrickLink Integration Plans (Dec 2025)](#8-bricklink-integration-plans-dec-2025) - Pricing architecture, rate limiting, BYOK

---

# 1. Scaling-Focused Architectural Review (Dec 2025)

**Completed:** December 16, 2025  
**Reviewer:** Senior Staff Engineer Audit  
**Context:** Identified architectural patterns that would create compounding problems at scale

## Summary

| Risk Area                     | Severity    | Resolution                                     |
| ----------------------------- | ----------- | ---------------------------------------------- |
| Multi-layer cache incoherence | 🔴 Critical | ✅ Resolved with targeted fixes (see below)    |
| Sync queue race conditions    | 🟠 High     | ✅ TabCoordinator with BroadcastChannel        |
| CSRF protection gaps          | 🟠 High     | ✅ Added `withCsrfProtection` to 4 routes      |
| External API cascade failures | 🟠 High     | ✅ Circuit breaker added to Rebrickable client |
| In-memory state leaks         | 🟡 Medium   | ✅ Verified cleanup already in place           |
| Service role privilege sprawl | 🟡 Medium   | ⏳ Deferred (see CURRENT_IMPROVEMENT_PLAN.md)  |

## Completed Work

### Cache Architecture (Phase 4)

After deep contextual analysis, determined that the original assessment overestimated the problem scope.

**Key findings:**

- Client-side IndexedDB caching was already version-aware via `inventoryVersion` field
- Most server caches are external API responses (BrickLink, Rebrickable) that don't depend on catalog version
- Brickognize 24hr cache is correctly designed (same image = same recognition result)

**Targeted fixes applied:**

- Reduced `spareCache` TTL from 7 days → 24 hours (more appropriate for live Rebrickable API data)
- Added `Cache-Control: public, max-age=60, stale-while-revalidate=120` to `/api/catalog/versions`
- Documented caching strategy in `memory/system-patterns.md`

**What was NOT done (and why):**

- Server-side version manager - Not needed; external API caches don't benefit from version awareness
- Version-keyed server caches - Would cause unnecessary cache misses
- React Query version integration - Client already handles via IndexedDB

See `docs/dev/CACHE_ARCHITECTURE_PLAN.md` for full analysis.

### Tab Coordinator (Phase 3)

Created `TabCoordinator` in `app/lib/sync/tabCoordinator.ts`:

- Uses `BroadcastChannel` for cross-tab communication
- Leader election with 5-second heartbeat interval
- 12-second timeout for dead leader detection
- Graceful fallback when BroadcastChannel unavailable

Updated `DataProvider` to use coordinator:

- Only leader tab performs sync operations
- `force: true` option bypasses leader check for tab close
- Exposes `isLeader` in context for UI feedback
- Notifies other tabs when sync completes

### Circuit Breaker for Rebrickable (Phase 2)

Added circuit breaker to Rebrickable client (`app/lib/rebrickable/client.ts`):

- Opens after 5 consecutive failures (configurable via `RB_BREAKER_THRESHOLD`)
- Cooldown of 60 seconds (configurable via `RB_BREAKER_COOLDOWN_MS`)
- Logs circuit open events via `logger.warn`
- Exported `isRebrickableCircuitOpen()` for status checks

Added `rebrickable_circuit_open` error code to domain errors.

Updated `/api/inventory` and `/api/search` routes to return 503 with retry guidance when circuit is open.

### CSRF Protection (Phase 1)

Added `withCsrfProtection` to 4 routes:

- `/api/auth/signout`
- `/api/sets/id/[setNumber]/refresh-image`
- `/api/export/log-confidence`
- `/api/dev/minifig-mappings/fix`

### In-Memory State Cleanup (Phase 1)

Verified cleanup already implemented:

- `inFlightSpares` in inventory.ts (line 116-118) - has `.finally()` cleanup
- `hydrationPromises` in owned.ts (line 269-270) - has `.finally()` cleanup

## Well-Implemented Areas (No Action Needed)

The following patterns were confirmed as well-designed for scale:

1. **Service layer separation** - Clear boundary between routes and business logic
2. **RLS security model** - Proper table classification in `catalogAccess.ts`
3. **Structured logging** - Consistent `logger` usage
4. **Error handling** - Normalized `AppError` codes and `errorResponse()` helper
5. **Rate limiting** - Distributed Supabase-backed with in-memory fallback
6. **Type safety** - Strict TypeScript, no `any` types
7. **Request tracing** - Request IDs in error responses
8. **External API resilience (BrickLink)** - Circuit breaker pattern

---

# 2. Codebase Review Issues (Dec 2025)

**Completed:** December 2025  
**Focus:** Critical fixes for beta launch

## Completion Summary

| Phase   | Task                               | Status                              |
| ------- | ---------------------------------- | ----------------------------------- |
| Phase 1 | Standardize API error responses    | ✅ Complete                         |
| Phase 1 | Replace console.\* with logger     | ✅ Complete                         |
| Phase 1 | Fix SearchResults useEffect        | ✅ Complete                         |
| Phase 2 | Add logging to silent catch blocks | ✅ Complete                         |
| Phase 2 | Extract useOrigin hook             | ✅ Complete (existed)               |
| Phase 2 | Add request ID tracing             | ✅ Complete                         |
| Phase 3 | Split AccountPageClient.tsx        | ✅ Complete (1,375→145 lines)       |
| Phase 3 | Split identify/sets/route.ts       | ✅ Complete (492→106 lines)         |
| Phase 3 | Add API route tests (top 5)        | ✅ Complete (+38 tests)             |
| Phase 4 | Fix remaining type safety issues   | ✅ Verified (strict mode, no `any`) |
| Phase 4 | Complete API test coverage         | ✅ Complete (+22 more, 60 total)    |
| Phase 4 | Split remaining large components   | ⏳ Deferred (post-beta)             |

### Issues Addressed

1. **Monster Components** - AccountPageClient split from 1,375 to 145 lines
2. **Inconsistent API Errors** - All routes now use `errorResponse()` helper
3. **Raw console.\* Calls** - 131 calls replaced with structured `logger`
4. **API Test Coverage** - 60 new tests added for critical routes
5. **useEffect Anti-Patterns** - Fixed in SearchResults.tsx
6. **Silent Error Swallowing** - Added logging to all catch blocks
7. **Request Tracing** - Request IDs now in all error responses

---

# 3. Codebase Improvement Plan (Dec 2025)

## Focus Areas

- **Determinism vs Heuristics** in RB→BL mapping logic
- **Self-Healing Data Patterns** for progressive data improvement
- **PWA Readiness** for installable SPA capability
- **React Best Practices** including useEffect patterns

## Completed Tasks

| Task | Description                                              | Status                          |
| ---- | -------------------------------------------------------- | ------------------------------- |
| 1    | Add minimum confidence threshold for Brickognize results | ✅                              |
| 2    | Fix useEffect anti-patterns in SearchResults             | ✅                              |
| 3    | Add Web App Manifest for PWA                             | ✅                              |
| 4    | Simplify toast state in InventoryTable                   | ✅                              |
| 5    | Add confidence distribution logging on export            | ✅                              |
| 6    | Extract useOrigin custom hook                            | ✅                              |
| 7    | Add eslint-plugin-react-you-might-not-need-an-effect     | ⏭️ Skipped (documented instead) |
| 8    | Configure service worker with next-pwa                   | ✅                              |
| 9    | Remove duplicate cleanup() calls                         | ✅                              |
| 10   | Remove duplicate pricing_source field                    | ✅                              |
| 11   | Add request ID for distributed tracing                   | ✅                              |
| 12   | Extract isMinifigParentRow helper                        | ✅                              |
| 13   | Use LRUCache for service caches                          | ✅                              |
| 14   | Guard console.warn in owned store                        | ✅                              |
| 15   | Add integration tests for critical flows                 | ✅                              |
| 16   | Include API routes in test coverage                      | ✅ (documented exclusion)       |
| 17   | Add retry scheduling for failed enrichments              | ✅                              |
| 18   | Evaluate persisting spare cache to Supabase              | ✅ Evaluated (deferred)         |

---

# 4. Improvement Plan V2 (Dec 2025)

## Priority-Ordered Tasks

### 1) Critical Security & Data Integrity ✅

- ✅ Lock down BrickLink cache tables (RLS enabled)
- ✅ Supabase session middleware (`@supabase/ssr` cookie refresh)
- ✅ Unified rate limiting (RPC-based, bounded LRU fallback)
- ✅ CSRF/origin hardening (env-driven allowlist, double-submit token)
- ✅ Production logging/metrics (preserved despite removeConsole)

### 2) High Stability & Data Loss Prevention ✅

- ✅ Reliable sync flush (`sendBeacon` on visibilitychange/unload)
- ✅ Owned hydration robustness (pagination + limits)
- ✅ Bounded caches (LRU-ish caps added)

### 3) Architecture & Maintainability ✅

- ✅ InventoryTable decomposition (memoized leaf rows)
- ✅ Owned-sync abstraction (shared helper extracted)
- ✅ Timing/config constants (`app/config/timing.ts`)

### 4) Performance & UX ✅

- ✅ Identify pipeline caching (TTL+bounded cache)
- ✅ Spare-part fetch efficiency (TTL+bounded spareCache)

### 5) Testing & Verification ⏳

- Integration/security tests for routes
- RLS tests for new tables
- Persistence/e2e tests
- Performance regression checks

---

# 5. Original Improvement Plan (Dec 2024)

## Progress Summary

| Section | Task                                 | Status         |
| ------- | ------------------------------------ | -------------- |
| A1      | Monolithic Library Files             | ✅ Completed   |
| A2      | Duplicated Identify Logic            | ✅ Completed   |
| A3      | Duplicated extractBricklinkPartId    | ❌ Cancelled   |
| A4      | Inconsistent Service Layer           | ✅ Completed   |
| B1      | Console Logging → Structured Logging | ✅ Completed   |
| B2      | Error Handling Standardization       | ✅ Completed   |
| B3      | Input Validation with Zod            | ✅ Completed   |
| B4      | Type Safety - Reduce Unsafe Casts    | ⬜ In Progress |
| C1      | Cache Logic Consolidation            | ✅ Completed   |
| C2      | Theme Utilities Centralization       | ✅ Completed   |
| C3      | Supabase Client Audit                | ✅ Completed   |
| D1-D4   | Performance Improvements             | ✅ Completed   |
| E1-E4   | Security Hardening                   | ⏳ Partial     |
| F1      | Magic Numbers → Constants            | ✅ Completed   |
| F2-F4   | Code Smells                          | ⬜ In Progress |
| G1-G4   | Testing Enhancements                 | ⬜ In Progress |

### Key Achievements

1. **Rebrickable module refactored** into `app/lib/rebrickable/` with separate files for types, client, search, inventory, parts, minifigs, themes, colors, and utils

2. **Service layer pattern established**:
   - Route handlers: HTTP concerns only
   - Services: Business logic orchestration
   - Data access: External API/DB calls
   - Domain: Shared types and errors

3. **Error handling standardized**:
   - `AppErrorCode` type with comprehensive codes
   - `errorResponse()` helper with HTTP status mapping
   - Consistent `{ error, message, details? }` shape

4. **Caching consolidated**:
   - `LRUCache` class in `app/lib/cache/lru.ts`
   - Constants file at `app/lib/constants.ts`
   - Centralized TTL values

5. **Security improvements**:
   - Distributed rate limiting via Supabase RPC
   - CSRF protection with `withCsrfProtection` wrapper
   - Server-only boundaries enforced

---

# 6. Initial Codebase Review (Nov 2025)

## Issues Resolved

| ID  | Issue                             | Resolution                         |
| --- | --------------------------------- | ---------------------------------- |
| C1  | Duplicate `getThemeMeta` function | ✅ Consolidated                    |
| H1  | rebrickable.ts too large          | ✅ Created module structure        |
| H2  | Insufficient test coverage        | ✅ Added 59 new tests              |
| H3  | In-memory caches unbounded        | ✅ Created LRUCache class          |
| H4  | No request timeout on fetches     | ✅ Added 30-second AbortController |

## Strengths Identified

1. **Strict TypeScript Configuration** - Catches bugs at compile time
2. **Server-Only API Key Protection** - Keys never exposed to client
3. **Robust API Client** - Retry/backoff for Rebrickable
4. **Clean Separation of Concerns** - Hooks, stores, services, components
5. **Domain Error Handling** - Consistent `AppError` structure
6. **Optimistic Local-First UX** - Cache-first reads, debounced writes
7. **Well-Designed Database Schema** - RLS, FK indexes, type-safe client
8. **Modern CSS Architecture** - Tailwind 4 with CSS variables
9. **Error Boundary at Root** - Prevents full-app crashes
10. **Comprehensive Migration Strategy** - All schema changes as CLI migrations

---

# Summary: What Was Accomplished

## Architecture

- ✅ Rebrickable library modularized (1800+ lines → 9 focused modules)
- ✅ Service layer pattern established and documented
- ✅ Supabase client access centralized in `catalogAccess.ts`
- ✅ Constants file created with grouped configurations

## Code Quality

- ✅ Error handling standardized across all API routes
- ✅ Console logging replaced with structured `logger`
- ✅ Type safety improved (strict mode, type guards added)
- ✅ Large components split (AccountPageClient: 1,375→145 lines)

## Security

- ✅ Distributed rate limiting via Supabase RPC
- ✅ CSRF protection on state-changing routes
- ✅ Server-only boundaries enforced
- ✅ RLS enabled on all catalog tables

## Testing

- ✅ 60+ new API route tests
- ✅ CSV export tests
- ✅ LRU cache tests
- ✅ Inventory calculation tests

## Performance

- ✅ LRU caches with TTL replace unbounded Maps
- ✅ Request deduplication for concurrent fetches
- ✅ Service worker for image caching
- ✅ Request timeouts added

## Developer Experience

- ✅ Request ID tracing for debugging
- ✅ React patterns documented in system-patterns.md
- ✅ useOrigin and other shared hooks extracted
- ✅ PWA manifest and service worker configured

---

# 7. Minifig Mapping System (Dec 2025)

**Status:** Implemented  
**Purpose:** Automatic RB↔BL minifig identification with confidence scoring and manual review workflows

## Overview

The minifig mapping system automatically maps Rebrickable minifig IDs to BrickLink minifig IDs using multiple matching strategies, confidence scoring, and image similarity.

## Architecture

```
Rebrickable CSV → rb_inventories, rb_inventory_minifigs, rb_minifigs
                       ↓
BrickLink API → bl_set_minifigs (with rb_fig_id linkage)
                       ↓
Automatic Mapping Algorithm → bricklink_minifig_mappings
                       ↓
Manual Review UI → Manual corrections & approvals
```

## Matching Stages (in order)

1. **Exact Normalized Name** → 1.0 confidence
2. **Unique Part Count** → 0.95 confidence (when part count appears only once in both RB and BL)
3. **Combined Similarity** → Variable (threshold: 0.25, with set size boost)
4. **Greedy Fallback** → Variable (equal counts, with set size boost)
5. **Process of Elimination** → 0.90 confidence (75%+ high-conf, 1-2 low remain)
6. **Single Fig** → 1.0 confidence (only option remaining)

## Confidence Algorithm

### Base Similarity (with image):

```
score = (jaccard * 0.20) + (substring * 0.35) + (keyName * 0.20) + (partCount * 0.05) + (image * 0.20)
```

### Base Similarity (without image):

```
score = (jaccard * 0.25) + (substring * 0.44) + (keyName * 0.25) + (partCount * 0.06)
```

### Set Size Boost

- 1 minifig: Boost to 1.0 (perfect certainty)
- 2 minifigs: +0.10 to +0.30 based on base similarity
- 3 minifigs: +0.05 to +0.20 based on base similarity
- 4-5 minifigs: +0.04 to +0.07
- 6+ minifigs: +0.00 to +0.03

## Key Features

### Image Similarity (pHash)

- Perceptual hashing using `sharp` and `imghash`
- 16-bit pHash resistant to minor changes (scaling, compression)
- Hamming distance for 0-1 similarity score
- Stored in `rb_minifig_images` and `bl_set_minifigs` tables

### Manual Approval Protection

- `manually_approved` flag prevents automated overwrites
- All backfill/automated scripts check before upserting
- Preserves human-reviewed mappings through algorithm updates

### Review Tool

- Development-only UI at `/dev/minifig-review`
- Side-by-side image comparison
- Filter by confidence threshold
- Actions: Approve, Edit, Delete
- Visual minifig selector for remapping

## Scripts

| Script                                          | Purpose                            |
| ----------------------------------------------- | ---------------------------------- |
| `npm run build:minifig-mappings:all`            | Process unsynced sets from rb_sets |
| `npm run build:minifig-mappings:all -- --force` | Re-process already-synced sets     |
| `npm run backfill:confidence-scores 0 0.7`      | Reprocess low-confidence mappings  |
| `npm run backfill:image-hashes both`            | Generate pHash for minifig images  |
| `npm run fix:unmapped-minifigs`                 | Find and fix unmapped BL minifigs  |

## Source Tags

- `set:name-normalized` - Exact normalized name match
- `set:unique-part-count` - Unique part count match
- `set:combined-similarity` - Multi-dimensional similarity with boost
- `set:greedy-fallback` - Best available match with boost
- `set:elimination` - Process of elimination boost
- `set:single-fig` - Only remaining option
- `manual-approval` - Human reviewed and approved

## RB→BL Mapping Hardening

### Determinism Improvements

- Deterministic color mapping: normalize/trim IDs, sort numerically
- Deterministic external ID pick: sort (numeric first, then lexicographic)
- Remove silent RB-id fallback: return `null` with reason
- Confidence gating: require threshold (≥0.6) before upserting

### Caching

- Short TTL for minifig/part caches
- Invalidate after on-demand sync completes
- Clear null entries on sync success

## Future: LLM-Assisted Review (Planned)

Architecture for batch processing low-confidence mappings:

- Ollama with LLaVA 13B for vision analysis
- Text-only fallback with Llama 3.2
- Actions: approve, reject, remap, needs_review
- Database columns: `llm_suggestion`, `llm_confidence`, `llm_action`, `llm_reasoning`

---

# 8. BrickLink Integration Plans (Dec 2025)

**Status:** Partially Implemented  
**Purpose:** Architecture for BrickLink pricing, rate limiting, and BYOK support

## Current Implementation

### Rate Limiting (P1) ✅

- Middleware sliding windows (IP + user) for BL-touching routes
- Per-request caps with `Retry-After` on 429
- Overall request timeout via AbortController

### Caching (P2) ✅

- Price cache: `itemType+itemNo+colorId+condition+scopeLabel`
- TTL 15-60m with stale-while-revalidate
- In-flight dedupe map
- Mapping cache: write-through successful RB→BL lookups

### Concurrency & Circuit Breaker (P3) ✅

- Bounded concurrency pool (5-8) for BL calls
- Per-call timeout (15-30s)
- Circuit breaker: 3-5 consecutive 429/503 → pause 60-120s

### Input Validation (P4) ✅

- Zod schemas for pricing, parts mapping, inventory, search, sync

### Observability (P5) ✅

- Structured logs: route, cache hit/miss, duration, 429/5xx
- Counters: cache hit/miss, BL requests, breaker state

## Pricing Display States

| State       | Description                | API Field                       |
| ----------- | -------------------------- | ------------------------------- |
| Real-time   | On-demand BL API call      | `pricing_source: 'real_time'`   |
| Historical  | From periodic aggregates   | `pricing_source: 'historical'`  |
| Unavailable | Budget exhausted, no cache | `pricing_source: 'unavailable'` |

## Future: Full Pricing Architecture (Planned)

### Database Schema (Proposed)

- `items` - Canonical parts/sets/minifigs with `bl_id`
- `item_colors` - Known colors per item
- `bricklink_raw_price_guide` - Raw API responses
- `item_color_prices` - Aggregated 6-month metrics in USD cents
- `bricklink_price_tasks` - Task queue for refresh scheduling

### Ingestion Worker (Proposed)

- Server-side process for BL API calls
- Daily budget tracking: `BRICKLINK_DAILY_TOTAL_BUDGET`, `BRICKLINK_DAILY_USER_BUDGET`
- Incremental updates based on `item_interest` scores

### BYOK (Bring Your Own Key) for Pro Users (Proposed)

- User supplies their own BL OAuth credentials
- Encrypted storage in `user_bricklink_credentials`
- Server-side proxy calls (never expose keys to client)
- Per-user rate limiting and quota tracking

---

_This document is archived for historical reference. For current improvement tasks, see `CURRENT_IMPROVEMENT_PLAN.md`._
