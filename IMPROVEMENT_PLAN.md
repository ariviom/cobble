# Codebase Improvement Plan (Expanded)

This document provides explicit, actionable details for each improvement task with file paths, specific changes, and acceptance criteria.

## Progress Summary (Updated 2024-12-07)

| Section | Task                                 | Status                          |
| ------- | ------------------------------------ | ------------------------------- |
| A1      | Monolithic Library Files             | ✅ Completed                    |
| A2      | Duplicated Identify Logic            | ✅ Completed                    |
| A3      | Duplicated extractBricklinkPartId    | ❌ Cancelled (not needed)       |
| A4      | Inconsistent Service Layer           | ✅ Completed                    |
| B1      | Console Logging → Structured Logging | ✅ Completed                    |
| B2      | Error Handling Standardization       | ✅ Completed                    |
| B3      | Input Validation with Zod            | ✅ Completed                    |
| B4      | Type Safety - Reduce Unsafe Casts    | ⬜ In Progress                  |
| C1      | Cache Logic Consolidation            | ✅ Completed                    |
| C2      | Theme Utilities Centralization       | ✅ Completed                    |
| C3      | Supabase Client Audit                | ✅ Completed                    |
| D1-D4   | Performance Improvements             | ✅ Completed                    |
| E1-E4   | Security Hardening                   | ⏳ Partial (E1 done)            |
| F1      | Magic Numbers → Constants            | ✅ Completed                    |
| F2-F4   | Code Smells                          | ⬜ In Progress                  |
| G1-G4   | Testing Enhancements                 | ⬜ In Progress (G3 partly done) |

---

## A. Core Architectural Problems

### A1. Monolithic Library Files ✅ COMPLETED

The `rebrickable.ts` file has been refactored into `app/lib/rebrickable/` with modular subfiles:

- `types.ts` - Type definitions
- `client.ts` - HTTP client utilities
- `search.ts` - Set search functions
- `inventory.ts` - Inventory fetching
- `parts.ts` - Part resolution and queries
- `minifigs.ts` - Minifigure operations
- `themes.ts` - Theme hierarchy
- `colors.ts` - Color mapping
- `utils.ts` - Shared utilities
- `index.ts` - Public re-exports

The `catalog.ts` was previously refactored into `app/lib/catalog/`.

**Import Standardization (2024-12-07):** All imports updated to use barrel exports (`@/app/lib/catalog` and `@/app/lib/rebrickable`) instead of direct submodule imports for consistency.

---

### A2. Duplicated Identify Logic

**Files Affected:**

- `app/api/identify/route.ts` (837 lines → target ~300 lines)
- NEW: `app/lib/identify/blFallback.ts`
- NEW: `app/lib/identify/enrichment.ts`
- NEW: `app/lib/identify/types.ts`

**Specific Changes:**

1. **Extract BrickLink supersets fallback** (appears twice at lines 261-458 and 546-742):

```typescript
// NEW FILE: app/lib/identify/blFallback.ts
import 'server-only';
import {
  blGetPartSupersets,
  blGetPartColors,
  blGetPartSubsets,
  blGetPart,
  type BLSupersetItem,
} from '@/app/lib/bricklink';
import { getSetSummary } from '@/app/lib/rebrickable';
import type { ExternalCallBudget } from './types';

export type BLFallbackResult = {
  sets: Array<{
    setNumber: string;
    name: string;
    year: number;
    imageUrl: string | null;
    quantity: number;
    numParts?: number | null;
    themeId?: number | null;
    themeName?: string | null;
  }>;
  partName: string;
  partImage: string | null;
  blAvailableColors: Array<{ id: number; name: string }>;
};

export async function fetchBLSupersetsFallback(
  blId: string,
  initialImage: string | null,
  budget: ExternalCallBudget,
  options?: { colorLimit?: number; supersetLimit?: number }
): Promise<BLFallbackResult> {
  // Consolidate the duplicated BL supersets logic here
}

export async function enrichSetsWithRebrickable(
  sets: BLFallbackResult['sets'],
  limit?: number
): Promise<BLFallbackResult['sets']> {
  // Extract the RB enrichment loop (lines 407-430, 691-714)
}
```

2. **Extract available colors builder** (lines 117-154):

```typescript
// NEW FILE: app/lib/identify/enrichment.ts
export async function buildBlAvailableColors(
  blPartId: string,
  budget: ExternalCallBudget
): Promise<Array<{ id: number; name: string }>> {
  // Move from route.ts lines 117-154
}
```

3. **Simplify route handler to orchestration only**:

```typescript
// app/api/identify/route.ts - target structure
export async function POST(req: NextRequest) {
  // 1. Rate limit check (10 lines)
  // 2. Validate image (10 lines)
  // 3. Call Brickognize (5 lines)
  // 4. Resolve candidates (10 lines)
  // 5. Fetch sets - delegate to helpers (20 lines)
  // 6. Return response (5 lines)
}
```

**Acceptance Criteria:**

- [ ] Route handler < 300 lines
- [ ] No duplicated BL fallback logic
- [ ] All helpers in `app/lib/identify/` with `server-only`
- [ ] Existing tests pass (add tests if none exist)

---

### A3. Duplicated `extractBricklinkPartId` Utility

**Files Affected:**

