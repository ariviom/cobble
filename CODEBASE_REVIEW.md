# Quarry Codebase Review

**Date:** November 27, 2025  
**Reviewer:** AI Code Review  
**Codebase:** Quarry — LEGO Set Piece Picker

---

## ✅ Issues Resolved (November 27, 2025)

The following critical and high-priority issues from this review have been addressed:

| ID  | Issue                                         | Resolution                                                                                      |
| --- | --------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| C1  | Duplicate `getThemeMeta` function definitions | ✅ Removed duplicate; consolidated at function scope                                            |
| H1  | rebrickable.ts too large                      | ✅ Created `app/lib/rebrickable/` module structure with `types.ts`, `client.ts`, and `index.ts` |
| H2  | Insufficient test coverage                    | ✅ Added 59 new tests (CSV exports, inventory calculations, LRU cache)                          |
| H3  | In-memory caches unbounded                    | ✅ Created `LRUCache` class in `app/lib/cache/lru.ts`; applied to all major caches              |
| H4  | No request timeout on fetches                 | ✅ Added 30-second AbortController timeout to `rbFetch` and `rbFetchAbsolute`                   |

**Test Count:** 108 passing tests (was ~49)

---

## Executive Summary

Quarry is a well-structured Next.js application that helps LEGO builders track owned pieces and export missing parts lists. The codebase demonstrates strong engineering practices including TypeScript strictness, separation of concerns, and thoughtful state management. The transition from local-only MVP to Supabase-backed persistence is underway with solid foundations.

**Overall Assessment:** 🟢 Good — Production-ready for MVP with clear paths to improvement

---

## Good Patterns (Strengths)

### 1. Strict TypeScript Configuration

```typescript
// tsconfig.json
"strict": true,
"exactOptionalPropertyTypes": true,
"noUnusedLocals": true,
"noUnusedParameters": true,
"noFallthroughCasesInSwitch": true
```

**Why it matters:** Catches bugs at compile time, enforces code quality, and makes refactoring safer.

---

### 2. Server-Only API Key Protection

```typescript
// app/lib/rebrickable.ts
import 'server-only';
// ...
function getApiKey(): string {
  const key = process.env.REBRICKABLE_API;
  if (!key) throw new Error('Missing REBRICKABLE_API env');
  return key;
}
```

**Why it matters:** API keys are never exposed to the client; Route Handlers proxy all Rebrickable calls.

---

### 3. Robust API Client with Retry/Backoff

```typescript
// rbFetch includes:
// - Configurable retry attempts (RB_MAX_ATTEMPTS = 3)
// - Respects Retry-After headers
// - Exponential backoff for 429/503/5xx errors
// - Parses rate limit messages from response body
```

**Why it matters:** Handles Rebrickable rate limits gracefully without crashing or exposing raw errors to users.

---

### 4. Clean Separation of Concerns

- **Hooks layer** (`useInventory`, `useInventoryViewModel`, `useSupabaseOwned`) — Data fetching and state logic
- **Store layer** (`owned.ts`, `user-sets.ts`) — Zustand stores with localStorage persistence
- **Service layer** (`lib/services/`) — Business logic abstracted from routes
- **Presentation layer** (`components/`) — Mostly stateless, receives data via props/hooks

---

### 5. Domain Error Handling

```typescript
// app/lib/domain/errors.ts
export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly status?: number;
}
```

**Why it matters:** Consistent error structure across the app; enables meaningful error messages and debugging.

---

### 6. Optimistic Local-First UX

```typescript
// app/store/owned.ts
// - Cache-first reads from memory
// - Debounced writes to localStorage (500ms)
// - Uses requestIdleCallback when available
// - Increments _version for reactive updates
```

**Why it matters:** UI stays responsive; writes batch efficiently; no blocking localStorage calls during interaction.

---

### 7. Well-Designed Database Schema

- Proper use of RLS policies for row-level security
- Foreign key indexes for performance (`20251127062633_add_fk_indexes.sql`)
- Clear separation between catalog data (`rb_*`) and user data (`user_*`)
- Type-safe Supabase client via generated `types.ts`

---

### 8. Modern CSS Architecture

```css
/* Tailwind 4 with CSS variables for theming */
@theme {
  --color-background: var(--color-neutral-100);
  --color-card: var(--color-neutral-00);
}
.dark {
  /* Semantic color overrides */
}
```

