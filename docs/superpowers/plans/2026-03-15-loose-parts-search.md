# Loose Parts Search & Increment Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add part search to the search route, enable loose part quantity management via a generalized part modal on search and identify routes, and fix minifig theme label positioning.

**Architecture:** Extends the existing search infrastructure with a new `'part'` search type backed by catalog `rb_parts` queries. The existing `CollectionPartModal` is generalized to accept flexible props (with color picker) so it can be reused from search, identify, and collection contexts. All loose part persistence uses the existing `localLooseParts` IndexedDB table and sync queue.

**Tech Stack:** Next.js, Supabase (PostgREST), Dexie/IndexedDB, TanStack Query, Zustand, Tailwind CSS v4, Vitest

**Spec:** `docs/superpowers/specs/2026-03-15-loose-parts-search-design.md`

---

## Chunk 1: Foundation — Types, Store, and Page Size Standardization

### Task 1: Add `getLoosePart` to loosePartsStore

**Files:**

- Modify: `app/lib/localDb/loosePartsStore.ts`
- Test: `app/lib/localDb/__tests__/loosePartsStore.test.ts`

- [ ] **Step 1: Write the failing test**

Create `app/lib/localDb/__tests__/loosePartsStore.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mock schema module
const mockFirst = vi.fn();
const mockEquals = vi.fn(() => ({ first: mockFirst }));
const mockWhere = vi.fn(() => ({ equals: mockEquals }));
const mockDb = { localLooseParts: { where: mockWhere } };

vi.mock('../schema', () => ({
  getLocalDb: () => mockDb,
  isIndexedDBAvailable: vi.fn(() => true),
}));

import { getLoosePart } from '../loosePartsStore';
import { isIndexedDBAvailable } from '../schema';

describe('getLoosePart', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the loose part for a given partNum and colorId', async () => {
    const mockPart = {
      partNum: '3001',
      colorId: 11,
      quantity: 5,
      updatedAt: 1000,
    };
    mockFirst.mockResolvedValue(mockPart);

    const result = await getLoosePart('3001', 11);

    expect(mockWhere).toHaveBeenCalledWith('[partNum+colorId]');
    expect(mockEquals).toHaveBeenCalledWith(['3001', 11]);
    expect(result).toEqual(mockPart);
  });

  it('returns undefined when no entry exists', async () => {
    mockFirst.mockResolvedValue(undefined);

    const result = await getLoosePart('9999', 0);
    expect(result).toBeUndefined();
  });

  it('returns undefined when IndexedDB is unavailable', async () => {
    vi.mocked(isIndexedDBAvailable).mockReturnValue(false);

    const result = await getLoosePart('3001', 11);
    expect(result).toBeUndefined();
    expect(mockWhere).not.toHaveBeenCalled();
  });

  it('returns undefined and warns on error', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockFirst.mockRejectedValue(new Error('DB error'));

    const result = await getLoosePart('3001', 11);
    expect(result).toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run app/lib/localDb/__tests__/loosePartsStore.test.ts`
Expected: FAIL — `getLoosePart` is not exported

- [ ] **Step 3: Implement `getLoosePart`**

Add to `app/lib/localDb/loosePartsStore.ts` after the `getLoosePartsCount` function (after line 61):

```ts
/**
 * Get a single loose part entry by its compound key.
 * Returns undefined if not found or if IndexedDB is unavailable.
 */
export async function getLoosePart(
  partNum: string,
  colorId: number
): Promise<LocalLoosePart | undefined> {
  if (!isIndexedDBAvailable()) return undefined;

  try {
    const db = getLocalDb();
    return await db.localLooseParts
      .where('[partNum+colorId]')
      .equals([partNum, colorId])
      .first();
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('Failed to read loose part from IndexedDB:', error);
    }
    return undefined;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run app/lib/localDb/__tests__/loosePartsStore.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/lib/localDb/loosePartsStore.ts app/lib/localDb/__tests__/loosePartsStore.test.ts
git commit -m "add getLoosePart single-key read to loosePartsStore"
```

---

### Task 2: Add part search types

**Files:**

- Modify: `app/types/search.ts`

- [ ] **Step 1: Add `'part'` to `SearchType` and new types**

In `app/types/search.ts`, change:

```ts
export type SearchType = 'set' | 'minifig';
```

to:

```ts
export type SearchType = 'set' | 'minifig' | 'part';
```

Add at the end of the file:

```ts
export type PartSearchResult = {
  partNum: string;
  name: string;
  imageUrl: string | null;
  categoryName: string | null;
  colors: Array<{
    colorId: number;
    colorName: string;
    imageUrl: string | null;
  }>;
};

export type PartSearchPage = {
  results: PartSearchResult[];
  nextPage: number | null;
};
```

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: PASS (no consumers of `SearchType` break because they only check for specific values)

- [ ] **Step 3: Commit**

```bash
git add app/types/search.ts
git commit -m "add part search types and extend SearchType union"
```

---

### Task 3: Standardize set search page sizes

**Files:**

- Modify: `app/api/search/route.ts:14`
- Test: `app/api/search/__tests__/search.test.ts`

- [ ] **Step 1: Update the test expectation**

In `app/api/search/__tests__/search.test.ts`, update the test at line 73–87 that sends `pageSize=40`. Change to `pageSize=50` since 40 will no longer be allowed:

```ts
it('parses valid query parameters', async () => {
  mockSearchSetsPage.mockResolvedValue({
    results: [],
    slice: [],
    page: 2,
    nextPage: 2,
  });

  const req = new NextRequest(
    'http://localhost/api/search?q=star+wars&sort=year&page=2&pageSize=50&filter=set&exact=1'
  );
  const res = await GET(req);

  expect(res.status).toBe(200);
  expect(mockSearchSetsPage).toHaveBeenCalledWith({
    query: 'star wars',
    sort: 'year',
    page: 2,
    pageSize: 50,
    filterType: 'set',
    exactMatch: true,
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run app/api/search/__tests__/search.test.ts`
Expected: FAIL — expects pageSize 50 but route still allows only `[20, 40, 60, 80, 100]`