- `app/lib/rebrickable/utils.ts` - Has implementation
- `app/lib/brickognize.ts` - Has separate implementation (lines ~180-210)

**Specific Changes:**

1. **Verify `app/lib/rebrickable/utils.ts` has the canonical version:**

```typescript
// app/lib/rebrickable/utils.ts
export function extractBricklinkPartId(
  externalIds: Record<string, unknown> | null | undefined
): string | null {
  if (!externalIds) return null;
  const blIds = (externalIds as { BrickLink?: unknown }).BrickLink;
  if (Array.isArray(blIds) && blIds.length > 0) {
    const first = blIds[0];
    return typeof first === 'string' || typeof first === 'number'
      ? String(first)
      : null;
  }
  if (blIds && typeof blIds === 'object' && 'ext_ids' in (blIds as object)) {
    const extIds = (blIds as { ext_ids?: unknown }).ext_ids;
    if (Array.isArray(extIds) && extIds.length > 0) {
      const first = extIds[0];
      return typeof first === 'string' || typeof first === 'number'
        ? String(first)
        : null;
    }
  }
  return null;
}
```

2. **Update `app/lib/brickognize.ts`:**

```typescript
// Replace local implementation with import
import { extractBricklinkPartId } from '@/app/lib/rebrickable/utils';
```

3. **Add unit tests:**

```typescript
// NEW FILE: app/lib/rebrickable/__tests__/utils.test.ts
import { extractBricklinkPartId } from '../utils';

describe('extractBricklinkPartId', () => {
  it('returns null for null input', () => {
    expect(extractBricklinkPartId(null)).toBeNull();
  });

  it('extracts from array format', () => {
    expect(extractBricklinkPartId({ BrickLink: ['3001'] })).toBe('3001');
  });

  it('extracts from ext_ids nested format', () => {
    expect(extractBricklinkPartId({ BrickLink: { ext_ids: [12345] } })).toBe(
      '12345'
    );
  });

  it('handles numeric values', () => {
    expect(extractBricklinkPartId({ BrickLink: [99999] })).toBe('99999');
  });
});
```

**Acceptance Criteria:**

- [ ] Single canonical implementation in `rebrickable/utils.ts`
- [ ] `brickognize.ts` imports from utils
- [ ] Unit tests with >90% branch coverage
- [ ] `npm run build` passes

---

### A4. Inconsistent Service Layer

**Current State:**

- Some orchestration in `app/lib/services/` (good: `inventory.ts`, `search.ts`)
- Some orchestration in route handlers (bad: `identify/route.ts`)
- Data access mixed with business logic

**Files Affected:**

- `app/lib/services/` - Expand with new services
- NEW: `app/lib/services/identify.ts`
- NEW: `app/lib/services/pricing.ts`

**Specific Changes:**

1. **Create identify service:**

```typescript
// NEW FILE: app/lib/services/identify.ts
import 'server-only';
import {
  identifyWithBrickognize,
  extractCandidatePartNumbers,
} from '@/app/lib/brickognize';
import {
  resolvePartIdToRebrickable,
  getPartColorsForPart,
  getSetsForPart,
} from '@/app/lib/rebrickable';
import { fetchBLSupersetsFallback } from '@/app/lib/identify/blFallback';

export type IdentifyResult = {
  part: {
    partNum: string;
    name: string;
    imageUrl: string | null;
    confidence: number;
  };
  candidates: Array<{ partNum: string; name: string; confidence: number }>;
  availableColors: Array<{ id: number; name: string }>;
  selectedColorId: number | null;
  sets: Array<{
    setNumber: string;
    name: string;
    year: number;
    imageUrl: string | null;
  }>;
  blPartId?: string;
  blAvailableColors?: Array<{ id: number; name: string }>;
};

export async function identifyPartFromImage(
  imageBlob: Blob,
  options?: { colorHint?: number }
): Promise<IdentifyResult> {
  // Move business logic from route.ts here
}
```

2. **Document the pattern in system-patterns.md:**

```markdown
## Service Layer Pattern

- **Route handlers** (`app/api/`): HTTP concerns only - validation, auth, response formatting
- **Services** (`app/lib/services/`): Business logic orchestration, no HTTP awareness
- **Data access** (`app/lib/catalog/`, `app/lib/rebrickable/`): External API/DB calls
- **Domain** (`app/lib/domain/`): Shared types and error definitions
```

**Acceptance Criteria:**

- [ ] All business logic in services, not routes
- [ ] Route handlers < 100 lines each
- [ ] Services have no `NextRequest`/`NextResponse` imports
- [ ] Pattern documented in `memory/system-patterns.md`

---

## B. Violations of Best Practices

### B1. Console Logging → Structured Logging ✅ COMPLETED

**Status:** Logger infrastructure exists in `lib/metrics.ts`. All known `console.log` usages have been replaced with `logger.{level}` (or removed), lint enforces no-console (warn/error only), and production strips console output.

**Files Affected:**

- `lib/metrics.ts` - Enhance
- All files using `console.log` for events

**Specific Changes:**

1. **Enhance `lib/metrics.ts`:**