**Why it matters:** Dark mode support is systematic; brand colors are centralized; custom variants (`list`, `grid`, `item-sm`) reduce conditional logic in components.

---

### 9. Error Boundary at Root

```tsx
// app/layout.tsx
<ErrorBoundary>{children}</ErrorBoundary>
```

**Why it matters:** Prevents full-app crashes; provides recovery path for users.

---

### 10. Comprehensive Supabase Migration Strategy

- All schema changes captured as CLI migrations
- Clear progression from local-only to cloud-backed persistence
- Migration conflict detection for owned data (`useSupabaseOwned`)

---

## Issues (Problems)

### Critical

| ID  | Issue                              | Location                                   | Impact                                                                             | Difficulty | Risk    | Status      |
| --- | ---------------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------- | ---------- | ------- | ----------- |
| C1  | **Duplicate function definitions** | `rebrickable.ts` lines 652-683 and 758-791 | `getThemeMeta` is defined twice in the same function scope, causing potential bugs | 🟢 Easy    | 🔴 High | ✅ Resolved |

---

### High Priority

| ID  | Issue                                      | Location                                                              | Impact                                                               | Difficulty | Risk      | Status      |
| --- | ------------------------------------------ | --------------------------------------------------------------------- | -------------------------------------------------------------------- | ---------- | --------- | ----------- |
| H1  | **Rebrickable.ts is too large**            | `app/lib/rebrickable.ts` (1800+ lines)                                | Difficult to maintain, test, and understand; mixing concerns         | 🟡 Medium  | 🟡 Medium | ✅ Resolved |
| H2  | **Insufficient test coverage**             | Only 1 test file exists (`users.test.ts`)                             | Critical business logic (CSV export, inventory calculation) untested | 🟡 Medium  | 🔴 High   | ✅ Resolved |
| H3  | **In-memory caches have no size limits**   | `aggregatedSearchCache`, `setSummaryCache`, `minifigPartsCache`, etc. | Memory could grow unbounded in long-running server processes         | 🟢 Easy    | 🟡 Medium | ✅ Resolved |
| H4  | **No request timeout on external fetches** | `rbFetch`, `rbFetchAbsolute`                                          | Slow upstream responses could hang requests indefinitely             | 🟢 Easy    | 🟡 Medium | ✅ Resolved |
| H5  | **Account page is monolithic**             | `app/account/page.tsx` (983 lines)                                    | Hard to maintain, test, or reuse sections                            | 🟡 Medium  | 🟢 Low    | Pending     |

---

### Medium Priority

| ID  | Issue                                                  | Location                                       | Impact                                                                       | Difficulty | Risk      |
| --- | ------------------------------------------------------ | ---------------------------------------------- | ---------------------------------------------------------------------------- | ---------- | --------- |
| M1  | **Duplicate onOwnedChange handlers in InventoryTable** | `InventoryTable.tsx` lines 328-396 and 462-532 | Same logic duplicated for grouped vs ungrouped views                         | 🟢 Easy    | 🟢 Low    |
| M2  | **Missing loading states for some async actions**      | Various Supabase calls in hooks                | Users may not know if action is in progress                                  | 🟢 Easy    | 🟢 Low    |
| M3  | **ESLint not enforcing import ordering**               | `eslint.config.mjs`                            | Inconsistent import styles across files                                      | 🟢 Easy    | 🟢 Low    |
| M4  | **No input validation on API routes**                  | `/api/inventory`, `/api/search`                | Malformed inputs could cause unhandled errors                                | 🟢 Easy    | 🟡 Medium |
| M5  | **Constants.set_status includes removed statuses**     | `supabase/types.ts` line 795                   | Generated types include `can_build` and `partial` but migration removed them | 🟢 Easy    | 🟢 Low    |
| M6  | **Hardcoded USD currency**                             | BrickLink pricing calls                        | No path to support other currencies                                          | 🟡 Medium  | 🟢 Low    |
| M7  | **No pagination for collections membership**           | `UserSetsOverview.tsx`                         | Large collections could cause slow loads                                     | 🟡 Medium  | 🟡 Medium |

---

### Low Priority / Code Smells