- [ ] **Step 3: Update allowed sizes**

In `app/api/search/route.ts` line 14, change:

```ts
const allowedSizes = new Set([20, 40, 60, 80, 100]);
```

to:

```ts
const allowedSizes = new Set([20, 50, 100]);
```

- [ ] **Step 4: Add test verifying pageSize=40 is now clamped**

Add a new test case in the `'parameter validation'` describe block:

```ts
it('clamps previously-allowed pageSize 40 to default 20', async () => {
  mockSearchSetsPage.mockResolvedValue({
    results: [],
    slice: [],
    page: 1,
    nextPage: null,
  });

  const req = new NextRequest('http://localhost/api/search?q=test&pageSize=40');
  const res = await GET(req);

  expect(res.status).toBe(200);
  expect(mockSearchSetsPage).toHaveBeenCalledWith(
    expect.objectContaining({ pageSize: 20 })
  );
});
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- --run app/api/search/__tests__/search.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add app/api/search/route.ts app/api/search/__tests__/search.test.ts
git commit -m "standardize set search page sizes to 20/50/100"
```

---

## Chunk 2: Part Search Backend

### Task 4: Implement part search catalog function

**Files:**

- Modify: `app/lib/catalog/parts.ts`
- Test: `app/lib/catalog/__tests__/partsSearch.test.ts`

- [ ] **Step 1: Write the failing test**

Create `app/lib/catalog/__tests__/partsSearch.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

// Mock Supabase client
const mockSelect = vi.fn();
const mockIlike = vi.fn();
const mockEq = vi.fn();
const mockIn = vi.fn();
const mockLimit = vi.fn();
const mockRange = vi.fn();

function buildChain(
  resolveWith: { data: any; error: any } = { data: [], error: null }
) {
  const chain: Record<string, any> = {};
  chain.select = vi.fn(() => chain);
  chain.ilike = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.in = vi.fn(() => chain);
  chain.limit = vi.fn(() => chain);
  chain.range = vi.fn(() => Promise.resolve(resolveWith));
  chain.or = vi.fn(() => chain);
  return chain;
}

const mockFrom = vi.fn();

vi.mock('@/app/lib/db/catalogAccess', () => ({
  getCatalogReadClient: () => ({ from: mockFrom }),
}));

import { searchPartsLocal } from '../parts';

describe('searchPartsLocal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty results for empty query', async () => {
    const result = await searchPartsLocal('', { page: 1, pageSize: 20 });
    expect(result).toEqual({ results: [], nextPage: null });
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('normalizes dimension patterns in queries', async () => {
    // Set up mock to return empty results
    const chain = buildChain();
    mockFrom.mockReturnValue(chain);

    await searchPartsLocal('1x2', { page: 1, pageSize: 20 });

    // The ilike() calls should contain the normalized "1 x 2" pattern
    const ilikeCalls = chain.ilike.mock.calls;
    const hasNormalized = ilikeCalls.some(([_col, val]: [string, string]) =>
      val.includes('1 x 2')
    );
    expect(hasNormalized).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run app/lib/catalog/__tests__/partsSearch.test.ts`
Expected: FAIL — `searchPartsLocal` is not exported from `parts.ts`

- [ ] **Step 3: Implement `searchPartsLocal`**

Add to the end of `app/lib/catalog/parts.ts`:

```ts
// ---------------------------------------------------------------------------
// Part search
// ---------------------------------------------------------------------------

const DIMENSION_PATTERN = /(\d)\s*[xX]\s*(\d)/g;

/** Normalize "1x2", "1X2", "1 x 2" → "1 x 2" for consistent ilike matching. */
function normalizeDimensions(query: string): string {
  return query.replace(DIMENSION_PATTERN, '$1 x $2');
}

const MAX_QUERY_LENGTH = 200;
const SPECIAL_CHARS = /[%_\\]/g;

function sanitizePartQuery(query: string): string {
  return query
    .slice(0, MAX_QUERY_LENGTH)
    .replace(SPECIAL_CHARS, char => `\\${char}`)
    .trim();
}

type PartSearchOptions = {
  page: number;
  pageSize: number;
};

type PartSearchLocalResult = {
  partNum: string;
  name: string;
  imageUrl: string | null;
  categoryName: string | null;
  colors: Array<{
    colorId: number;
    colorName: string;
    imageUrl: string | null;
  }>;
};

export async function searchPartsLocal(
  rawQuery: string,
  opts: PartSearchOptions
): Promise<{ results: PartSearchLocalResult[]; nextPage: number | null }> {
  const sanitized = sanitizePartQuery(rawQuery);
  if (!sanitized) return { results: [], nextPage: null };

  const normalized = normalizeDimensions(sanitized);
  const { page, pageSize } = opts;
  const supabase = getCatalogReadClient();

  // Fetch one extra to detect next page
  const limit = pageSize + 1;
  const offset = (page - 1) * pageSize;

  // Search by part_num prefix and name contains in parallel, then merge
  const [byNum, byName] = await Promise.all([
    supabase
      .from('rb_parts')
      .select('part_num, name, part_cat_id, image_url')
      .ilike('part_num', `${normalized}%`)
      .range(0, limit - 1),
    supabase
      .from('rb_parts')
      .select('part_num, name, part_cat_id, image_url')
      .ilike('name', `%${normalized}%`)
      .range(0, limit * 2 - 1), // fetch more for name since we merge
  ]);

  // Merge and deduplicate by part_num, preferring part_num matches first
  const seen = new Set<string>();
  const merged: typeof byNum.data = [];
  for (const row of byNum.data ?? []) {
    if (!seen.has(row.part_num)) {
      seen.add(row.part_num);
      merged.push(row);
    }
  }
  for (const row of byName.data ?? []) {
    if (!seen.has(row.part_num)) {
      seen.add(row.part_num);
      merged.push(row);
    }
  }

  const parts = merged;
  const error = byNum.error ?? byName.error;
  if (error || !parts.length) return { results: [], nextPage: null };

  // Apply pagination to merged results
  const paged = parts.slice(offset, offset + limit);

  if (error || !parts?.length) return { results: [], nextPage: null };

  const hasMore = paged.length > pageSize;
  const pageSlice = hasMore ? paged.slice(0, pageSize) : paged;

  // Batch-fetch categories
  const catIds = [
    ...new Set(pageSlice.map(p => p.part_cat_id).filter(Boolean)),
  ];
  const categoryMap = new Map<number, string>();
  if (catIds.length > 0) {
    const { data: cats } = await supabase
      .from('rb_part_categories')
      .select('id, name')
      .in('id', catIds);
    for (const c of cats ?? []) {
      categoryMap.set(c.id, c.name);
    }
  }

  // Batch-fetch available colors per part from rb_inventory_parts + rb_colors
  const partNums = pageSlice.map(p => p.part_num);
  const colorsMap = await fetchColorsForParts(supabase, partNums);

  const results: PartSearchLocalResult[] = pageSlice.map(p => {
    const partColors = colorsMap.get(p.part_num) ?? [];
    // Prefer white (colorId 15) or light bluish gray (colorId 71) as default image
    const defaultColor =
      partColors.find(c => c.colorId === 15) ??
      partColors.find(c => c.colorId === 71) ??
      partColors[0];

    return {
      partNum: p.part_num,
      name: p.name,
      imageUrl: defaultColor?.imageUrl ?? p.image_url ?? null,
      categoryName: p.part_cat_id
        ? (categoryMap.get(p.part_cat_id) ?? null)
        : null,
      colors: partColors,
    };
  });

  return {
    results,
    nextPage: hasMore ? page + 1 : null,
  };
}

/** Batch-fetch distinct colors for multiple parts from rb_inventory_parts + rb_colors. */
async function fetchColorsForParts(
  supabase: ReturnType<typeof getCatalogReadClient>,
  partNums: string[]
): Promise<
  Map<
    string,
    Array<{ colorId: number; colorName: string; imageUrl: string | null }>
  >
> {
  if (partNums.length === 0) return new Map();

  // Get distinct (part_num, color_id, img_url) from inventory parts
  const { data: invParts } = await supabase
    .from('rb_inventory_parts')
    .select('part_num, color_id, img_url')
    .in('part_num', partNums.slice(0, 200));

  if (!invParts?.length) return new Map();

  // Deduplicate by part_num + color_id, keeping first img_url
  const seen = new Map<
    string,
    { partNum: string; colorId: number; imgUrl: string | null }
  >();
  for (const row of invParts) {
    const key = `${row.part_num}:${row.color_id}`;
    if (!seen.has(key)) {
      seen.set(key, {
        partNum: row.part_num,
        colorId: row.color_id,
        imgUrl:
          typeof row.img_url === 'string' && row.img_url.trim()
            ? row.img_url.trim()
            : null,
      });
    }
  }

  // Fetch color metadata
  const colorIds = [...new Set([...seen.values()].map(r => r.colorId))];
  const colorMeta = new Map<number, { name: string }>();
  if (colorIds.length > 0) {
    // Batch in chunks of 200
    for (let i = 0; i < colorIds.length; i += 200) {
      const batch = colorIds.slice(i, i + 200);
      const { data: colors } = await supabase
        .from('rb_colors')
        .select('id, name')
        .in('id', batch);
      for (const c of colors ?? []) {
        colorMeta.set(c.id, { name: c.name });
      }
    }
  }

  // Group by part_num
  const result = new Map<
    string,
    Array<{ colorId: number; colorName: string; imageUrl: string | null }>
  >();
  for (const entry of seen.values()) {
    const meta = colorMeta.get(entry.colorId);
    if (!meta) continue;
    if (!result.has(entry.partNum)) result.set(entry.partNum, []);
    result.get(entry.partNum)!.push({
      colorId: entry.colorId,
      colorName: meta.name,
      imageUrl: entry.imgUrl,
    });
  }

  return result;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run app/lib/catalog/__tests__/partsSearch.test.ts`
Expected: PASS

- [ ] **Step 5: Run type check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add app/lib/catalog/parts.ts app/lib/catalog/__tests__/partsSearch.test.ts
git commit -m "add searchPartsLocal catalog function with dimension normalization"
```

---

### Task 5: Add part search service

**Files:**

- Create: `app/lib/services/searchParts.ts`

- [ ] **Step 1: Create the service**

Create `app/lib/services/searchParts.ts`:

```ts
import { searchPartsLocal } from '@/app/lib/catalog/parts';

export async function searchPartsPage(args: {
  query: string;
  page: number;
  pageSize: number;
}) {
  const { query, page, pageSize } = args;
  return searchPartsLocal(query, { page, pageSize });
}
```

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add app/lib/services/searchParts.ts
git commit -m "add searchPartsPage service layer"
```

---

### Task 6: Add part search API route

**Files:**

- Create: `app/api/search/parts/route.ts`
- Test: `app/api/search/parts/__tests__/route.test.ts`

- [ ] **Step 1: Write the failing test**

Create `app/api/search/parts/__tests__/route.test.ts`:

```ts
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

vi.mock('@/app/lib/services/searchParts', () => ({
  searchPartsPage: vi.fn(),
}));

vi.mock('@/lib/rateLimit', () => ({
  consumeRateLimit: vi
    .fn()
    .mockResolvedValue({ allowed: true, retryAfterSeconds: 0 }),
  getClientIp: vi.fn().mockResolvedValue('127.0.0.1'),
}));

vi.mock('@/lib/metrics', () => ({
  incrementCounter: vi.fn(),
  logEvent: vi.fn(),
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { searchPartsPage } from '@/app/lib/services/searchParts';
import { GET } from '../route';

const mockSearchPartsPage = vi.mocked(searchPartsPage);

describe('GET /api/search/parts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty results for empty query', async () => {
    mockSearchPartsPage.mockResolvedValue({ results: [], nextPage: null });

    const req = new NextRequest('http://localhost/api/search/parts');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.results).toEqual([]);
  });

  it('passes query and pagination params to service', async () => {
    mockSearchPartsPage.mockResolvedValue({ results: [], nextPage: null });

    const req = new NextRequest(
      'http://localhost/api/search/parts?q=brick+1x2&page=2&pageSize=50'
    );
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(mockSearchPartsPage).toHaveBeenCalledWith({
      query: 'brick 1x2',
      page: 2,
      pageSize: 50,
    });
  });

  it('clamps invalid pageSize to 20', async () => {
    mockSearchPartsPage.mockResolvedValue({ results: [], nextPage: null });

    const req = new NextRequest(
      'http://localhost/api/search/parts?q=test&pageSize=999'
    );
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(mockSearchPartsPage).toHaveBeenCalledWith(
      expect.objectContaining({ pageSize: 20 })
    );
  });

  it('returns 500 when service throws', async () => {
    mockSearchPartsPage.mockRejectedValue(new Error('DB error'));

    const req = new NextRequest('http://localhost/api/search/parts?q=test');
    const res = await GET(req);

    expect(res.status).toBe(500);
  });

  it('sets cache control header', async () => {
    mockSearchPartsPage.mockResolvedValue({ results: [], nextPage: null });

    const req = new NextRequest('http://localhost/api/search/parts?q=test');
    const res = await GET(req);

    expect(res.headers.get('Cache-Control')).toBe(
      'public, max-age=60, stale-while-revalidate=300'
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run app/api/search/parts/__tests__/route.test.ts`
Expected: FAIL — route module doesn't exist

- [ ] **Step 3: Implement the route**

Create `app/api/search/parts/route.ts`:

```ts
import { errorResponse } from '@/app/lib/api/responses';
import { RATE_LIMIT } from '@/app/lib/constants';
import { searchPartsPage } from '@/app/lib/services/searchParts';
import { incrementCounter, logEvent, logger } from '@/lib/metrics';
import { consumeRateLimit, getClientIp } from '@/lib/rateLimit';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const CACHE_CONTROL = 'public, max-age=60, stale-while-revalidate=300';
const allowedSizes = new Set([20, 50, 100]);

const querySchema = z.object({
  q: z.string().default(''),
  page: z
    .string()
    .optional()
    .transform(v => Math.max(1, Number(v ?? '1') || 1)),
  pageSize: z
    .string()
    .optional()
    .transform(v => Number(v ?? '20') || 20)
    .transform(size => (allowedSizes.has(size) ? size : 20)),
});

export async function GET(req: NextRequest) {
  const clientIp = (await getClientIp(req)) ?? 'unknown';
  const ipLimit = await consumeRateLimit(`search-parts:ip:${clientIp}`, {
    windowMs: RATE_LIMIT.WINDOW_MS,
    maxHits: RATE_LIMIT.SEARCH_MAX,
  });
  if (!ipLimit.allowed) {
    return errorResponse('rate_limited', {
      status: 429,
      headers: { 'Retry-After': String(ipLimit.retryAfterSeconds) },
      details: { retryAfterSeconds: ipLimit.retryAfterSeconds },
    });
  }

  const { searchParams } = new URL(req.url);
  const parsed = querySchema.safeParse(
    Object.fromEntries(searchParams.entries())
  );
  if (!parsed.success) {
    return errorResponse('validation_failed', {
      details: { issues: parsed.error.flatten() },
    });
  }

  const { q, page, pageSize } = parsed.data;
  try {
    const { results, nextPage } = await searchPartsPage({
      query: q,
      page,
      pageSize,
    });
    incrementCounter('search_parts_succeeded', { count: results.length });
    logEvent('search_parts_response', {
      q,
      page,
      pageSize,
      count: results.length,
    });
    return NextResponse.json(
      { results, nextPage },
      { headers: { 'Cache-Control': CACHE_CONTROL } }
    );
  } catch (err) {
    incrementCounter('search_parts_failed', {
      query: q,
      error: err instanceof Error ? err.message : String(err),
    });
    logger.error('search.parts.route.failed', {
      query: q,
      page,
      error: err instanceof Error ? err.message : String(err),
    });
    return errorResponse('search_failed');
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run app/api/search/parts/__tests__/route.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/api/search/parts/route.ts app/api/search/parts/__tests__/route.test.ts app/lib/services/searchParts.ts
git commit -m "add part search API route with tests"
```

---

## Chunk 3: Search UI — SearchBar, Part Results, and PartSearchResultCard

### Task 7: Update SearchBar to support `'part'` type

**Files:**

- Modify: `app/components/search/SearchBar.tsx`

- [ ] **Step 1: Update type handling and dropdown**

In `app/components/search/SearchBar.tsx`:

1. Update the `popstate` handler (line ~40) from:

   ```ts
   setType(rawType === 'minifig' ? 'minifig' : 'set');
   ```

   to:

   ```ts
   setType(
     rawType === 'minifig' ? 'minifig' : rawType === 'part' ? 'part' : 'set'
   );
   ```