```typescript
// lib/metrics.ts
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogPayload = {
  level: LogLevel;
  event: string;
  data?: Record<string, unknown>;
  timestamp: string;
  requestId?: string;
};

export function log(
  level: LogLevel,
  event: string,
  data?: Record<string, unknown>
): void {
  const payload: LogPayload = {
    level,
    event,
    data,
    timestamp: new Date().toISOString(),
  };

  if (process.env.NODE_ENV === 'production') {
    // JSON format for log aggregation
    console.log(JSON.stringify(payload));
  } else {
    // Human-readable format for development
    console.log(`[${level.toUpperCase()}] ${event}`, data ?? '');
  }
}

export const logger = {
  debug: (event: string, data?: Record<string, unknown>) =>
    log('debug', event, data),
  info: (event: string, data?: Record<string, unknown>) =>
    log('info', event, data),
  warn: (event: string, data?: Record<string, unknown>) =>
    log('warn', event, data),
  error: (event: string, data?: Record<string, unknown>) =>
    log('error', event, data),
};
```

2. **Replace `console.log` calls:**

```typescript
// Before (app/api/identify/route.ts line 197)
console.log('identify: brickognize payload', { listing_id, items_len });

// After
logger.debug('identify.brickognize_payload', { listing_id, items_len });
```

**Files to Update:**

- `app/api/identify/route.ts` (~15 console.log calls)
- `app/lib/bricklink.ts` (~10 console.log calls)
- `app/api/inventory/route.ts` (2 console.warn calls)
- `app/api/search/route.ts` (1 console.log call)

**Acceptance Criteria:**

- [x] Logger infrastructure exists with `logger.{level}` pattern
- [x] Zero raw `console.log` in production code paths (lint enforced)
- [x] JSON format in production, human-readable in dev
- [x] Lint rule added: `no-console` with exceptions for `lib/metrics.ts`

**Completed Updates:**

- `app/api/inventory/route.ts`
- `app/api/search/route.ts`
- `app/api/search/minifigs/route.ts`
- `app/api/themes/route.ts`
- `app/api/colors/route.ts`
- `app/api/parts/bricklink/route.ts`
- `app/lib/services/inventory.ts`
- `app/lib/services/search.ts`

---

### B2. Error Handling Standardization ⏳ IN PROGRESS

**Status:** `errorResponse()` helper exists in `app/lib/api/responses.ts`. Most API routes now use it.

**Files Affected:**

- `app/lib/domain/errors.ts` - Enhance
- All API routes

**Specific Changes:**

1. **Expand error codes in `app/lib/domain/errors.ts`:**

```typescript
// app/lib/domain/errors.ts
export type AppErrorCode =
  // Validation errors (4xx)
  | 'validation_failed'
  | 'missing_required_field'
  | 'invalid_format'
  // Auth errors
  | 'unauthorized'
  | 'forbidden'
  // Rate limiting
  | 'rate_limited'
  | 'budget_exceeded'
  // Resource errors
  | 'not_found'
  | 'no_match'
  | 'no_valid_candidate'
  // External service errors
  | 'external_service_error'
  | 'brickognize_failed'
  | 'rebrickable_failed'
  | 'bricklink_circuit_open'
  // Internal errors
  | 'internal_error'
  | 'search_failed'
  | 'inventory_failed'
  | 'identify_failed'
  | (string & {});

export type ApiErrorResponse = {
  error: AppErrorCode;
  message: string;
  details?: Record<string, unknown>;
  requestId?: string;
};

export function toApiError(
  code: AppErrorCode,
  message?: string,
  details?: Record<string, unknown>
): ApiErrorResponse {
  return {
    error: code,
    message: message ?? code.replace(/_/g, ' '),
    ...(details && { details }),
  };
}
```

2. **Create error response helper:**

```typescript
// NEW FILE: app/lib/api/responses.ts
import { NextResponse } from 'next/server';
import { toApiError, type AppErrorCode } from '@/app/lib/domain/errors';
import { logger } from '@/lib/metrics';

const HTTP_STATUS: Partial<Record<AppErrorCode, number>> = {
  validation_failed: 400,
  missing_required_field: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  rate_limited: 429,
  budget_exceeded: 429,
  internal_error: 500,
};

export function errorResponse(
  code: AppErrorCode,
  options?: {
    message?: string;
    status?: number;
    details?: Record<string, unknown>;
  }
): NextResponse {
  const status = options?.status ?? HTTP_STATUS[code] ?? 500;
  logger.warn('api.error_response', { code, status });
  return NextResponse.json(
    toApiError(code, options?.message, options?.details),
    { status }
  );
}
```

3. **Update route handlers:**

```typescript
// Before (app/api/identify/route.ts)
return NextResponse.json({ error: 'no_match' });

// After
return errorResponse('no_match', {
  message: 'No matching parts found in image',
});
```

**Acceptance Criteria:**

- [x] `errorResponse()` helper created in `app/lib/api/responses.ts`
- [x] Consistent `{ error, message, details? }` shape
- [x] Error codes documented in `app/lib/domain/errors.ts`
- [x] HTTP status codes mapped correctly
- [ ] All API errors use `errorResponse()` helper (most routes updated)

**Completed Updates:**

- `app/api/inventory/route.ts`
- `app/api/search/route.ts`
- `app/api/search/minifigs/route.ts`
- `app/api/themes/route.ts`
- `app/api/colors/route.ts`
- `app/api/parts/bricklink/route.ts`
- `app/api/identify/route.ts`

---

### B3. Input Validation with Zod

**Current State:** All API routes now use Zod + `errorResponse` for validation errors.

**Specific Changes:**