| ID  | Issue                                  | Location                                              | Impact                                 | Difficulty | Risk   |
| --- | -------------------------------------- | ----------------------------------------------------- | -------------------------------------- | ---------- | ------ |
| L1  | **Empty trailing lines in storage.ts** | `app/lib/persistence/storage.ts`                      | Cosmetic; inconsistent formatting      | 🟢 Easy    | 🟢 Low |
| L2  | **Commented-out SVG filter in layout** | `app/layout.tsx` lines 52-76                          | Dead code cluttering layout            | 🟢 Easy    | 🟢 Low |
| L3  | **Magic numbers for debounce/timeout** | Various hooks and stores                              | Should be extracted as named constants | 🟢 Easy    | 🟢 Low |
| L4  | **Inconsistent error logging**         | Some use `console.error`, some use structured logging | Harder to debug in production          | 🟡 Medium  | 🟢 Low |
| L5  | **No Prettier/ESLint pre-commit hook** | Missing `.husky/` or similar                          | Code style drift possible              | 🟢 Easy    | 🟢 Low |

---

## Opportunities (Improvements)

### Architecture & Performance

| ID  | Opportunity                                  | Benefit                                              | Difficulty | Priority  |
| --- | -------------------------------------------- | ---------------------------------------------------- | ---------- | --------- |
| O1  | **Split rebrickable.ts into modules**        | Better testability, smaller files, clearer ownership | 🟡 Medium  | 🔴 High   |
| O2  | **Implement LRU cache for Rebrickable data** | Bounded memory usage, predictable behavior           | 🟢 Easy    | 🟡 Medium |
| O3  | **Add React Query stale-while-revalidate**   | Faster perceived performance on revisits             | 🟢 Easy    | 🟡 Medium |
| O4  | **Server Components for static content**     | Reduce client JS bundle, faster initial render       | 🟡 Medium  | 🟡 Medium |
| O5  | **Implement request abort signals**          | Cancel in-flight requests on component unmount       | 🟡 Medium  | 🟡 Medium |

---

### Testing & Quality

| ID  | Opportunity                              | Benefit                                    | Difficulty | Priority  |
| --- | ---------------------------------------- | ------------------------------------------ | ---------- | --------- |
| O6  | **Add tests for CSV export generators**  | Catch format regressions before production | 🟢 Easy    | 🔴 High   |
| O7  | **Add tests for inventory calculations** | Prevent owned/missing bugs                 | 🟢 Easy    | 🔴 High   |
| O8  | **Add integration tests for API routes** | Catch auth and error handling issues       | 🟡 Medium  | 🟡 Medium |
| O9  | **Set up test coverage thresholds**      | Enforce quality standards in CI            | 🟢 Easy    | 🟡 Medium |
| O10 | **Add Playwright E2E tests**             | Test critical user flows end-to-end        | 🔴 Hard    | 🟡 Medium |

---

### Developer Experience

| ID  | Opportunity                               | Benefit                                 | Difficulty | Priority  |
| --- | ----------------------------------------- | --------------------------------------- | ---------- | --------- |
| O11 | **Add Husky pre-commit hooks**            | Enforce lint/format before commits      | 🟢 Easy    | 🟡 Medium |
| O12 | **Add import ordering ESLint rule**       | Consistent, scannable imports           | 🟢 Easy    | 🟢 Low    |
| O13 | **Document API route contracts**          | Easier debugging, better team knowledge | 🟡 Medium  | 🟡 Medium |
| O14 | **Extract shared InventoryItem handlers** | Reduce duplication in InventoryTable    | 🟢 Easy    | 🟢 Low    |

---

### Feature Readiness

| ID  | Opportunity                               | Benefit                                     | Difficulty | Priority  |
| --- | ----------------------------------------- | ------------------------------------------- | ---------- | --------- |
| O15 | **Add input validation layer (zod)**      | Type-safe API inputs, better error messages | 🟡 Medium  | 🟡 Medium |
| O16 | **Prepare for multi-currency support**    | Unblock international users                 | 🟡 Medium  | 🟢 Low    |
| O17 | **Add Sentry or similar error tracking**  | Proactive production issue detection        | 🟢 Easy    | 🟡 Medium |
| O18 | **Implement rate limiting on API routes** | Prevent abuse, protect quotas               | 🟡 Medium  | 🟡 Medium |

---

## Summary Table: All Findings by Priority