2. Update the `onChange` handler on the `<Select>` (line ~125) from:

   ```ts
   onChange={event =>
     setType(event.target.value === 'minifig' ? 'minifig' : 'set')
   }
   ```

   to:

   ```ts
   onChange={event => {
     const v = event.target.value;
     setType(v === 'minifig' ? 'minifig' : v === 'part' ? 'part' : 'set');
   }}
   ```

3. Update URL serialization in `onSubmit` (line ~60) from:

   ```ts
   if (type === 'minifig') {
     params.set('type', 'minifig');
   } else {
     params.delete('type');
   }
   ```

   to:

   ```ts
   if (type === 'set') {
     params.delete('type');
   } else {
     params.set('type', type);
   }
   ```

4. Add "Parts" option to the `<Select>` (after line ~130):

   ```tsx
   <option value="set">Sets</option>
   <option value="minifig">Minifigures</option>
   <option value="part">Parts</option>
   ```

5. Update the placeholder (line ~95) to handle parts:

   ```tsx
   placeholder={
     type === 'minifig'
       ? 'Name or figure number'
       : type === 'part'
         ? 'Name or part number'
         : 'Name or set number'
   }
   ```

6. Update the aria-label (line ~100):
   ```tsx
   aria-label={
     type === 'minifig'
       ? 'Search minifigures'
       : type === 'part'
         ? 'Search parts'
         : 'Search sets'
   }
   ```

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add app/components/search/SearchBar.tsx
git commit -m "add Parts option to search bar dropdown"
```

---

### Task 8: Create PartSearchResultCard component

**Files:**

- Create: `app/components/search/PartSearchResultCard.tsx`

- [ ] **Step 1: Create the component**

Create `app/components/search/PartSearchResultCard.tsx`:

```tsx
'use client';

import { ImagePlaceholder } from '@/app/components/ui/ImagePlaceholder';
import { OptimizedImage } from '@/app/components/ui/OptimizedImage';
import type { PartSearchResult } from '@/app/types/search';

type Props = {
  result: PartSearchResult;
  onClick: () => void;
};

export function PartSearchResultCard({ result, onClick }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative flex flex-col overflow-hidden rounded-lg border border-subtle bg-card text-left transition-colors hover:border-strong"
    >
      <div className="relative w-full bg-card-muted">
        <div className="relative mx-auto w-full max-w-full bg-card p-2">
          {result.imageUrl ? (
            <OptimizedImage
              src={result.imageUrl}
              alt={result.name}
              variant="inventoryThumb"
              className="aspect-square h-full w-full overflow-hidden rounded-lg object-contain"
            />
          ) : (
            <ImagePlaceholder variant="inventory" />
          )}
        </div>
      </div>
      <div className="flex items-start gap-2 px-3 py-3">
        <div className="min-w-0 flex-1">
          <div className="line-clamp-2 w-full text-sm font-medium">
            {result.name}
          </div>
          <div className="mt-1 w-full text-xs text-foreground-muted">
            <span>{result.partNum}</span>
            {result.categoryName && (
              <span className="ml-1">· {result.categoryName}</span>
            )}
          </div>
          {result.colors.length > 0 && (
            <div className="mt-1 text-2xs text-foreground-muted">
              {result.colors.length} color
              {result.colors.length !== 1 ? 's' : ''}
            </div>
          )}
        </div>
      </div>
    </button>
  );
}
```

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add app/components/search/PartSearchResultCard.tsx
git commit -m "add PartSearchResultCard component"
```

---

### Task 9: Add part search branch to SearchResults

**Files:**

- Modify: `app/components/search/SearchResults.tsx`

- [ ] **Step 1: Update `parseTypeParam`**

In `app/components/search/SearchResults.tsx`, change `parseTypeParam` (line ~129):

```ts
function parseTypeParam(value: string | null): SearchType {
  if (value === 'minifig') return 'minifig';
  if (value === 'part') return 'part';
  return 'set';
}
```

- [ ] **Step 2: Add part search fetch function and imports**

Add imports at top:

```ts
import { PartSearchResultCard } from './PartSearchResultCard';
import type { PartSearchPage, PartSearchResult } from '@/app/types/search';
```

Add fetch function after `fetchMinifigSearchPage`:

```ts
async function fetchPartSearchPage(
  q: string,
  page: number = 1,
  pageSize: number = 20
): Promise<PartSearchPage> {
  if (!q) return { results: [], nextPage: null };
  const url = `/api/search/parts?q=${encodeURIComponent(q)}&page=${page}&pageSize=${pageSize}`;
  const res = await fetch(url);
  if (!res.ok) {
    await throwAppErrorFromResponse(res, 'search_failed');
  }
  return (await res.json()) as PartSearchPage;
}
```

- [ ] **Step 3: Add part search query and rendering**

Inside the `SearchResults` component, after the `minifigQuery` block, add:

```ts
const partQuery = useInfiniteQuery<
  PartSearchPage,
  AppError,
  InfiniteData<PartSearchPage, number>,
  [string, { q: string; pageSize: number }],
  number
>({
  queryKey: ['search-parts', { q, pageSize }],
  queryFn: ({ pageParam = 1 }) =>
    fetchPartSearchPage(q, pageParam as number, pageSize),
  getNextPageParam: (lastPage: PartSearchPage) => lastPage.nextPage,
  initialPageParam: 1,
  enabled: hasQuery && searchType === 'part',
});
const {
  data: partData,
  isLoading: isPartLoading,
  error: partError,
  fetchNextPage: fetchNextPartPage,
  hasNextPage: hasNextPartPage,
  isFetchingNextPage: isFetchingNextPartPage,
} = partQuery;
```