**Updated Routes:** identify, group-sessions (create/join/end), prices (bricklink, bricklink-set), user-sets, user/minifigs, user/minifigs/sync-from-sets — all use Zod + `errorResponse` for validation/authorization errors.

**Acceptance Criteria:**

- [x] All routes use Zod for request validation
- [x] Validation errors return `validation_failed` code
- [x] Error details include Zod issues
- [x] No manual `if (!field)` validation logic

---

### B4. Type Safety - Reduce Unsafe Casts

**Files Affected:**

- `app/lib/bricklink.ts` - Multiple `as` casts
- `app/api/identify/route.ts` - Multiple `as` casts

**Specific Changes:**

1. **Replace unsafe casts with type guards:**

```typescript
// NEW FILE: app/lib/domain/guards.ts
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function hasProperty<K extends string>(
  obj: unknown,
  key: K
): obj is Record<K, unknown> {
  return isRecord(obj) && key in obj;
}

export function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(v => typeof v === 'string');
}
```

2. **Example refactor in `bricklink.ts`:**

```typescript
// Before (line 390-414)
const record = group as { item?: ItemLike; quantity?: unknown } & ItemLike;

// After
if (!hasProperty(group, 'item') && !hasProperty(group, 'no')) continue;
const item = hasProperty(group, 'item') ? group.item : group;
const setNumber =
  hasProperty(item, 'no') && typeof item.no === 'string' ? item.no : '';
```

**Acceptance Criteria:**

- [ ] Type guards in `app/lib/domain/guards.ts`
- [ ] Unsafe `as` casts reduced by 80%
- [ ] No `@ts-expect-error` comments except for genuine framework gaps
- [ ] `strict: true` in `tsconfig.json` (if not already)

---

## C. Deduplication & Abstraction

### C1. Cache Logic Consolidation ✅ COMPLETED

**Status:** Migrated `app/lib/bricklink.ts` to use the existing `LRUCache` from `app/lib/cache/lru.ts`. Removed ~30 lines of manual cache helper code.

**Previous State:**

- `app/lib/bricklink.ts` - Manual `Map<string, CacheEntry>` with TTL
- `app/lib/rebrickable/` modules - Uses `lru-cache` package

**Specific Changes:**

1. **Create unified cache utility:**

```typescript
// NEW FILE: app/lib/cache/index.ts
import 'server-only';
import { LRUCache } from 'lru-cache';
import { logger } from '@/lib/metrics';

export type CacheOptions<V> = {
  name: string;
  max?: number;
  ttlMs?: number;
  onHit?: (key: string, value: V) => void;
  onMiss?: (key: string) => void;
};

export function createCache<V>(options: CacheOptions<V>) {
  const { name, max = 500, ttlMs = 3600000 } = options;

  const cache = new LRUCache<string, V>({
    max,
    ttl: ttlMs,
  });

  return {
    get(key: string): V | undefined {
      const value = cache.get(key);
      if (value !== undefined) {
        logger.debug(`cache.hit`, { cache: name, key });
        options.onHit?.(key, value);
      } else {
        logger.debug(`cache.miss`, { cache: name, key });
        options.onMiss?.(key);
      }
      return value;
    },

    set(key: string, value: V, ttl?: number): void {
      cache.set(key, value, { ttl: ttl ?? ttlMs });
    },

    has(key: string): boolean {
      return cache.has(key);
    },

    delete(key: string): void {
      cache.delete(key);
    },

    clear(): void {
      cache.clear();
    },

    stats() {
      return { size: cache.size, max };
    },
  };
}
```

2. **Migrate `bricklink.ts` caches:**

```typescript
// Before
const subsetsCache = new Map<string, CacheEntry<BLSubsetItem[]>>();

// After
import { createCache } from '@/app/lib/cache';
const subsetsCache = createCache<BLSubsetItem[]>({
  name: 'bl_subsets',
  ttlMs: ONE_HOUR_MS,
});
```

**Acceptance Criteria:**

- [x] LRU cache implementation exists in `app/lib/cache/lru.ts` with tests
- [x] `bricklink.ts` caches migrated to use `LRUCache` class
- [x] Uses centralized TTL values from `app/lib/constants.ts`
- [x] Manual `cacheGet`/`cacheSet` helper code removed
- [ ] Cache metrics logged (hit/miss rates) - optional enhancement

---

### C2. Theme Utilities Centralization

**Files Affected:**

- Various files computing theme paths ad-hoc
- NEW: `app/lib/themes/index.ts`

**Specific Changes:**

```typescript
// NEW FILE: app/lib/themes/index.ts
import { getThemes, type RebrickableTheme } from '@/app/lib/rebrickable';

let themesCache: Map<number, RebrickableTheme> | null = null;

async function ensureThemesLoaded(): Promise<Map<number, RebrickableTheme>> {
  if (!themesCache) {
    const themes = await getThemes();
    themesCache = new Map(themes.map(t => [t.id, t]));
  }
  return themesCache;
}

export async function getThemePath(themeId: number): Promise<string> {
  const map = await ensureThemesLoaded();
  const parts: string[] = [];
  let current = map.get(themeId);

  while (current) {
    parts.unshift(current.name);
    current = current.parent_id ? map.get(current.parent_id) : undefined;
  }

  return parts.join(' > ');
}

export async function getRootTheme(
  themeId: number
): Promise<RebrickableTheme | null> {
  const map = await ensureThemesLoaded();
  let current = map.get(themeId);

  while (current?.parent_id) {
    current = map.get(current.parent_id);
  }

  return current ?? null;
}
```

