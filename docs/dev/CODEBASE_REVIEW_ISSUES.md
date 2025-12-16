# Codebase Review: Critical Issues & Fixes

**Review Date:** December 16, 2025  
**Reviewer:** Senior Engineer Audit  
**Context:** Pre-beta launch review identifying patterns and issues that will cause problems at scale

---

## Executive Summary

The codebase has a **solid architectural foundation** with good patterns for:

- Local-first data management (IndexedDB + Zustand)
- Service layer abstraction
- Server-only secrets handling
- RLS security on Supabase tables

However, the implementation has accumulated significant technical debt that will impede beta success:

| Category       | Issues Found                                       | Risk Level  |
| -------------- | -------------------------------------------------- | ----------- |
| Component Size | 4 files > 800 lines                                | 🔴 Critical |
| Error Handling | Inconsistent patterns across 30+ routes            | 🔴 Critical |
| Logging        | 131 raw console.\* calls vs structured logger      | 🔴 Critical |
| Test Coverage  | API routes excluded, 25 test files for 200+ source | 🟠 High     |
| React Patterns | useEffect anti-patterns in key components          | 🟠 High     |
| Type Safety    | 25+ explicit `any` types                           | 🟡 Medium   |

---

## 🔴 Critical Issues

### 1. Monster Components Violating Single Responsibility

#### Problem

Several components have grown to unmanageable sizes, mixing multiple concerns:

| File                                             | Lines | Concerns Mixed                                                                                                                                                      |
| ------------------------------------------------ | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app/account/AccountPageClient.tsx`              | 1,382 | Auth state, profile editing, username validation, password changes, pricing preferences, theme settings, minifig sync preferences, billing status, lists visibility |
| `app/identify/IdentifyClient.tsx`                | 879   | Image upload/capture, camera permissions, part candidate display, color selection, set list display, keyboard navigation, result state management                   |
| `app/dev/minifig-review/MinifigReviewClient.tsx` | 859   | Data fetching, filtering, sorting, approval workflow, image comparison, manual mapping UI                                                                           |
| `app/api/identify/sets/route.ts`                 | 491   | Minifig lookup, part lookup, color mapping, BrickLink fallback, Rebrickable enrichment, sorting, response formatting                                                |

#### Impact

- **Bug fixes are risky**: Changing one feature can break unrelated functionality
- **Testing is impractical**: Can't unit test individual features
- **Onboarding is slow**: New developers struggle to understand the flow
- **Code review is painful**: PRs touching these files are hard to review

#### Proposed Fix

**AccountPageClient.tsx → Split into 6 focused components:**

```
app/account/
├── AccountPageClient.tsx          # Layout + tab navigation only (~100 lines)
├── components/
│   ├── ProfileSection.tsx         # Username, avatar, public profile toggle
│   ├── SecuritySection.tsx        # Password change (email auth only)
│   ├── PricingPreferencesSection.tsx  # Currency, country selection
│   ├── ThemeSection.tsx           # Theme mode + color selection
│   ├── MinifigSyncSection.tsx     # Sync preferences + manual trigger
│   └── CollectionStatsSection.tsx # Owned/wishlist counts
└── hooks/
    ├── useProfileForm.ts          # Profile form state + validation
    ├── usePricingForm.ts          # Pricing form state
    └── usePasswordChange.ts       # Password change flow
```

**identify/sets/route.ts → Split into focused handlers:**

```
app/api/identify/sets/
├── route.ts                       # Request parsing + response formatting only
└── handlers/
    ├── minifigHandler.ts          # Minifig identification flow
    ├── partHandler.ts             # Part identification flow
    └── enrichment.ts              # Shared enrichment logic