Add part search rendering. Before the `if (searchType === 'minifig')` block, add a new block for parts. This block needs state for the modal — add at the top of the component:

```ts
const [selectedPart, setSelectedPart] = useState<PartSearchResult | null>(null);
```

Add import for `useState` if not already imported, and import `CollectionPartModal`:

```ts
import { CollectionPartModal } from '@/app/components/collection/parts/CollectionPartModal';
```

Then add the part rendering branch before the minifig branch:

```tsx
if (searchType === 'part') {
  const ptPages = (partData?.pages as PartSearchPage[] | undefined) ?? [];
  const results = ptPages.flatMap((p: PartSearchPage) => p.results);
  return (
    <>
      <div className="container-wide py-6 lg:py-8">
        {isPartLoading && (
          <div className="flex justify-center py-12 text-center">
            <BrickLoader />
          </div>
        )}
        {partError && (
          <ErrorBanner
            className="mt-2"
            message="Failed to load part results. Please try again."
          />
        )}
        {!isPartLoading && !partError && results.length > 0 && (
          <div>
            <div className="grid grid-cols-1 gap-x-2 gap-y-4 xs:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {results.map((r: PartSearchResult) => (
                <PartSearchResultCard
                  key={r.partNum}
                  result={r}
                  onClick={() => setSelectedPart(r)}
                />
              ))}
            </div>
            {hasNextPartPage && (
              <div className="mb-8 flex justify-center py-4">
                <button
                  onClick={() => fetchNextPartPage()}
                  disabled={isFetchingNextPartPage}
                  className="rounded-lg border border-subtle bg-card px-3 py-2 text-sm hover:bg-card-muted"
                >
                  {isFetchingNextPartPage ? 'Loading…' : 'Load More'}
                </button>
              </div>
            )}
          </div>
        )}
        {!isPartLoading && !partError && results.length === 0 && (
          <EmptyState
            className="mt-4"
            message="No parts found. Try a different name or part number."
          />
        )}
      </div>
      {selectedPart && (
        <CollectionPartModal
          part={{
            partNum: selectedPart.partNum,
            colorId: selectedPart.colors[0]?.colorId ?? 0,
            canonicalKey: `${selectedPart.partNum}:${selectedPart.colors[0]?.colorId ?? 0}`,
            partName: selectedPart.name,
            colorName: selectedPart.colors[0]?.colorName ?? '',
            imageUrl: selectedPart.imageUrl,
            parentCategory: null,
            categoryName: selectedPart.categoryName,
            elementId: null,
            setCount: null,
            ownedFromSets: 0,
            looseQuantity: 0,
            totalOwned: 0,
            setSources: [],
            missingFromSets: [],
          }}
          onClose={() => setSelectedPart(null)}
          onLooseQuantityChange={() => {}}
        />
      )}
    </>
  );
}
```

**Note:** This wires up the existing `CollectionPartModal` with a minimal `CollectionPart` shape. The modal generalization (Task 10) will replace this with the new flexible props. This is an interim step to get the search flow end-to-end testable.

- [ ] **Step 4: Run type check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Manual test**

Open `http://localhost:3000/search`, select "Parts" from dropdown, search for "1x2 brick". Verify:

- Results appear with part thumbnails
- Clicking a card opens the existing collection part modal
- Modal shows loose quantity control

- [ ] **Step 6: Commit**

```bash
git add app/components/search/SearchResults.tsx
git commit -m "add part search results branch to SearchResults"
```

---

## Chunk 4: Modal Redesign — Generalize CollectionPartModal

### Task 10: Generalize CollectionPartModal with color picker

**Files:**

- Modify: `app/components/collection/parts/CollectionPartModal.tsx`

This is the largest single change. The modal gets:

1. A new, more flexible props interface
2. A color picker row with rounded thumbnails
3. Internal color switching with per-color loose quantity loading

- [ ] **Step 1: Refactor the props interface**

Replace the current `Props` type and component signature. The modal should accept both the old `CollectionPart`-based interface (for backward compatibility with collection route) and the new flexible interface.

New approach: accept a union props type. If `availableColors` is provided, show the color picker. If not, behave like today.

```tsx
type BaseProps = {
  onClose: () => void;
  onLooseQuantityChange: () => void;
};

type LegacyProps = BaseProps & {
  part: CollectionPart;
  availableColors?: undefined;
};

type FlexibleProps = BaseProps & {
  part: {
    partNum: string;
    partName: string;
    imageUrl: string | null;
    colorId: number;
    colorName: string;
    ownedFromSets?: number;
    setSources?: CollectionPartSetSource[];
  };
  availableColors: Array<{
    colorId: number;
    colorName: string;
    imageUrl: string | null;
  }>;
};

type Props = LegacyProps | FlexibleProps;
```

- [ ] **Step 2: Add color picker UI and color switching logic**

Inside the component:

1. Track `selectedColorId` state, initialized from `part.colorId`
2. Track `selectedColorName` and `selectedImageUrl` derived from `selectedColorId` + `availableColors`
3. Add `useEffect` on `selectedColorId` that calls `getLoosePart()` to load the loose quantity for the new color
4. Add the color picker row between identity bar and quantity summary:

```tsx
{
  availableColors && availableColors.length > 0 && (
    <div className="border-t-2 border-subtle px-4 py-3">
      <p className="mb-2 text-xs font-medium text-foreground-muted uppercase">
        Color
      </p>
      <div className="flex flex-wrap gap-2">
        {availableColors.map(c => (
          <button
            key={c.colorId}
            type="button"
            onClick={() => handleColorChange(c)}
            className={cn(
              'size-10 overflow-hidden rounded-full border-2 transition-colors',
              c.colorId === selectedColorId
                ? 'border-theme-primary ring-2 ring-theme-primary/30'
                : 'border-subtle hover:border-strong'
            )}
            title={c.colorName}
          >
            {c.imageUrl ? (
              <img
                src={c.imageUrl}
                alt={c.colorName}
                className="size-full object-cover"
              />
            ) : (
              <div className="size-full bg-neutral-200 dark:bg-neutral-700" />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
```