**Acceptance Criteria:**

- [ ] Single source of truth for theme resolution
- [ ] Theme path computation centralized
- [ ] Cached after first load

---

### C3. Supabase Client Audit

**Current State:**

- `app/lib/db/catalogAccess.ts` - Provides `getCatalogReadClient()`
- Some files may import Supabase directly

**Specific Changes:**

1. **Audit all Supabase imports:**

```bash
# Find direct supabase imports outside catalogAccess
grep -r "from '@supabase" --include="*.ts" --include="*.tsx" | grep -v catalogAccess
```

2. **Enforce pattern:**

```typescript
// CORRECT - use accessor
import { getCatalogReadClient } from '@/app/lib/db/catalogAccess';

// INCORRECT - direct import
import { createClient } from '@supabase/supabase-js';
```

3. **Add ESLint rule:** ✅ Added in `eslint.config.mjs` to forbid `createClient` imports from `@supabase/supabase-js` (except the intentional service-role client wrapper).

**Acceptance Criteria:**

- [x] No direct `createClient` calls outside designated client wrappers (`supabaseServerClient`, `supabaseServiceRoleClient`)
- [x] ESLint rule enforces pattern (configured in `eslint.config.mjs`)
- [x] All DB access goes through accessor functions or approved wrappers

---

## D. Performance Improvements

### D1. Inventory View Model Optimization

**File:** `app/hooks/useInventoryViewModel.ts`

**Current Issues:**

- 6 separate `useMemo` calls iterating over rows
- Some computations could be combined

**Specific Changes:**

1. **Consolidate memos that iterate rows:**

```typescript
// Combine sizeByIndex, categoryByIndex, parentByIndex into single pass
const {
  sizeByIndex,
  categoryByIndex,
  parentByIndex,
  colorOptions,
  subcategoriesByParent,
} = useMemo(() => {
  const size: number[] = [];
  const category: Array<string | null> = [];
  const parent: string[] = [];
  const colors = new Set<string>();
  const subMap = new Map<string, Set<string>>();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    size.push(parseStudAreaFromName(row.partName) ?? -1);

    const cat =
      row.partCategoryName ?? deriveCategory(row.partName) ?? 'Uncategorized';
    category.push(cat);

    const par = row.parentCategory ?? 'Misc';
    parent.push(par);

    colors.add(row.colorName);

    if (!subMap.has(par)) subMap.set(par, new Set());
    subMap.get(par)!.add(cat);
  }

  return {
    sizeByIndex: size,
    categoryByIndex: category,
    parentByIndex: parent,
    colorOptions: Array.from(colors).sort(),
    subcategoriesByParent: Object.fromEntries(
      [...subMap.entries()].map(([k, v]) => [k, Array.from(v).sort()])
    ),
  };
}, [rows]);
```

2. **Consider virtualization for large sets (>500 parts):**

```typescript
// In InventoryTable.tsx, conditionally use react-window
import { FixedSizeList as List } from 'react-window';

{sortedIndices.length > 500 ? (
  <List
    height={600}
    itemCount={sortedIndices.length}
    itemSize={80}
  >
    {({ index, style }) => (
      <InventoryRow
        style={style}
        row={rows[sortedIndices[index]!]}
      />
    )}
  </List>
) : (
  // Regular grid rendering
)}
```

**Acceptance Criteria:**

- [ ] Single-pass computation for row-derived data
- [ ] Virtualization for inventories > 500 items
- [ ] Measurable improvement in React DevTools Profiler

---

### D2. Request Deduplication ✅ COMPLETED

**Files Affected:**

- `app/lib/catalog/sets.ts`
- `app/lib/rebrickable/parts.ts`

**Specific Changes:**

```typescript
// NEW FILE: app/lib/utils/dedup.ts
const inFlightRequests = new Map<string, Promise<unknown>>();

export function dedup<T>(key: string, factory: () => Promise<T>): Promise<T> {
  const existing = inFlightRequests.get(key);
  if (existing) return existing as Promise<T>;

  const promise = factory().finally(() => {
    inFlightRequests.delete(key);
  });

  inFlightRequests.set(key, promise);
  return promise;
}
```

**Usage:**

```typescript
// app/lib/catalog/sets.ts
import { dedup } from '@/app/lib/utils/dedup';

export async function getSetSummaryLocal(setNumber: string) {
  return dedup(`set-summary:${setNumber}`, async () => {
    // existing implementation
  });
}
```

**Acceptance Criteria:**

- [x] Concurrent requests for same resource share single fetch (dedup applied to Rebrickable parts, part colors, parts→sets, catalog set summary/search)
- [x] No duplicate API calls visible in network tab
- [x] Promise cleanup on completion

---

### D3. IndexedDB Query Optimization

**File:** `app/lib/localDb/` usage sites

**Specific Changes:**

1. **Use compound indexes:**

```typescript
// Before - JS filter
const parts = await db.catalogSetParts
  .where('setNumber')
  .equals(setNum)
  .toArray();
const filtered = parts.filter(p => p.colorId === colorId);

// After - compound index lookup
const parts = await db.catalogSetParts
  .where('[setNumber+colorId]')
  .equals([setNum, colorId])
  .toArray();
```