| Priority    | ID      | Type          | Summary                                       | Difficulty | Risk      | Status      |
| ----------- | ------- | ------------- | --------------------------------------------- | ---------- | --------- | ----------- |
| 🔴 Critical | C1      | Issue         | Duplicate `getThemeMeta` function definitions | 🟢 Easy    | 🔴 High   | ✅ Resolved |
| 🔴 High     | H2      | Issue         | Insufficient test coverage                    | 🟡 Medium  | 🔴 High   | ✅ Resolved |
| 🔴 High     | O6      | Opportunity   | Add tests for CSV export generators           | 🟢 Easy    | —         | ✅ Done     |
| 🔴 High     | O7      | Opportunity   | Add tests for inventory calculations          | 🟢 Easy    | —         | ✅ Done     |
| 🔴 High     | O1      | Opportunity   | Split rebrickable.ts into modules             | 🟡 Medium  | —         | ✅ Done     |
| 🟡 Medium   | H1      | Issue         | rebrickable.ts is too large                   | 🟡 Medium  | 🟡 Medium | ✅ Resolved |
| 🟡 Medium   | H3      | Issue         | In-memory caches unbounded                    | 🟢 Easy    | 🟡 Medium | ✅ Resolved |
| 🟡 Medium   | H4      | Issue         | No request timeout on fetches                 | 🟢 Easy    | 🟡 Medium | ✅ Resolved |
| 🟡 Medium   | M4      | Issue         | No input validation on API routes             | 🟢 Easy    | 🟡 Medium | Pending     |
| 🟡 Medium   | M7      | Issue         | No pagination for collections                 | 🟡 Medium  | 🟡 Medium | Pending     |
| 🟡 Medium   | O2-O5   | Opportunities | Performance improvements                      | 🟢-🟡      | —         | Pending     |
| 🟡 Medium   | O8-O9   | Opportunities | Testing improvements                          | 🟢-🟡      | —         | Pending     |
| 🟢 Low      | H5      | Issue         | Account page is monolithic                    | 🟡 Medium  | 🟢 Low    | Pending     |
| 🟢 Low      | M1-M6   | Issues        | Various code quality items                    | 🟢 Easy    | 🟢 Low    | Pending     |
| 🟢 Low      | L1-L5   | Issues        | Code smells                                   | 🟢 Easy    | 🟢 Low    | Pending     |
| 🟢 Low      | O11-O18 | Opportunities | DX and feature readiness                      | 🟢-🟡      | —         | Pending     |

---

## Recommended Next Steps

### ~~Immediate (This Week)~~ ✅ COMPLETED

1. ~~**Fix C1:** Remove duplicate `getThemeMeta` function in rebrickable.ts~~ ✅
2. ~~**Address H4:** Add AbortController timeout to Rebrickable fetches~~ ✅
3. ~~**Address H3:** Implement max-size LRU cache for in-memory stores~~ ✅

### ~~Short Term (Next 2 Weeks)~~ ✅ COMPLETED

4. ~~**Address O6/O7:** Add unit tests for CSV generators and inventory calculations~~ ✅
5. ~~**Address H1/O1:** Break rebrickable.ts into smaller modules~~ ✅
   - `lib/rebrickable/types.ts` — shared type definitions
   - `lib/rebrickable/client.ts` — fetch helpers with retry/timeout
   - `lib/rebrickable/index.ts` — re-exports for backwards compatibility
   - `lib/cache/lru.ts` — LRU cache with TTL support

### Next Steps (Remaining)

6. **Address H5:** Split account page into smaller components
7. **Address O15:** Add zod validation to API routes
8. **Address O11:** Set up Husky pre-commit hooks
9. **Address O17:** Add error tracking (Sentry)

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         Client (Browser)                         │
├─────────────────────────────────────────────────────────────────┤
│  Components          │  Hooks              │  Stores             │
│  ├─ InventoryTable   │  ├─ useInventory    │  ├─ useOwnedStore   │
│  ├─ SetPageClient    │  ├─ useInventoryVM  │  ├─ useUserSets     │
│  └─ UserSetsOverview │  └─ useSupabaseOwned│  └─ localStorage    │
├─────────────────────────────────────────────────────────────────┤
│                      React Query Cache                           │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Next.js Route Handlers                        │
│  /api/search  │  /api/inventory  │  /api/prices/*  │  /api/group │
└───────────────┬─────────────────┬─────────────────┬─────────────┘
                │                 │                 │
                ▼                 ▼                 ▼
         ┌──────────┐      ┌──────────┐      ┌──────────┐
         │Rebrickable│      │ Supabase │      │BrickLink │
         │   API    │      │ Database │      │   API    │
         └──────────┘      └──────────┘      └──────────┘
```

---

_Generated by AI Code Review_