```

#### Implementation Steps

1. Create the component directory structure
2. Extract state and handlers into custom hooks
3. Move JSX sections into focused components
4. Update imports in parent component
5. Add unit tests for each extracted piece

**Estimated effort:** 2-3 days  
**Risk:** Low (refactoring, no behavior change)

---

### 2. Inconsistent API Error Response Patterns

#### Problem

Two different error response patterns are used across API routes:

**Pattern A (Correct) - Used in 22 routes:**

```typescript
// Uses centralized errorResponse() helper
import { errorResponse } from '@/app/lib/api/responses';

return errorResponse('validation_failed', {
  details: { issues: parsed.error.flatten() },
});
// Returns: { error: 'validation_failed', message: 'validation failed', details: {...} }
// With correct HTTP status code (400)
```

**Pattern B (Incorrect) - Used in 8+ routes:**

```typescript
// Raw NextResponse.json with inconsistent shape
return NextResponse.json({ error: 'missing_part' });
// Returns: { error: 'missing_part' }
// With HTTP 200 status! ❌
```

#### Files Using Incorrect Pattern

| File                                        | Line     | Current Code                                                |
| ------------------------------------------- | -------- | ----------------------------------------------------------- |
| `app/api/identify/sets/route.ts`            | 29       | `NextResponse.json({ error: 'missing_part' })`              |
| `app/api/identify/sets/route.ts`            | 39-43    | `NextResponse.json({ error: 'missing_minifig_id', ... })`   |
| `app/api/identify/sets/route.ts`            | 179-183  | `NextResponse.json({ error: 'identify_sets_failed', ... })` |
| `app/api/identify/bl-supersets/route.ts`    | Multiple | Raw error responses                                         |
| `app/api/minifigs/[figNum]/route.ts`        | Multiple | Raw error responses                                         |
| `app/api/catalog/versions/route.ts`         | 29       | `NextResponse.json({ error: 'Failed to fetch versions' })`  |
| `app/api/stripe/webhook/route.ts`           | Multiple | Raw error responses                                         |
| `app/api/dev/minifig-mappings/fix/route.ts` | Multiple | Raw error responses                                         |

#### Impact

- Client code can't reliably parse error responses
- HTTP status codes are incorrect (200 for errors)
- No structured logging for error responses using Pattern B
- Inconsistent developer experience

#### Proposed Fix

**Step 1: Add missing error codes to `app/lib/domain/errors.ts`:**

```typescript
export type AppErrorCode =
  // ... existing codes ...
  // Add new codes for currently raw errors:
  | 'missing_part'
  | 'missing_minifig_id'
  | 'missing_set_number'
  | 'webhook_signature_invalid'
  | 'webhook_processing_failed'
  | 'versions_fetch_failed'
  | (string & {});
```

**Step 2: Update each file to use `errorResponse()`:**

```typescript
// Before (app/api/identify/sets/route.ts:29)
if (!part) {
  return NextResponse.json({ error: 'missing_part' });
}

