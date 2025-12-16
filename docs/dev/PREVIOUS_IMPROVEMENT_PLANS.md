# Previous Improvement Plans Archive

**Consolidated:** December 16, 2025  
**Purpose:** Historical record of completed improvement work. See `CURRENT_IMPROVEMENT_PLAN.md` for active tasks.

---

## Table of Contents

1. [Codebase Review Issues (Dec 2025)](#1-codebase-review-issues-dec-2025) - Critical fixes for beta launch
2. [Codebase Improvement Plan (Dec 2025)](#2-codebase-improvement-plan-dec-2025) - PWA, React patterns, self-healing data
3. [Improvement Plan V2 (Dec 2025)](#3-improvement-plan-v2-dec-2025) - Security, stability, performance
4. [Original Improvement Plan (Dec 2024)](#4-original-improvement-plan-dec-2024) - Architecture, testing, code quality
5. [Initial Codebase Review (Nov 2025)](#5-initial-codebase-review-nov-2025) - First comprehensive audit

---

# 1. Codebase Review Issues (Dec 2025)

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

# 2. Codebase Improvement Plan (Dec 2025)

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

# 3. Improvement Plan V2 (Dec 2025)

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

# 4. Original Improvement Plan (Dec 2024)

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

# 5. Initial Codebase Review (Nov 2025)

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

_This document is archived for historical reference. For current improvement tasks, see `CURRENT_IMPROVEMENT_PLAN.md`._