2. **Add missing indexes to schema:**

```typescript
// app/lib/localDb/schema.ts
catalogSetParts: '++id, setNumber, partNum, colorId, inventoryKey, [setNumber+inventoryKey], [setNumber+colorId]',
```

**Acceptance Criteria:**

- [ ] Compound indexes for common query patterns
- [ ] No post-query JS filtering on indexed fields
- [ ] Schema version bump with migration

---

### D4. Inventory Prefetching

**Files Affected:**

- `app/sets/id/[setNumber]/page.tsx`

**Specific Changes:**

```typescript
// Parallel data fetching in page component
export default async function SetPage({ params }: { params: { setNumber: string } }) {
  // Prefetch both in parallel
  const [summary, inventory] = await Promise.all([
    getSetSummary(params.setNumber),
    getSetInventoryRowsWithMeta(params.setNumber),
  ]);

  return (
    <SetPageClient
      initialSummary={summary}
      initialInventory={inventory}
    />
  );
}
```

**Acceptance Criteria:**

- [ ] Inventory data arrives with initial page load
- [ ] No waterfall requests visible in network tab
- [ ] Client hydrates with pre-fetched data

---

## E. Security Hardening

### E1. Distributed Rate Limiting

**Status:** Completed via Supabase migration `20251207213335_create_rate_limit_table.sql`.

**Previous State:** In-memory `Map` in `lib/rateLimit.ts` - didn't scale across workers/replicas.
**Current Implementation:** Supabase-backed buckets via `consume_rate_limit` RPC and RLS-enabled `rate_limits` table.

**Specific Changes:**

1. **Create Supabase migration:**

```sql
-- Migration: create_rate_limit_table
CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0,
  window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  window_ms INTEGER NOT NULL DEFAULT 60000
);

CREATE INDEX idx_rate_limits_window ON rate_limits (window_start);

-- Function to consume rate limit atomically
CREATE OR REPLACE FUNCTION consume_rate_limit(
  p_key TEXT,
  p_max_hits INTEGER DEFAULT 60,
  p_window_ms INTEGER DEFAULT 60000
) RETURNS TABLE (allowed BOOLEAN, retry_after_seconds INTEGER) AS $$
DECLARE
  v_now TIMESTAMPTZ := NOW();
  v_window_start TIMESTAMPTZ;
  v_count INTEGER;
BEGIN
  -- Upsert with window reset logic
  INSERT INTO rate_limits (key, count, window_start, window_ms)
  VALUES (p_key, 1, v_now, p_window_ms)
  ON CONFLICT (key) DO UPDATE SET
    count = CASE
      WHEN rate_limits.window_start + (rate_limits.window_ms || ' milliseconds')::INTERVAL < v_now
      THEN 1
      ELSE rate_limits.count + 1
    END,
    window_start = CASE
      WHEN rate_limits.window_start + (rate_limits.window_ms || ' milliseconds')::INTERVAL < v_now
      THEN v_now
      ELSE rate_limits.window_start
    END
  RETURNING count, window_start INTO v_count, v_window_start;

  IF v_count > p_max_hits THEN
    RETURN QUERY SELECT
      FALSE::BOOLEAN,
      GREATEST(1, EXTRACT(EPOCH FROM (v_window_start + (p_window_ms || ' milliseconds')::INTERVAL - v_now))::INTEGER);
  ELSE
    RETURN QUERY SELECT TRUE::BOOLEAN, 0::INTEGER;
  END IF;
END;
$$ LANGUAGE plpgsql;
```

2. **Update `lib/rateLimit.ts`:**

```typescript
// lib/rateLimit.ts
import { getCatalogReadClient } from '@/app/lib/db/catalogAccess';

export async function consumeRateLimit(
  key: string,
  opts?: { windowMs?: number; maxHits?: number }
): Promise<RateLimitResult> {
  const windowMs = opts?.windowMs ?? 60_000;
  const maxHits = opts?.maxHits ?? 60;

  try {
    const supabase = getCatalogReadClient();
    const { data, error } = await supabase.rpc('consume_rate_limit', {
      p_key: key,
      p_max_hits: maxHits,
      p_window_ms: windowMs,
    });

    if (error) throw error;

    return {
      allowed: data[0].allowed,
      retryAfterSeconds: data[0].retry_after_seconds,
    };
  } catch (err) {
    // Fallback to in-memory on Supabase failure
    logger.warn('rate_limit.supabase_fallback', { key, error: String(err) });
    return consumeRateLimitInMemory(key, opts);
  }
}
```

**Acceptance Criteria:**

- [ ] Rate limit state persisted in Supabase
- [ ] Atomic increment with window reset
- [ ] Fallback to in-memory on DB failure
- [ ] Works across multiple server instances

---

### E2. CSRF Protection ✅ COMPLETED

**Specific Changes:**

1. **Add origin validation middleware:**