// After
if (!part) {
  return errorResponse('missing_required_field', {
    message: 'Part parameter is required',
    status: 400,
  });
}
```

**Step 3: Add status mapping for new codes:**

```typescript
// app/lib/api/responses.ts
const STATUS_MAP: Partial<Record<AppErrorCode, number>> = {
  // ... existing mappings ...
  missing_part: 400,
  missing_minifig_id: 400,
  missing_set_number: 400,
  webhook_signature_invalid: 401,
  webhook_processing_failed: 500,
  versions_fetch_failed: 500,
};
```

#### Implementation Steps

1. Add new error codes to domain/errors.ts
2. Update STATUS_MAP in api/responses.ts
3. Update each affected route (8 files)
4. Add integration tests for error responses
5. Update any client code that parses errors differently

**Estimated effort:** 4-6 hours  
**Risk:** Low-Medium (need to verify client code handles new response shape)

---

### 3. Raw console.\* Calls vs Structured Logger

#### Problem

The codebase has a structured logger in `lib/metrics.ts` but also has **131 raw console.log/warn/error calls across 45 files**.

#### Files with Most console.\* Usage

| File                                 | Count | Example                                              |
| ------------------------------------ | ----- | ---------------------------------------------------- |
| `app/api/minifigs/[figNum]/route.ts` | 16    | `console.error('Error fetching minifig:', err)`      |
| `app/lib/localDb/ownedStore.ts`      | 8     | `console.warn('[owned] Failed to flush...')`         |
| `app/lib/localDb/syncQueue.ts`       | 7     | `console.error('[syncQueue] Failed to add...')`      |
| `app/hooks/useSetLists.ts`           | 6     | `console.error('Failed to save set status')`         |
| `app/hooks/useMinifigLists.ts`       | 6     | `console.error('Failed to fetch user minifigs')`     |
| `app/lib/minifigMappingBatched.ts`   | 5     | `console.warn('getMinifigMappingsForSetBatched...')` |

#### Impact

- **Production logs are chaotic**: Mix of structured JSON and raw text
- **No log levels in production**: Can't filter by severity
- **No request correlation**: Can't trace logs across a request lifecycle
- **Inconsistent formatting**: Some logs include context objects, others don't

#### Proposed Fix

**Step 1: Enhance the logger for client-side usage:**

```typescript
// lib/metrics.ts - add client-safe logging
export const logger = {
  debug: (event: string, data?: Record<string, unknown>) => {
    if (process.env.NODE_ENV !== 'production') {
      console.debug(
        JSON.stringify({ level: 'debug', event, ...data, ts: Date.now() })
      );
    }
  },
  info: (event: string, data?: Record<string, unknown>) => {
    console.info(
      JSON.stringify({ level: 'info', event, ...data, ts: Date.now() })
    );
  },
  warn: (event: string, data?: Record<string, unknown>) => {
    console.warn(
      JSON.stringify({ level: 'warn', event, ...data, ts: Date.now() })
    );
  },
  error: (event: string, data?: Record<string, unknown>) => {
    console.error(
      JSON.stringify({ level: 'error', event, ...data, ts: Date.now() })
    );
  },
};
```

**Step 2: Create a migration script to find and replace:**

```bash
# Find all console.* usages
rg "console\.(log|warn|error|info|debug)" app/ --type ts --type tsx -l
```

**Step 3: Replace patterns systematically:**

```typescript
// Before
console.warn('[owned] Failed to flush data to IndexedDB:', error);

// After
import { logger } from '@/lib/metrics';
logger.warn('owned.flush_failed', {
  error: error instanceof Error ? error.message : String(error),
});
```

```typescript
// Before
console.error('Error fetching minifig:', err);

// After
logger.error('minifig.fetch_failed', {
  figNum,
  error: err instanceof Error ? err.message : String(err),
});
```

**Step 4: Update ESLint to enforce:**

```javascript
// eslint.config.mjs - already has this, but verify it's working
rules: {
  'no-console': ['error', { allow: ['warn', 'error'] }],  // Change to full error
}
```

#### Implementation Steps

1. Update `lib/metrics.ts` with client-safe logging
2. Run search to identify all 131 usages
3. Replace in batches by file/feature area
4. Enable stricter ESLint rule
5. Verify no raw console in build output

**Estimated effort:** 4-6 hours  
**Risk:** Low (logging changes, no behavior change)

---

## 🟠 High Priority Issues

### 4. API Routes Excluded from Test Coverage

#### Problem

```typescript
// vitest.config.mts:21-29
coverage: {
  reporter: ['text', 'html'],
  include: ['app/**/*.{ts,tsx}'],
  exclude: [
    'app/api/**',  // ⚠️ All 30+ API routes excluded!
    'app/styles/**',
    'app/**/__tests__/**',
    // ...
  ],
},
```

Current test file count: **25 test files** for **200+ source files**

#### Critical Untested Routes

| Route                   | Complexity | Business Impact                    |
| ----------------------- | ---------- | ---------------------------------- |
| `/api/inventory`        | Medium     | Core feature - inventory loading   |
| `/api/search`           | Medium     | Core feature - set discovery       |
| `/api/prices/bricklink` | High       | Paid feature - pricing             |
| `/api/identify`         | Very High  | Paid feature - part identification |
| `/api/sync`             | High       | Data persistence                   |
| `/api/stripe/webhook`   | Critical   | Billing - money handling           |

#### Proposed Fix

**Step 1: Remove API exclusion from coverage config:**

```typescript
// vitest.config.mts
coverage: {
  exclude: [
    // Remove: 'app/api/**',
    'app/styles/**',
    'app/**/__tests__/**',
  ],
},
```

**Step 2: Create test infrastructure for API routes:**

```typescript
// app/api/__tests__/testUtils.ts
import { NextRequest } from 'next/server';