Import `getLoosePart`:

```ts
import { getLoosePart } from '@/app/lib/localDb/loosePartsStore';
```

Note: the `colorSwatch` variant may not exist on `OptimizedImage`. Use a simple `<img>` with rounded styling if needed, or add the variant. Check the existing `OptimizedImage` variants and use the closest match or a raw `<img>`.

- [ ] **Step 3: Update loose quantity write to use `selectedColorId`**

The `handleLooseChange` function should use `selectedColorId` instead of `part.colorId`:

```ts
const handleLooseChange = async (next: number) => {
  setLooseQty(next);
  await bulkUpsertLooseParts(
    [{ partNum: part.partNum, colorId: selectedColorId, quantity: next }],
    'replace'
  );
  onLooseQuantityChange();
};
```

- [ ] **Step 4: Update hero image and identity bar to use selected color**

Hero image `src` should use `selectedImageUrl` (from the currently selected color in `availableColors`, falling back to `part.imageUrl`).

Identity bar should show `selectedColorName`.

External links should use `selectedColorId` for the Rebrickable URL.

- [ ] **Step 5: Verify backward compatibility**

Existing collection route usage passes `part` as a full `CollectionPart` without `availableColors`. The modal should:

- Not show the color picker
- Behave exactly as before
- Use `part.colorId` / `part.colorName` / `part.imageUrl` directly

- [ ] **Step 6: Run type check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 7: Manual test — collection route**

Navigate to any set's inventory in the collection view, click a part to open the modal. Verify it behaves identically to before (no color picker, loose quantity works).

- [ ] **Step 8: Update SearchResults.tsx to use new flexible props**

Update the `SearchResults.tsx` interim code from Task 9 to pass `availableColors` to the modal. Replace the `CollectionPartModal` JSX in the part search branch with:

```tsx
<CollectionPartModal
  part={{
    partNum: selectedPart.partNum,
    partName: selectedPart.name,
    imageUrl: selectedPart.imageUrl,
    colorId: selectedPart.colors[0]?.colorId ?? 0,
    colorName: selectedPart.colors[0]?.colorName ?? '',
  }}
  availableColors={selectedPart.colors}
  onClose={() => setSelectedPart(null)}
  onLooseQuantityChange={() => {}}
/>
```

- [ ] **Step 8b: Run type check after SearchResults update**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 8c: Manual test — search route**

Search for a part, click it. Verify:

- Color picker shows with rounded thumbnails
- Clicking a color updates the hero image and identity bar
- Loose quantity loads for each color
- Incrementing persists correctly per color

- [ ] **Step 9: Commit**

```bash
git add app/components/collection/parts/CollectionPartModal.tsx app/components/search/SearchResults.tsx
git commit -m "generalize CollectionPartModal with color picker and flexible props"
```

---

## Chunk 5: Identify Route Integration

### Task 11: Preserve `partImageUrl` in IdentifyClient color state

**Files:**

- Modify: `app/identify/IdentifyClient.tsx`

- [ ] **Step 1: Widen the `colors` state type**

Change (line ~177):

```ts
const [colors, setColors] = useState<Array<{
  id: number;
  name: string;
```

to:

```ts
const [colors, setColors] = useState<Array<{
  id: number;
  name: string;
  partImageUrl: string | null;
```

- [ ] **Step 2: Update all `setColors` call sites to preserve `partImageUrl`**

There are 7+ sites that map colors to `{ id, name }`. Update each to include `partImageUrl`:

At lines ~363, ~454, ~564, ~653, ~674, ~929, ~1006, change from:

```ts
opts.map(c => ({ id: c.id, name: c.name }));
```

to:

```ts
opts.map(c => ({
  id: c.id,
  name: c.name,
  partImageUrl: c.partImageUrl ?? null,
}));
```

For the `blColors` mapping (line ~674), BrickLink colors don't have `partImageUrl`, so set to null:

```ts
blCols.map(c => ({ id: c.id, name: c.name, partImageUrl: null }));
```

- [ ] **Step 3: Run type check**

Run: `npx tsc --noEmit`
Expected: PASS (may need to fix downstream consumers of `colors` that only expect `{ id, name }`)

- [ ] **Step 4: Commit**

```bash
git add app/identify/IdentifyClient.tsx
git commit -m "preserve partImageUrl in identify client color state"
```

---

### Task 12: Make IdentifyResultCard thumbnail clickable

**Files:**

- Modify: `app/components/identify/IdentifyResultCard.tsx`

- [ ] **Step 1: Add `onThumbnailClick` prop**

Add to the component's props:

```ts
onThumbnailClick?: () => void;
```

- [ ] **Step 2: Wrap thumbnail in a button when clickable**

Replace the thumbnail `<div>` (line ~74) with a conditionally clickable wrapper:

```tsx
{
  onThumbnailClick && !isMinifig ? (
    <button
      type="button"
      onClick={onThumbnailClick}
      className="relative h-32 w-32 shrink-0 cursor-pointer rounded bg-card-muted p-2 transition-opacity hover:opacity-80"
      aria-label="Open part details"
    >
      {/* same image content */}
    </button>
  ) : (
    <div className="relative h-32 w-32 shrink-0 rounded bg-card-muted p-2">
      {/* same image content */}
    </div>
  );
}
```

Extract the image content to avoid duplication:

```tsx
const thumbnailContent = displayImageUrl ? (
  <OptimizedImage
    src={displayImageUrl}
    alt={displayName}
    variant="identifyResult"
    className="h-full w-full object-contain"
  />
) : (
  <ImagePlaceholder variant="fill" />
);
```