```typescript
// NEW FILE: app/lib/middleware/csrf.ts
import { NextRequest, NextResponse } from 'next/server';

const ALLOWED_ORIGINS = [
  process.env.NEXT_PUBLIC_APP_URL,
  'http://localhost:3000',
].filter(Boolean);

export function validateOrigin(req: NextRequest): boolean {
  const origin = req.headers.get('origin');
  const referer = req.headers.get('referer');

  // Allow same-origin requests (no origin header)
  if (!origin && !referer) return true;

  const checkOrigin = origin ?? new URL(referer!).origin;
  return ALLOWED_ORIGINS.some(allowed => checkOrigin === allowed);
}

export function withCsrfProtection(
  handler: (req: NextRequest) => Promise<NextResponse>
) {
  return async (req: NextRequest) => {
    if (req.method !== 'GET' && !validateOrigin(req)) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
    return handler(req);
  };
}
```

2. **Apply to state-changing routes:**

```typescript
// app/api/identify/route.ts
import { withCsrfProtection } from '@/app/lib/middleware/csrf';

export const POST = withCsrfProtection(async (req: NextRequest) => {
  // ...
});
```

**Acceptance Criteria:**

- [x] All POST/PUT/DELETE routes validate origin (CSRF wrapper applied to identify, prices, group-sessions, sync, user/minifigs sync-from-sets)
- [x] Cross-origin requests rejected with 403
- [x] Same-origin requests (no header) allowed

---

### E3. Server-Only Boundaries

**Audit Checklist:**

Files that MUST have `import 'server-only'`:

- [ ] `app/lib/bricklink.ts` ✅
- [ ] `app/lib/catalog/*.ts`
- [ ] `app/lib/rebrickable/*.ts` (except types.ts)
- [ ] `app/lib/db/catalogAccess.ts`
- [ ] `lib/rateLimit.ts`

**Acceptance Criteria:**

- [ ] All server-side modules import `server-only`
- [ ] Build fails if client code imports server modules
- [ ] Types-only modules excluded from check

---

### E4. Search Input Sanitization

**File:** `app/lib/services/search.ts`

**Specific Changes:**

```typescript
// app/lib/services/search.ts
const MAX_QUERY_LENGTH = 200;
const SPECIAL_CHARS = /[%_\\]/g;

function sanitizeSearchQuery(query: string): string {
  return query
    .slice(0, MAX_QUERY_LENGTH)
    .replace(SPECIAL_CHARS, char => `\\${char}`)
    .trim();
}

export async function searchSetsPage(params: SearchParams) {
  const sanitizedQuery = sanitizeSearchQuery(params.query);
  // Use sanitizedQuery in SQL/API calls
}
```

**Acceptance Criteria:**

- [x] Query length limited to 200 chars
- [x] SQL wildcards escaped (`%`, `_`)
- [x] No SQL injection vectors

---

## F. Code Smells

### F1. Magic Numbers → Constants ✅ COMPLETED

**Status:** Created `app/lib/constants.ts` with centralized constants. Updated `app/api/identify/route.ts` and `app/lib/bricklink.ts` to use them.

**Files Affected:** Multiple

**Specific Changes:**

```typescript
// NEW FILE: app/lib/constants.ts
export const API = {
  RATE_LIMIT: {
    WINDOW_MS: 60_000,
    MAX_HITS: 60,
    IDENTIFY_MAX: 12,
  },
  TIMEOUT_MS: {
    DEFAULT: 30_000,
    BRICKLINK: 30_000,
  },
  PAGINATION: {
    DEFAULT_PAGE_SIZE: 20,
    MAX_PAGE_SIZE: 100,
  },
} as const;

export const IMAGE = {
  MAX_SIZE_BYTES: 5 * 1024 * 1024,
  ALLOWED_TYPES: [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
  ] as const,
} as const;

export const CACHE = {
  TTL_MS: {
    DEFAULT: 3600_000,
    PRICE_GUIDE: 1800_000,
  },
  MAX_ENTRIES: 500,
} as const;

export const EXTERNAL = {
  BL_COLOR_VARIANT_LIMIT: 5,
  BL_SUPERSET_TOTAL_LIMIT: 40,
  EXTERNAL_CALL_BUDGET: 40,
  ENRICH_LIMIT: 30,
} as const;
```

**Migration:**

```typescript
// Before
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

// After
import { IMAGE } from '@/app/lib/constants';
// Use IMAGE.MAX_SIZE_BYTES
```

**Acceptance Criteria:**

- [x] Constants file created at `app/lib/constants.ts`
- [x] Constants grouped by domain (`RATE_LIMIT`, `IMAGE`, `CACHE`, `EXTERNAL`, etc.)
- [x] `app/api/identify/route.ts` updated to use constants
- [x] `app/lib/bricklink.ts` updated to use `CACHE` constants
- [ ] Remaining files with magic numbers (future cleanup)

---

### F2. Null Handling Standardization

**Rules:**

- `null` = intentional absence (API returned null)
- `undefined` = not yet loaded / optional
- Never mix in same field

**Add ESLint rule:**

```javascript
// .eslintrc.js
{
  rules: {
    '@typescript-eslint/prefer-nullish-coalescing': 'error',
    '@typescript-eslint/no-unnecessary-condition': 'warn',
  },
}
```

**Acceptance Criteria:**

- [ ] Documented convention in `memory/system-patterns.md`
- [ ] ESLint rules enforce consistency
- [ ] Type definitions use correct nullability

---

### F3. Long Functions → Smaller Helpers

**Target:** No function > 100 LOC

**Files to Refactor:**

- `app/api/identify/route.ts` POST handler (~650 lines)
- `app/lib/bricklink.ts` `fetchPriceGuide` (~120 lines)