export function createMockRequest(
  url: string,
  options?: {
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
  }
): NextRequest {
  const { method = 'GET', body, headers = {} } = options ?? {};
  return new NextRequest(new URL(url, 'http://localhost:3000'), {
    method,
    body: body ? JSON.stringify(body) : undefined,
    headers: new Headers({
      'Content-Type': 'application/json',
      ...headers,
    }),
  });
}

export function mockSupabaseClient() {
  return {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    // ... other methods
  };
}
```

**Step 3: Add tests for critical routes:**

```typescript
// app/api/search/__tests__/route.test.ts
import { GET } from '../route';
import { createMockRequest } from '../../__tests__/testUtils';

describe('GET /api/search', () => {
  it('returns validation error for invalid page size', async () => {
    const req = createMockRequest('/api/search?q=pirate&pageSize=999');
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe('validation_failed');
  });

  it('returns empty results for empty query', async () => {
    const req = createMockRequest('/api/search?q=');
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.results).toEqual([]);
  });

  // ... more tests
});
```

**Step 4: Add test coverage targets:**

```typescript
// vitest.config.mts
coverage: {
  thresholds: {
    statements: 60,
    branches: 50,
    functions: 60,
    lines: 60,
  },
},
```

#### Implementation Steps

1. Remove API exclusion from vitest.config.mts
2. Create test utilities for API route testing
3. Add tests for top 5 critical routes first
4. Gradually add tests for remaining routes
5. Set coverage thresholds and track in CI

**Estimated effort:** 1 week  
**Risk:** None (adding tests)

---

### 5. useEffect Anti-Patterns

#### Problem

Multiple components sync URL params to local state via useEffect, causing unnecessary re-renders:

```typescript
// app/components/search/SearchResults.tsx:120-130
const filterFromParams = parseFilterParam(params.get('filter'));
const [filter, setFilter] = useState<FilterType>(filterFromParams);

// ❌ Anti-pattern: derived state in effect
useEffect(() => {
  setFilter(filterFromParams);
}, [filterFromParams]);

// Same pattern repeated for:
useEffect(() => {
  setExact(exactFromParams);
}, [exactFromParams]);

useEffect(() => {
  setMinifigSort(minifigSortFromParams);
}, [minifigSortFromParams]);
```

#### Impact

- Extra re-renders on every URL change
- Potential hydration mismatches
- Harder to reason about state flow
- React DevTools shows unnecessary updates

#### Proposed Fix

**Option A: Use URL params directly (preferred):**

```typescript
// app/components/search/SearchResults.tsx

export function SearchResults() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // ✅ Derive values directly - no local state needed
  const filter = parseFilterParam(params.get('filter'));
  const exact = parseExactParam(params.get('exact'));
  const minifigSort = parseMinifigSort(params.get('mfSort'));

  // Handlers update URL directly
  const handleFilterChange = (nextFilter: FilterType) => {
    const sp = new URLSearchParams(Array.from(params.entries()));
    sp.set('filter', nextFilter);
    router.replace(`${pathname}?${sp.toString()}`);
  };

  // ... rest of component
}
```

**Option B: Controlled pattern for optimistic updates:**

```typescript
// If you need optimistic UI updates before URL navigation completes:

export function SearchResults() {
  const params = useSearchParams();
  const filterFromUrl = parseFilterParam(params.get('filter'));

  // Local state for optimistic updates only
  const [optimisticFilter, setOptimisticFilter] = useState<FilterType | null>(null);

  // Use optimistic value if set, otherwise URL value
  const filter = optimisticFilter ?? filterFromUrl;

  // Reset optimistic state when URL catches up
  // This is the ONE acceptable useEffect for this pattern
  useEffect(() => {
    if (optimisticFilter === filterFromUrl) {
      setOptimisticFilter(null);
    }
  }, [filterFromUrl, optimisticFilter]);

  const handleFilterChange = (nextFilter: FilterType) => {
    setOptimisticFilter(nextFilter);  // Instant UI update
    // URL update happens async
    router.replace(...);
  };
}
```

#### Implementation Steps

1. Identify components with this pattern (SearchResults.tsx is the main one)
2. Choose Option A or B based on UX needs
3. Remove the useEffect hooks
4. Test URL navigation still works
5. Verify no React hydration warnings

**Estimated effort:** 2-3 hours  
**Risk:** Low (need to verify navigation behavior)

---

### 6. Silent Error Swallowing

#### Problem

Many catch blocks either swallow errors completely or provide minimal logging:

```typescript
// app/api/identify/sets/route.ts - multiple instances:

} catch {
  // best-effort only; fall back to figNum/token  ❌ No logging
}

} catch {
  sets = [];  // ❌ User never knows why sets are empty
}

} catch {
  // tolerate missing metadata  ❌ How will you debug this?
}

} catch {
  // ignore BrickLink fallback failures  ❌ Is BL down? Rate limited?
}
```

**Count:** 293 catch blocks across 104 files, many with insufficient error handling.

#### Impact

- Production issues are invisible
- Can't distinguish between "no data" and "error fetching data"
- Debugging requires adding logging and redeploying
- Users see empty states with no explanation

#### Proposed Fix

**Categorize catch blocks into three types:**

**Type 1: Expected failures (keep silent but log in dev):**

```typescript
// Fallback logic where failure is acceptable
try {
  const cached = await getFromCache(key);
  if (cached) return cached;
} catch (err) {
  // Cache miss is expected - log only in dev
  if (process.env.NODE_ENV !== 'production') {
    logger.debug('cache.miss', {
      key,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
// Continue to fetch from source
```

**Type 2: Degraded experience (log warning, continue):**

```typescript
// Feature still works but quality is reduced
let enrichedData = baseData;
try {
  enrichedData = await enrichWithMetadata(baseData);
} catch (err) {
  // Log warning - we want to know this is happening
  logger.warn('enrichment.failed', {
    dataId: baseData.id,
    error: err instanceof Error ? err.message : String(err),
  });
  // Continue with un-enriched data
}
```

**Type 3: Critical failures (log error, surface to user):**

```typescript
// User action failed
try {
  await saveUserData(data);
} catch (err) {
  logger.error('user_data.save_failed', {
    userId,
    error: err instanceof Error ? err.message : String(err),
  });
  // Surface to user
  return errorResponse('save_failed', {
    message: 'Failed to save your changes. Please try again.',
  });
}
```

**Audit checklist for each catch block:**

1. Is this a critical user action? → Type 3
2. Does failure degrade the experience? → Type 2
3. Is this a cache/fallback path? → Type 1
4. Add appropriate logging for each

#### Implementation Steps

1. Run `rg "catch.*\{" app/ -A 3` to list all catch blocks
2. Categorize each into Type 1/2/3
3. Add appropriate logging
4. For Type 3, ensure error surfaces to user
5. Add monitoring alerts for error log patterns

**Estimated effort:** 4-6 hours  
**Risk:** Low (adding logging, no behavior change)

---

## 🟡 Medium Priority Issues

### 7. Duplicated Code Patterns

#### Problem

Several patterns are duplicated across multiple files:

**Pattern 1: SSR-safe origin detection (4+ files):**

```typescript
// Duplicated in SetPageClient, AccountPageClient, GroupSessionPageClient, etc.
const [origin, setOrigin] = useState('');
useEffect(() => {
  if (typeof window !== 'undefined') {
    setOrigin(window.location.origin);
  }
}, []);
```

**Pattern 2: Supabase auth state checking (6+ files):**

```typescript
// Similar patterns in multiple components
const [user, setUser] = useState<User | null>(null);
useEffect(() => {
  const supabase = getSupabaseBrowserClient();
  supabase.auth.getUser().then(({ data }) => setUser(data.user));
}, []);
```

#### Proposed Fix

**Create shared hooks:**

```typescript
// app/hooks/useOrigin.ts
'use client';

import { useState, useEffect } from 'react';

/**
 * SSR-safe hook to get window.location.origin.
 * Returns empty string on server, actual origin on client.
 */
export function useOrigin(): string {
  const [origin, setOrigin] = useState('');

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  return origin;
}
```

```typescript
// app/hooks/useCurrentUser.ts
'use client';

import { useState, useEffect } from 'react';
import { getSupabaseBrowserClient } from '@/app/lib/supabaseClient';
import type { User } from '@supabase/supabase-js';

export function useCurrentUser() {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();

    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      setIsLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  return { user, isLoading, isAuthenticated: !!user };
}
```

#### Implementation Steps

1. Create `app/hooks/useOrigin.ts`
2. Create `app/hooks/useCurrentUser.ts`
3. Replace duplicated patterns in 4+ files
4. Add to hooks barrel export if one exists

**Estimated effort:** 4-6 hours  
**Risk:** Low (refactoring)

---

### 8. Type Safety Gaps

#### Problem

25+ explicit `any` types and several unsafe casting patterns:

```typescript
// app/lib/services/inventory.ts
const external = (
  partMeta.external_ids as { BrickLink?: { ext_ids?: unknown[] } } | undefined
)?.BrickLink;
```

```typescript
// app/hooks/useInventoryViewModel.ts
// Has any type

// app/lib/brickognize.ts
// Has 2 any types
```

#### Proposed Fix

**Create proper types for external API responses:**

```typescript
// app/lib/types/rebrickable.ts
export interface RebrickablePartExternalIds {
  BrickLink?: {
    ext_ids?: (string | number)[];
    ext_descrs?: string[][];
  };
  BrickOwl?: {
    ext_ids?: string[];
  };
  Brickset?: {
    ext_ids?: string[];
  };
  LDraw?: {
    ext_ids?: string[];
  };
}

export interface RebrickablePart {
  part_num: string;
  name: string;
  part_cat_id: number;
  part_img_url: string | null;
  external_ids?: RebrickablePartExternalIds;
}
```

**Use Zod for runtime validation where needed:**

```typescript
import { z } from 'zod';

const BrickognizeResultSchema = z.object({
  id: z.string(),
  score: z.number(),
  // ... full schema
});

type BrickognizeResult = z.infer<typeof BrickognizeResultSchema>;
```

#### Implementation Steps

1. Audit all `any` usages with `rg ": any" app/`
2. Create types for external API responses
3. Replace `any` with proper types or `unknown` + guards
4. Add Zod schemas for runtime validation of external data

**Estimated effort:** 1 day  
**Risk:** Low (type changes only)

---

### 9. No Request Tracing

#### Problem

No request IDs are generated or propagated. When debugging production issues, you can't correlate logs across the request lifecycle.

#### Proposed Fix

**Add request ID middleware:**

```typescript
// middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const requestId = request.headers.get('x-request-id') ?? crypto.randomUUID();

  const response = NextResponse.next();
  response.headers.set('x-request-id', requestId);

  return response;
}
```

**Pass request ID to logger:**

```typescript
// lib/metrics.ts
import { headers } from 'next/headers';

export function getRequestId(): string | null {
  try {
    const headersList = headers();
    return headersList.get('x-request-id');
  } catch {
    return null;
  }
}

export const logger = {
  error: (event: string, data?: Record<string, unknown>) => {
    const requestId = getRequestId();
    console.error(
      JSON.stringify({
        level: 'error',
        event,
        requestId,
        ...data,
        ts: Date.now(),
      })
    );
  },
  // ... other methods
};
```

**Include in error responses:**

```typescript
// app/lib/api/responses.ts
export function errorResponse(code: AppErrorCode, options?: {...}): NextResponse {
  const requestId = getRequestId();
  return NextResponse.json(
    {
      ...toApiError(code, options?.message, options?.details),
      requestId,
    },
    { status, headers: { 'x-request-id': requestId ?? '' } }
  );
}
```

**Estimated effort:** 4-6 hours  
**Risk:** Low (additive change)

---

## Implementation Roadmap

### Phase 1: Pre-Beta (This Week)

| Task                            | Priority | Effort | Owner |
| ------------------------------- | -------- | ------ | ----- |
| Standardize API error responses | 🔴 P0    | 4-6h   | -     |
| Replace console.\* with logger  | 🔴 P0    | 4-6h   | -     |
| Fix SearchResults useEffect     | 🟠 P1    | 2-3h   | -     |

### Phase 2: Beta Week 1

| Task                                     | Priority | Effort | Owner |
| ---------------------------------------- | -------- | ------ | ----- |
| Add logging to silent catch blocks       | 🟠 P1    | 4-6h   | -     |
| Extract useOrigin + useCurrentUser hooks | 🟡 P2    | 4-6h   | -     |
| Add request ID tracing                   | 🟡 P2    | 4-6h   | -     |

### Phase 3: Beta Week 2-3

| Task                         | Priority | Effort | Owner |
| ---------------------------- | -------- | ------ | ----- |
| Split AccountPageClient.tsx  | 🔴 P0    | 2-3d   | -     |
| Split identify/sets/route.ts | 🔴 P0    | 1d     | -     |
| Add API route tests (top 5)  | 🟠 P1    | 3-4d   | -     |

### Phase 4: Post-Beta

| Task                             | Priority | Effort | Owner |
| -------------------------------- | -------- | ------ | ----- |
| Fix remaining type safety issues | 🟡 P2    | 1d     | -     |
| Complete API test coverage       | 🟠 P1    | 1w     | -     |
| Split remaining large components | 🟡 P2    | 1w     | -     |

---

## Verification Checklist

Before closing each issue:

- [ ] **Error responses**: All routes use `errorResponse()` helper
- [ ] **Logging**: Zero `console.log/info/debug` in production code
- [ ] **useEffect**: No derived-state-in-effect patterns
- [ ] **Catch blocks**: All have appropriate logging
- [ ] **Tests**: API routes included in coverage, top 5 routes tested
- [ ] **Components**: No file > 500 lines
- [ ] **Type safety**: Zero explicit `any` types
- [ ] **Tracing**: Request IDs in all error responses and logs

---

## Appendix: Commands for Auditing

```bash
# Find all console.* usages
rg "console\.(log|warn|error|info|debug)" app/ --type ts -c

# Find all catch blocks
rg "catch.*\{" app/ -A 3 --type ts

# Find explicit any types
rg ": any" app/ --type ts

# Find large files
find app/ -name "*.tsx" -o -name "*.ts" | xargs wc -l | sort -rn | head -20

# Find routes not using errorResponse
rg "NextResponse\.json\(\{ error" app/api/ -l

# Count test files vs source files
echo "Test files: $(find app/ -name "*.test.*" | wc -l)"
echo "Source files: $(find app/ -name "*.ts" -o -name "*.tsx" | grep -v test | wc -l)"
```