- [ ] **Step 3: Run type check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add app/components/identify/IdentifyResultCard.tsx
git commit -m "make identify result card thumbnail clickable for non-minifig parts"
```

---

### Task 13: Wire up modal in IdentifyClient

**Files:**

- Modify: `app/identify/IdentifyClient.tsx`

- [ ] **Step 1: Add modal state**

Add near the other state declarations:

```ts
const [loosePartModalOpen, setLoosePartModalOpen] = useState(false);
```

Import the modal:

```ts
import { CollectionPartModal } from '@/app/components/collection/parts/CollectionPartModal';
```

- [ ] **Step 2: Pass `onThumbnailClick` to IdentifyResultCard**

Find where `<IdentifyResultCard` is rendered and add:

```ts
onThumbnailClick={() => setLoosePartModalOpen(true)}
```

- [ ] **Step 3: Render the modal**

After the `IdentifyResultCard`, render:

```tsx
{
  loosePartModalOpen && part && !part.isMinifig && (
    <CollectionPartModal
      part={{
        partNum: part.partNum,
        partName: part.name,
        imageUrl: part.imageUrl,
        colorId: selectedColorId ?? colors?.[0]?.id ?? 0,
        colorName:
          colors?.find(c => c.id === selectedColorId)?.name ??
          part.colorName ??
          '',
      }}
      availableColors={(colors ?? []).map(c => ({
        colorId: c.id,
        colorName: c.name,
        imageUrl: c.partImageUrl,
      }))}
      onClose={() => setLoosePartModalOpen(false)}
      onLooseQuantityChange={() => {}}
    />
  );
}
```

- [ ] **Step 4: Run type check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Manual test**

Navigate to `/identify`, identify a part (use part search mode with a known part number like "3001"). Verify:

- Thumbnail shows cursor pointer on hover
- Clicking opens the modal with color picker
- Colors match the dropdown colors
- Loose quantity updates persist
- Minifig thumbnails are NOT clickable

- [ ] **Step 6: Commit**

```bash
git add app/identify/IdentifyClient.tsx
git commit -m "wire up loose parts modal on identify route"
```

---

## Chunk 6: Minifig Theme Label Fix

### Task 14: Move theme label above name in MinifigSearchResultItem

**Files:**

- Modify: `app/components/minifig/MinifigSearchResultItem.tsx`

- [ ] **Step 1: Rearrange the text content**

In `app/components/minifig/MinifigSearchResultItem.tsx`, change the content block (lines ~56–71) from:

```tsx
<div className="flex items-start gap-2 px-3 py-3">
  <div className="min-w-0 flex-1">
    <div className="line-clamp-2 w-full overflow-hidden font-medium">
      {name}
    </div>
    <div className="mt-1 w-full text-xs text-foreground-muted">
      <span>{displayLabel}</span>
      {typeof numParts === 'number' && numParts > 0 && (
        <span className="ml-1">• {numParts} parts</span>
      )}
      {(themeName || themePath) && (
        <div className="mt-1 truncate text-2xs">{themePath ?? themeName}</div>
      )}
    </div>
  </div>
</div>
```

to:

```tsx
<div className="flex items-start gap-2 px-3 py-3">
  <div className="min-w-0 flex-1">
    {(themeName || themePath) && (
      <div className="mb-0.5 truncate text-2xs text-foreground-muted">
        {themePath ?? themeName}
      </div>
    )}
    <div className="line-clamp-2 w-full overflow-hidden font-medium">
      {name}
    </div>
    <div className="mt-1 w-full text-xs text-foreground-muted">
      <span>{displayLabel}</span>
      {typeof numParts === 'number' && numParts > 0 && (
        <span className="ml-1">• {numParts} parts</span>
      )}
    </div>
  </div>
</div>
```

- [ ] **Step 2: Manual test**

Search for minifigures (e.g., "star wars"). Verify theme label appears above the name.

- [ ] **Step 3: Commit**

```bash
git add app/components/minifig/MinifigSearchResultItem.tsx
git commit -m "move theme label above name in minifig search results"
```

---

## Chunk 7: Final Integration Test and Cleanup

### Task 15: End-to-end manual verification

- [ ] **Step 1: Part search flow**

1. Go to `/search`
2. Select "Parts" from dropdown
3. Search "1x2" — verify results load with normalized matching
4. Search "plate" — verify name-based results
5. Click a part card — verify modal opens with color picker
6. Click different colors — verify image and name update
7. Increment loose quantity — verify it persists (close and reopen modal)
8. Navigate back — verify URL has `type=part`
9. Browser back/forward — verify `popstate` handles `type=part`

- [ ] **Step 2: Identify flow**

1. Go to `/identify`
2. Enter a known part number (e.g., "3001")
3. Verify thumbnail has hover cursor (non-minifig)
4. Click thumbnail — verify modal opens
5. Verify identified color is pre-selected
6. Switch colors — verify loose quantity loads per color
7. Enter a minifig ID (e.g., "sw0001") — verify thumbnail is NOT clickable

- [ ] **Step 3: Collection flow (regression)**

1. Navigate to a set in the collection
2. Click a part to open the modal
3. Verify NO color picker is shown (backward compatibility)
4. Verify loose quantity works as before

- [ ] **Step 4: Minifig search theme label**

1. Search minifigures
2. Verify theme appears above name on result cards

- [ ] **Step 5: Run all tests**

Run: `npm test -- --run`
Expected: All tests pass

- [ ] **Step 6: Run type check and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: PASS

- [ ] **Step 7: Final commit (if any fixes needed)**

```bash
git add -A
git commit -m "loose parts search and increment: final cleanup"
```