**Approach:**

1. Extract logical blocks to named helpers
2. Keep helpers in same file if private
3. Move to separate file if reusable

**Acceptance Criteria:**

- [ ] No function > 100 lines
- [ ] Each function does one thing
- [ ] Helper functions have clear names

---

### F4. Unused Exports Audit

**Tools:**

- Run: `npx ts-prune` to find unused exports
- Review and remove dead code

**Acceptance Criteria:**

- [ ] No unused exports
- [ ] No commented-out code blocks
- [ ] Import cleanup complete

---

## G. Testing Enhancements

### G1. API Route Tests

**NEW FILES:**

- `app/api/identify/__tests__/route.test.ts`
- `app/api/inventory/__tests__/route.test.ts`
- `app/api/search/__tests__/route.test.ts`

**Example:**

```typescript
// app/api/identify/__tests__/route.test.ts
import { POST } from '../route';
import { NextRequest } from 'next/server';

describe('POST /api/identify', () => {
  it('returns 400 for missing image', async () => {
    const form = new FormData();
    const req = new NextRequest('http://localhost/api/identify', {
      method: 'POST',
      body: form,
    });

    const res = await POST(req);
    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json.error).toBe('validation_failed');
  });

  it('returns 429 when rate limited', async () => {
    // Mock rate limiter to return limited
    // ...
  });

  it('returns identified part on success', async () => {
    // Mock brickognize and rebrickable
    // ...
  });
});
```

**Acceptance Criteria:**

- [ ] > 80% branch coverage on API routes
- [ ] Tests for validation, auth, success, and error paths
- [ ] Mocks for external services

---

### G2. Integration Tests

**NEW FILES:**

- `app/hooks/__tests__/useInventory.integration.test.tsx`
- `app/components/set/__tests__/SetPageClient.integration.test.tsx`

**Example:**

```typescript
// app/hooks/__tests__/useInventory.integration.test.tsx
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useInventory } from '../useInventory';

describe('useInventory integration', () => {
  it('fetches and transforms inventory data', async () => {
    const queryClient = new QueryClient();

    const { result } = renderHook(() => useInventory('75192-1'), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      ),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.rows.length).toBeGreaterThan(0);
    expect(result.current.keys.length).toBe(result.current.rows.length);
  });
});
```

**Acceptance Criteria:**

- [ ] Integration tests cover API → hooks → components
- [ ] React Testing Library for component tests
- [ ] MSW for API mocking in integration tests

---

### G3. CSV Export Tests

**Files:**

- `app/lib/__tests__/csvExport.test.ts`

**Specific Tests:**

```typescript
describe('CSV export', () => {
  it('escapes quotes in part names', () => {
    // Part name: 'Brick 2x4 "Special"'
    // Expected: '"Brick 2x4 ""Special"""'
  });

  it('handles unicode characters', () => {
    // Part name with ñ, ü, etc.
  });

  it('produces valid CSV per RFC 4180', () => {
    // Property-based test with random data
  });
});
```

**Acceptance Criteria:**

- [ ] Edge cases: quotes, commas, newlines, unicode
- [ ] Output validates against RFC 4180
- [ ] Property-based tests for robustness

---

### G4. E2E Tests (Deferred)

Skipped per user request. Consider adding later with Playwright for:

- Search flow
- Set detail view
- Identify flow

---

## H. Refactor Roadmap (Prioritized)

| Phase | Tasks                                                                                     | Risk   | Effort | Dependencies       | Status        |
| ----- | ----------------------------------------------------------------------------------------- | ------ | ------ | ------------------ | ------------- |
| 1     | E1 Distributed rate limiting                                                              | High   | Medium | Supabase migration | ✅ Done       |
| 2     | B2 Error response standardization                                                         | Medium | Low    | None               | ✅ Done       |
| 3     | B3 Zod validation on all routes                                                           | Medium | Low    | None               | ✅ Done       |
| 4     | G1 API route tests (>80% branch)                                                          | Medium | Medium | B2, B3             | ⬜            |
| 5     | A2 Identify refactor; ~~A3 Utility dedupe~~; ~~C1 Cache~~; F3 Function splits; B1 Logging | Medium | High   | G1                 | ⏳ C1 done    |
| 6     | A4 Service layer; C2 Theme utils; C3 Supabase client audit                                | Low    | Medium | A2                 | ⬜            |
| 7     | D1 Inventory perf; D2 Request dedupe; D3 IndexedDB optimizations; D4 Prefetching          | Low    | Medium | None               | ⏳ D2 partial |
| 8     | G2 Integration tests; G3 CSV tests; ~~F1 Constants~~; F2 Null handling                    | Low    | Medium | G1                 | ⏳ F1 done    |

---

## Acceptance Criteria Summary

Before marking the improvement plan complete:

- [x] Constants file created and in use
- [x] Cache logic consolidated using LRUCache
- [x] Error response helper exists and widely used
- [x] All API routes use Zod validation
- [x] API error response helper exists and widely used
- [x] Rate limiting works across multiple server instances
- [ ] No console.log in production code paths (partial - several routes converted)
- [ ] > 80% test coverage on API routes
- [ ] No function > 100 lines
- [x] Build passes: `npm run build`
- [x] Types pass: `npm run type-check`
- [x] Lint passes: `npm run lint`
