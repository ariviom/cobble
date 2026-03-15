# Sync Overhaul Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace timestamp-based LWW sync with server-versioned delta sync, add refresh-on-focus pulling, wire up cross-tab sync requests, and add a floating sync status indicator.

**Architecture:** Server-side Postgres sequence assigns monotonic `sync_version` to every `user_set_parts` write via BEFORE trigger. Clients track per-set watermarks in IndexedDB and pull only changed rows. Push path returns version watermarks in response. TabCoordinator gains callback-based event dispatch for sync_request and pull_request. Floating SyncIndicator pill shows sync lifecycle.

**Tech Stack:** Postgres (sequence, trigger, RPC), Supabase JS client, Dexie/IndexedDB, React (hooks, context), Tailwind CSS, Vitest

**Spec:** `docs/superpowers/specs/2026-03-12-sync-overhaul-design.md`

---

## Chunk 1: Database Migration & API Changes

### Task 1: Database Migration — sync_version column, sequence, trigger, RPC, index, backfill

**Files:**

- Create: `supabase/migrations/20260312000000_sync_version.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- Add monotonic sync_version to user_set_parts for delta sync.
-- Each write gets a new version from a global sequence, enabling
-- efficient "give me everything changed since version N" queries.

-- 1. Sequence
CREATE SEQUENCE public.user_set_parts_sync_seq;

-- 2. Column
ALTER TABLE public.user_set_parts
  ADD COLUMN sync_version bigint NOT NULL DEFAULT 0;

-- 3. Trigger function: bumps sync_version and updated_at on every write
CREATE OR REPLACE FUNCTION public.bump_user_set_parts_sync_version()
RETURNS trigger AS $$
BEGIN
  NEW.sync_version := nextval('public.user_set_parts_sync_seq');
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_bump_sync_version
  BEFORE INSERT OR UPDATE ON public.user_set_parts
  FOR EACH ROW
  EXECUTE FUNCTION public.bump_user_set_parts_sync_version();

-- 4. RPC: get max sync_version per set for a user (called after push)
CREATE OR REPLACE FUNCTION public.get_max_sync_versions(
  p_user_id uuid,
  p_set_nums text[]
) RETURNS TABLE(set_num text, max_version bigint) AS $$
  SELECT usp.set_num, MAX(usp.sync_version)
  FROM public.user_set_parts usp
  WHERE usp.user_id = p_user_id AND usp.set_num = ANY(p_set_nums)
  GROUP BY usp.set_num;
$$ LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public;

-- 5. Index for delta pull: WHERE user_id = ? AND set_num = ? AND sync_version > ?
CREATE INDEX user_set_parts_sync_version_idx
  ON public.user_set_parts (user_id, set_num, sync_version);

-- 6. Backfill existing rows so first delta pull finds them
UPDATE public.user_set_parts
SET sync_version = nextval('public.user_set_parts_sync_seq')
WHERE sync_version = 0;
```

- [ ] **Step 2: Verify migration applies cleanly**

Run: `supabase db reset`
Expected: No errors. The `user_set_parts` table has a `sync_version` column, the trigger fires on insert/update, and the `get_max_sync_versions` RPC is callable.

- [ ] **Step 3: Regenerate TypeScript types**

Run: `npm run generate-types`
Expected: `sync_version` appears in the generated `user_set_parts` type. `get_max_sync_versions` appears in the RPC functions type.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260312000000_sync_version.sql
git commit -m "feat: add sync_version column, sequence, trigger, RPC, and index to user_set_parts"
```

---

### Task 2: API Route — return sync versions in response

**Files:**

- Modify: `app/api/sync/route.ts`

- [ ] **Step 1: Write the failing test**

Create: `app/api/sync/__tests__/sync-versions.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// This test verifies that the sync API response includes a `versions` map
// after successful upserts. We mock the Supabase client to verify the
// RPC call and response shape.

vi.mock('server-only', () => ({}));

const mockGetUser = vi.fn();
const mockUpsert = vi.fn();
const mockRpc = vi.fn();
const mockConsumeRateLimit = vi.fn();

vi.mock('@/app/lib/supabaseAuthServerClient', () => ({
  getSupabaseAuthServerClient: vi.fn().mockImplementation(async () => ({
    auth: { getUser: mockGetUser },
    from: vi.fn(() => ({
      upsert: mockUpsert,
      delete: () => ({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ error: null }),
              }),
            }),
          }),
        }),
      }),
      update: () => ({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        }),
      }),
    })),
    rpc: mockRpc,
  })),
}));

vi.mock('@/lib/rateLimit', () => ({
  consumeRateLimit: (...args: unknown[]) => mockConsumeRateLimit(...args),
}));

vi.mock('@/lib/metrics', () => ({
  incrementCounter: vi.fn(),
  logEvent: vi.fn(),
}));

vi.mock('@/app/lib/middleware/csrf', () => ({
  withCsrfProtection: (handler: Function) => handler,
}));

describe('POST /api/sync — versions response', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    });
    mockConsumeRateLimit.mockResolvedValue({ allowed: true });
    mockUpsert.mockResolvedValue({ error: null });
    // update_found_count RPC returns nothing interesting
    mockRpc.mockResolvedValueOnce({ error: null });
    // get_max_sync_versions RPC returns version data
    mockRpc.mockResolvedValueOnce({
      data: [{ set_num: '75192-1', max_version: 42 }],
      error: null,
    });
  });

  it('returns versions map after successful user_set_parts upserts', async () => {
    const { POST } = await import('@/app/api/sync/route');

    const req = new Request('http://localhost/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        operations: [
          {
            id: 1,
            table: 'user_set_parts',
            operation: 'upsert',
            payload: {
              set_num: '75192-1',
              part_num: '3001',
              color_id: 11,
              is_spare: false,
              owned_quantity: 3,
            },
          },
        ],
      }),
    });

    const response = await POST(req as any);
    const body = await response.json();

    expect(body.success).toBe(true);
    expect(body.versions).toBeDefined();
    expect(body.versions['75192-1']).toBe(42);
    expect(mockRpc).toHaveBeenCalledWith('get_max_sync_versions', {
      p_user_id: 'user-1',
      p_set_nums: ['75192-1'],
    });
  });

  it('omits versions when no user_set_parts operations', async () => {
    const { POST } = await import('@/app/api/sync/route');

    const req = new Request('http://localhost/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        operations: [
          {
            id: 1,
            table: 'user_loose_parts',
            operation: 'upsert',
            payload: {
              part_num: '3001',
              color_id: 11,
              loose_quantity: 5,
            },
          },
        ],
      }),
    });

    const response = await POST(req as any);
    const body = await response.json();

    expect(body.success).toBe(true);
    expect(body.versions).toBeUndefined();
    expect(mockRpc).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run app/api/sync/__tests__/sync-versions.test.ts`
Expected: FAIL — `body.versions` is undefined because the route doesn't return versions yet.

- [ ] **Step 3: Modify route.ts to return versions**

Modify: `app/api/sync/route.ts`

After the existing `update_found_count` loop (around line 368), and before building the response object, add the versions query:

```typescript
// Query sync versions for affected user_set_parts sets
let versions: Record<string, number> | undefined;
if (affectedSetNums.size > 0) {
  try {
    const { data: versionRows } = await supabase.rpc('get_max_sync_versions', {
      p_user_id: user.id,
      p_set_nums: Array.from(affectedSetNums),
    });
    if (versionRows && versionRows.length > 0) {
      versions = {};
      for (const row of versionRows) {
        versions[row.set_num] = Number(row.max_version);
      }
    }
  } catch {
    // Non-critical — client will catch up on next pull
  }
}
```

Update the response object to include `versions`:

```typescript
const response: SyncResponse = {
  success: failed.length === 0,
  processed,
  ...(failed.length > 0 ? { failed } : {}),
  ...(versions ? { versions } : {}),
};
```

Update the `SyncResponse` type at the top of the file to include `versions`:

```typescript
type SyncResponse = {
  success: boolean;
  processed: number;
  failed?: Array<{ id: number; error: string }>;
  versions?: Record<string, number>;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run app/api/sync/__tests__/sync-versions.test.ts`
Expected: PASS

- [ ] **Step 5: Run existing tests to check for regressions**

Run: `npm test -- --run app/api/sync/`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add app/api/sync/route.ts app/api/sync/__tests__/sync-versions.test.ts
git commit -m "feat: return sync_version watermarks in POST /api/sync response"
```

---

## Chunk 2: IndexedDB Schema & Watermark Helpers

### Task 3: IndexedDB Schema — add syncWatermarks table

**Files:**

- Modify: `app/lib/localDb/schema.ts`

- [ ] **Step 1: Add the SyncWatermark type**

Add after the `MetaEntry` type (around line 196):

```typescript
/**
 * Per-(user, set) sync watermark for delta pulls.
 * Tracks the highest sync_version seen from the server.
 */
export type SyncWatermark = {
  userId: string;
  setNumber: string;
  lastSyncVersion: number;
};
```

- [ ] **Step 2: Add syncWatermarks table to BrickPartyDB class**

Add to the class properties (around line 246):

```typescript
syncWatermarks!: Table<SyncWatermark, [string, string]>;
```

- [ ] **Step 3: Add version 10 with the new table**

After the version 9 block (around line 430), add:

```typescript
// Version 10: Add syncWatermarks table for delta sync.
this.version(10).stores({
  catalogSets: 'setNumber, themeId, year, cachedAt',
  catalogParts: 'partNum, categoryId, parentCategory, cachedAt',
  catalogColors: 'id, cachedAt',
  catalogSetParts:
    '++id, setNumber, partNum, colorId, inventoryKey, [setNumber+inventoryKey], [setNumber+colorId]',
  catalogSetMeta: 'setNumber, inventoryCachedAt, inventoryVersion',
  catalogMinifigs: 'figNum, cachedAt',

  localOwned:
    '++id, setNumber, inventoryKey, [setNumber+inventoryKey], updatedAt',
  localCollections: 'id, userId, type, updatedAt',
  localCollectionItems: '++id, collectionId, itemType, itemId, addedAt',
  localLooseParts: '[partNum+colorId], partNum, colorId, updatedAt',

  syncQueue: '++id, userId, table, createdAt, retryCount',
  syncWatermarks: '[userId+setNumber]',
  meta: 'key',

  uiState: 'key',
  recentSets: 'setNumber, visitedAt',
});
```

- [ ] **Step 4: Verify types compile**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add app/lib/localDb/schema.ts
git commit -m "feat: add syncWatermarks table to IndexedDB schema (version 10)"
```

---

### Task 4: Watermark helpers — read, write, update

**Files:**

- Create: `app/lib/localDb/watermarkStore.ts`
- Modify: `app/lib/localDb/index.ts`

- [ ] **Step 1: Write the failing tests**

Create: `app/lib/localDb/__tests__/watermarkStore.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGet = vi.fn();
const mockPut = vi.fn();
const mockBulkPut = vi.fn();

vi.mock('../schema', () => ({
  getLocalDb: vi.fn(() => ({
    syncWatermarks: {
      get: mockGet,
      put: mockPut,
      bulkPut: mockBulkPut,
    },
  })),
  isIndexedDBAvailable: vi.fn(() => true),
}));

describe('watermarkStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getWatermark', () => {
    it('returns 0 when no watermark exists', async () => {
      mockGet.mockResolvedValue(undefined);
      const { getWatermark } = await import('../watermarkStore');
      const result = await getWatermark('user-1', '75192-1');
      expect(result).toBe(0);
      expect(mockGet).toHaveBeenCalledWith(['user-1', '75192-1']);
    });

    it('returns stored watermark value', async () => {
      mockGet.mockResolvedValue({
        userId: 'user-1',
        setNumber: '75192-1',
        lastSyncVersion: 42,
      });
      const { getWatermark } = await import('../watermarkStore');
      const result = await getWatermark('user-1', '75192-1');
      expect(result).toBe(42);
    });
  });

  describe('setWatermark', () => {
    it('stores the watermark', async () => {
      mockPut.mockResolvedValue(undefined);
      const { setWatermark } = await import('../watermarkStore');
      await setWatermark('user-1', '75192-1', 42);
      expect(mockPut).toHaveBeenCalledWith({
        userId: 'user-1',
        setNumber: '75192-1',
        lastSyncVersion: 42,
      });
    });
  });

  describe('updateWatermarks', () => {
    it('bulk updates multiple watermarks', async () => {
      mockBulkPut.mockResolvedValue(undefined);
      const { updateWatermarks } = await import('../watermarkStore');
      await updateWatermarks('user-1', {
        '75192-1': 42,
        '10294-1': 99,
      });
      expect(mockBulkPut).toHaveBeenCalledWith([
        { userId: 'user-1', setNumber: '75192-1', lastSyncVersion: 42 },
        { userId: 'user-1', setNumber: '10294-1', lastSyncVersion: 99 },
      ]);
    });

    it('does nothing for empty versions map', async () => {
      const { updateWatermarks } = await import('../watermarkStore');
      await updateWatermarks('user-1', {});
      expect(mockBulkPut).not.toHaveBeenCalled();
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run app/lib/localDb/__tests__/watermarkStore.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement watermarkStore.ts**

Create: `app/lib/localDb/watermarkStore.ts`

```typescript
/**
 * Sync watermark operations for IndexedDB.
 *
 * Tracks the highest sync_version seen from the server per (user, set).
 * Used by delta pull to fetch only rows changed since the last pull.
 */

import { getLocalDb, isIndexedDBAvailable } from './schema';

/**
 * Get the sync watermark for a (user, set) pair.
 * Returns 0 if no watermark exists (triggers full pull).
 */
export async function getWatermark(
  userId: string,
  setNumber: string
): Promise<number> {
  if (!isIndexedDBAvailable()) return 0;

  try {
    const db = getLocalDb();
    const entry = await db.syncWatermarks.get([userId, setNumber]);
    return entry?.lastSyncVersion ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Set the sync watermark for a (user, set) pair.
 */
export async function setWatermark(
  userId: string,
  setNumber: string,
  lastSyncVersion: number
): Promise<void> {
  if (!isIndexedDBAvailable()) return;

  try {
    const db = getLocalDb();
    await db.syncWatermarks.put({ userId, setNumber, lastSyncVersion });
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('Failed to set sync watermark:', error);
    }
  }
}

/**
 * Bulk update watermarks from a versions map (returned by POST /api/sync).
 * Safe to call with any versions — the server sequence is monotonic so
 * values returned from the API are always >= existing watermarks.
 */
export async function updateWatermarks(
  userId: string,
  versions: Record<string, number>
): Promise<void> {
  if (!isIndexedDBAvailable()) return;

  const entries = Object.entries(versions);
  if (entries.length === 0) return;

  try {
    const db = getLocalDb();
    await db.syncWatermarks.bulkPut(
      entries.map(([setNumber, lastSyncVersion]) => ({
        userId,
        setNumber,
        lastSyncVersion,
      }))
    );
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('Failed to update sync watermarks:', error);
    }
  }
}
```

- [ ] **Step 4: Export from index.ts**

Add to `app/lib/localDb/index.ts`:

```typescript
export { getWatermark, setWatermark, updateWatermarks } from './watermarkStore';
```

Also add to the schema exports:

```typescript
type SyncWatermark,
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- --run app/lib/localDb/__tests__/watermarkStore.test.ts`
Expected: PASS

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add app/lib/localDb/watermarkStore.ts app/lib/localDb/__tests__/watermarkStore.test.ts app/lib/localDb/index.ts app/lib/localDb/schema.ts
git commit -m "feat: add watermark store for sync_version tracking"
```

---

## Chunk 3: TabCoordinator — sync_request handling, pull_request, debounce

### Task 5: TabCoordinator — add callback registrations and new message types

**Files:**

- Modify: `app/lib/sync/tabCoordinator.ts`

- [ ] **Step 1: Write the failing test**

Create: `app/lib/sync/__tests__/tabCoordinator.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// We need to test the TabCoordinator in isolation.
// Since it's a singleton, we'll import the class directly.

// Mock BroadcastChannel
class MockBroadcastChannel {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  postMessage = vi.fn();
  close = vi.fn();
}

vi.stubGlobal('BroadcastChannel', MockBroadcastChannel);

describe('TabCoordinator callbacks', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    // Reset module singleton between tests to prevent cross-test interference
    vi.resetModules();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires onSyncRequested callback when leader receives sync_request', async () => {
    // Dynamic import to get fresh module state (singleton reset above)
    const mod = await import('../tabCoordinator');

    const coordinator = mod.getTabCoordinator()!;
    const callback = vi.fn();
    coordinator.onSyncRequested(callback);

    // Make this tab the leader by advancing past the claim timeout
    await vi.advanceTimersByTimeAsync(800);

    // Simulate receiving a sync_request from another tab
    const channel = (coordinator as any).channel as MockBroadcastChannel;
    channel.onmessage?.({
      data: { type: 'sync_request', tabId: 'other_tab' },
    } as any);

    // Debounce: callback should not fire immediately
    expect(callback).not.toHaveBeenCalled();

    // After debounce window (500ms)
    await vi.advanceTimersByTimeAsync(500);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('fires onPullRequested callback when pull_request received', async () => {
    const mod = await import('../tabCoordinator');
    const coordinator = mod.getTabCoordinator()!;
    const callback = vi.fn();
    coordinator.onPullRequested(callback);

    const channel = (coordinator as any).channel as MockBroadcastChannel;
    channel.onmessage?.({
      data: { type: 'pull_request', tabId: 'leader_tab' },
    } as any);

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('debounces multiple sync_requests within 500ms', async () => {
    const mod = await import('../tabCoordinator');
    const coordinator = mod.getTabCoordinator()!;
    const callback = vi.fn();
    coordinator.onSyncRequested(callback);

    await vi.advanceTimersByTimeAsync(800); // become leader

    const channel = (coordinator as any).channel as MockBroadcastChannel;

    // Fire 3 sync requests rapidly
    channel.onmessage?.({
      data: { type: 'sync_request', tabId: 'tab_a' },
    } as any);
    channel.onmessage?.({
      data: { type: 'sync_request', tabId: 'tab_b' },
    } as any);
    channel.onmessage?.({
      data: { type: 'sync_request', tabId: 'tab_c' },
    } as any);

    await vi.advanceTimersByTimeAsync(500);
    expect(callback).toHaveBeenCalledTimes(1); // coalesced into one
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run app/lib/sync/__tests__/tabCoordinator.test.ts`
Expected: FAIL — `onSyncRequested` and `onPullRequested` don't exist yet.

- [ ] **Step 3: Implement TabCoordinator changes**

Modify: `app/lib/sync/tabCoordinator.ts`

Add to the `SyncMessage` type union:

```typescript
| { type: 'pull_request'; tabId: string }
```

Add new private fields to the `TabCoordinator` class:

```typescript
private onSyncRequestedCallbacks: Set<() => void> = new Set();
private onPullRequestedCallbacks: Set<() => void> = new Set();
private syncRequestDebounce: ReturnType<typeof setTimeout> | null = null;
```

Update the `sync_request` case in `handleMessage`:

```typescript
case 'sync_request':
  if (this.isLeader) {
    // Debounce: coalesce rapid requests within 500ms
    if (this.syncRequestDebounce) {
      clearTimeout(this.syncRequestDebounce);
    }
    this.syncRequestDebounce = setTimeout(() => {
      this.syncRequestDebounce = null;
      for (const cb of this.onSyncRequestedCallbacks) {
        try { cb(); } catch { /* ignore */ }
      }
    }, 500);
  }
  break;
```

Add a `pull_request` case:

```typescript
case 'pull_request':
  for (const cb of this.onPullRequestedCallbacks) {
    try { cb(); } catch { /* ignore */ }
  }
  break;
```

Add public registration methods:

```typescript
/**
 * Register a callback for when a non-leader tab requests a sync.
 * Only fires on the leader tab (debounced 500ms).
 */
onSyncRequested(callback: () => void): () => void {
  this.onSyncRequestedCallbacks.add(callback);
  return () => { this.onSyncRequestedCallbacks.delete(callback); };
}

/**
 * Register a callback for when a pull is requested (after push completes).
 * Fires on all tabs.
 */
onPullRequested(callback: () => void): () => void {
  this.onPullRequestedCallbacks.add(callback);
  return () => { this.onPullRequestedCallbacks.delete(callback); };
}

/**
 * Broadcast a pull request to all tabs.
 */
broadcastPullRequest(): void {
  if (this.isDestroyed || !this.channel) return;
  this.channel.postMessage({
    type: 'pull_request',
    tabId: this.tabId,
  } satisfies SyncMessage);
}
```

Update `destroy()` to clean up:

```typescript
this.onSyncRequestedCallbacks.clear();
this.onPullRequestedCallbacks.clear();
if (this.syncRequestDebounce) {
  clearTimeout(this.syncRequestDebounce);
  this.syncRequestDebounce = null;
}
```

Add module-level helper:

```typescript
export function broadcastPullRequest(): void {
  getTabCoordinator()?.broadcastPullRequest();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run app/lib/sync/__tests__/tabCoordinator.test.ts`
Expected: PASS

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add app/lib/sync/tabCoordinator.ts app/lib/sync/__tests__/tabCoordinator.test.ts
git commit -m "feat: wire up sync_request handler, add pull_request broadcast and callback registration to TabCoordinator"
```

---

## Chunk 4: SyncWorker — watermark updates, pull broadcast, sync_request callback

### Task 6: SyncWorker — update watermarks after push, broadcast pull_request, register sync_request callback

**Files:**

- Modify: `app/lib/sync/SyncWorker.ts`
- Modify: `app/lib/sync/__tests__/SyncWorker.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `app/lib/sync/__tests__/SyncWorker.test.ts`:

```typescript
// Add these mocks at the top, alongside existing mocks:
const mockUpdateWatermarks = vi.fn().mockResolvedValue(undefined);
const mockBroadcastPullRequest = vi.fn();
const mockOnSyncRequested = vi.fn((cb: () => void): (() => void) => {
  return vi.fn();
});

// Update the localDb mock to include updateWatermarks:
// In the vi.mock('@/app/lib/localDb', ...) block, add:
//   updateWatermarks: (...args: unknown[]) => mockUpdateWatermarks(...args),

// Update the tabCoordinator mock to include new functions:
// In the vi.mock('@/app/lib/sync/tabCoordinator', ...) block, add:
//   broadcastPullRequest: () => mockBroadcastPullRequest(),
// And update getTabCoordinator mock to include:
//   onSyncRequested: mockOnSyncRequested,

// Then add these test cases inside the describe('SyncWorker') block:

describe('watermark updates after sync', () => {
  it('updates watermarks when API returns versions', async () => {
    localDb.getPendingSyncOperations.mockResolvedValue([
      {
        id: 1,
        table: 'user_set_parts',
        operation: 'upsert',
        payload: {
          set_num: '75192-1',
          part_num: '3001',
          color_id: 11,
          is_spare: false,
          owned_quantity: 3,
        },
        clientId: 'c1',
        userId: 'user-1',
        createdAt: Date.now(),
        retryCount: 0,
        lastError: null,
      },
    ]);

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          success: true,
          processed: 1,
          versions: { '75192-1': 42 },
        }),
    });

    worker = new SyncWorker();
    const initPromise = worker.init();
    await vi.advanceTimersByTimeAsync(0);
    await initPromise;
    await worker.setUserId('user-1');
    await flushPromises();

    expect(mockUpdateWatermarks).toHaveBeenCalledWith('user-1', {
      '75192-1': 42,
    });
  });

  it('broadcasts pull_request after confirmed sync', async () => {
    localDb.getPendingSyncOperations.mockResolvedValue([
      {
        id: 1,
        table: 'user_set_parts',
        operation: 'upsert',
        payload: {
          set_num: '75192-1',
          part_num: '3001',
          color_id: 11,
          is_spare: false,
          owned_quantity: 3,
        },
        clientId: 'c1',
        userId: 'user-1',
        createdAt: Date.now(),
        retryCount: 0,
        lastError: null,
      },
    ]);

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, processed: 1 }),
    });

    worker = new SyncWorker();
    const initPromise = worker.init();
    await vi.advanceTimersByTimeAsync(0);
    await initPromise;
    await worker.setUserId('user-1');
    await flushPromises();

    expect(mockBroadcastPullRequest).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run app/lib/sync/__tests__/SyncWorker.test.ts`
Expected: FAIL — watermarks not updated, pull_request not broadcast.

- [ ] **Step 3: Implement SyncWorker changes**

Modify: `app/lib/sync/SyncWorker.ts`

Add imports:

```typescript
import { updateWatermarks } from '@/app/lib/localDb';
import { broadcastPullRequest } from '@/app/lib/sync/tabCoordinator';
```

Add a new private field for cleanup:

```typescript
private syncRequestUnsubscribe: (() => void) | null = null;
```

Update the response type cast in `performSync()` (around line 235) to include `versions`:

```typescript
const result = (await response.json()) as {
  success: boolean;
  processed: number;
  failed?: Array<{ id: number; error: string }>;
  versions?: Record<string, number>;
};
```

After the `removeSyncOperations` and `markSyncOperationFailed` blocks, add watermark update:

```typescript
// Update local watermarks from server response
if (result.versions && this.userId) {
  await updateWatermarks(this.userId, result.versions);
}
```

After the `notifySyncComplete` call in the non-beacon success path, add pull broadcast:

```typescript
// Notify all tabs to pull updated data
broadcastPullRequest();
```

In `onVisibilityChange()`, add a pull broadcast when becoming visible even if no pending operations (the common refresh-on-focus case):

```typescript
private onVisibilityChange(): void {
  if (this.isDestroyed || !this.userId) return;

  if (document.visibilityState === 'visible') {
    void this.performSync();
    // Always broadcast pull_request on focus — even if nothing to push,
    // other devices may have made changes we need to pull.
    broadcastPullRequest();
  } else if (document.visibilityState === 'hidden') {
    void this.performSync({ keepalive: true });
  }
}
```

In `subscribeToLeader()`, register the sync_request callback:

```typescript
this.syncRequestUnsubscribe = coordinator.onSyncRequested(() => {
  if (!this.isDestroyed && this.userId) {
    void this.performSync();
  }
});
```

In `destroy()`, clean up the subscription:

```typescript
if (this.syncRequestUnsubscribe) {
  this.syncRequestUnsubscribe();
  this.syncRequestUnsubscribe = null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run app/lib/sync/__tests__/SyncWorker.test.ts`
Expected: PASS (including existing tests — no regressions).

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add app/lib/sync/SyncWorker.ts app/lib/sync/__tests__/SyncWorker.test.ts
git commit -m "feat: SyncWorker updates watermarks after push, broadcasts pull_request, handles sync_request from non-leader tabs"
```

---

## Chunk 5: Pull Path — delta pull replacing LWW

### Task 7: useSupabaseOwned — replace LWW with delta pull, add pull listener

**Files:**

- Modify: `app/hooks/useSupabaseOwned.ts`

- [ ] **Step 1: Study the existing hydration effect**

Read: `app/hooks/useSupabaseOwned.ts` lines 255-380

The existing effect:

1. Paginates all `user_set_parts` rows for (userId, setNumber)
2. Builds `supabaseByKey` map with timestamps
3. Filters keys not in current inventory
4. Reads IndexedDB timestamps via `exportOwnedWithTimestamps`
5. Per-key LWW comparison
6. Enqueues local-only keys for upload

- [ ] **Step 2: Add new imports and replace the hydration effect with delta pull**

Add imports (replacing the `exportOwnedWithTimestamps` import):

```typescript
import {
  getWatermark,
  setWatermark as setWatermarkFn,
} from '@/app/lib/localDb/watermarkStore';
import { getOwnedForSet } from '@/app/lib/localDb/ownedStore';
import { getTabCoordinator } from '@/app/lib/sync/tabCoordinator';
```

The new hydration effect:

```typescript
// Delta pull: fetch only rows changed since our last watermark
useEffect(() => {
  if (
    !enableCloudSync ||
    !userId ||
    rows.length === 0 ||
    !isOwnedHydrated ||
    hydrated
  ) {
    return;
  }

  let cancelled = false;
  const abortController = new AbortController();
  const timeoutId = window.setTimeout(() => abortController.abort(), 10_000);

  async function run() {
    const supabase = getSupabaseBrowserClient();
    const watermark = await getWatermark(userId as string, setNumber);
    if (cancelled) return;

    // Fetch rows with sync_version > watermark
    // Note: Supabase default limit is 1000 rows. For first pull (watermark=0),
    // large sets could exceed this. Add .limit(10000) to be safe — no set has
    // more than ~5000 non-spare parts. For delta pulls, result set is tiny.
    const { data, error } = await supabase
      .from('user_set_parts')
      .select('part_num, color_id, is_spare, owned_quantity, sync_version')
      .eq('user_id', userId as string)
      .eq('set_num', setNumber)
      .eq('is_spare', false)
      .gt('sync_version', watermark)
      .limit(10000)
      .abortSignal(abortController.signal);

    if (cancelled) return;

    if (error) {
      console.error('Delta pull failed', { setNumber, error: error.message });
      return;
    }

    const inventoryKeySet = new Set(keys);
    let maxVersion = watermark;

    for (const row of data ?? []) {
      const key = `${row.part_num}:${row.color_id}`;
      if (!inventoryKeySet.has(key)) continue;

      setOwned(setNumber, key, row.owned_quantity ?? 0);

      const version = Number(row.sync_version);
      if (version > maxVersion) {
        maxVersion = version;
      }
    }

    // Update watermark
    if (maxVersion > watermark) {
      await setWatermarkFn(userId as string, setNumber, maxVersion);
    }

    // First pull (watermark === 0): enqueue local-only keys for upload
    if (watermark === 0) {
      const localData = await getOwnedForSet(setNumber);
      if (cancelled) return;

      const cloudKeys = new Set(
        (data ?? []).map(r => `${r.part_num}:${r.color_id}`)
      );
      for (const [key, qty] of Object.entries(localData)) {
        if (!cloudKeys.has(key) && qty > 0) {
          enqueueChange(key, qty);
        }
      }
    }

    setHydrated(true);
  }

  void run();

  return () => {
    cancelled = true;
    abortController.abort();
    window.clearTimeout(timeoutId);
  };
}, [
  enableCloudSync,
  userId,
  rows.length,
  keys,
  setOwned,
  setNumber,
  hydrated,
  isOwnedHydrated,
  enqueueChange,
]);
```

Remove the old `exportOwnedWithTimestamps` import (already replaced by imports in Step 2 above).

- [ ] **Step 3: Add pull listener for refresh-on-focus**

Add a `useEffect` that subscribes to `onPullRequested` from TabCoordinator:

```typescript
// Re-pull on focus / sync_complete / pull_request
useEffect(() => {
  if (!enableCloudSync || !userId || rows.length === 0) return;

  const coordinator = getTabCoordinator();
  if (!coordinator) return;

  const doPull = async () => {
    const supabase = getSupabaseBrowserClient();
    const watermark = await getWatermark(userId, setNumber);
    const { data } = await supabase
      .from('user_set_parts')
      .select('part_num, color_id, is_spare, owned_quantity, sync_version')
      .eq('user_id', userId)
      .eq('set_num', setNumber)
      .eq('is_spare', false)
      .gt('sync_version', watermark)
      .limit(10000);

    if (!data || data.length === 0) return;

    const inventoryKeySet = new Set(keys);
    let maxVersion = watermark;

    for (const row of data) {
      const key = `${row.part_num}:${row.color_id}`;
      if (!inventoryKeySet.has(key)) continue;

      setOwned(setNumber, key, row.owned_quantity ?? 0);

      const version = Number(row.sync_version);
      if (version > maxVersion) maxVersion = version;
    }

    if (maxVersion > watermark) {
      await setWatermarkFn(userId, setNumber, maxVersion);
    }
  };

  const unsub = coordinator.onPullRequested(() => {
    void doPull();
  });

  return unsub;
}, [enableCloudSync, userId, rows.length, keys, setOwned, setNumber]);
```

- [ ] **Step 4: Extract shared delta pull logic into a helper**

The delta pull logic is duplicated between the hydration effect and the pull listener. Extract into a local function `performDeltaPull(watermark: number, signal?: AbortSignal)` at the top of the hook to keep it DRY.

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 6: Verify existing tests still pass**

Run: `npm test -- --run`
Expected: All tests pass. Some tests for useSupabaseOwned may need updating if they mock `exportOwnedWithTimestamps`.

- [ ] **Step 7: Commit**

```bash
git add app/hooks/useSupabaseOwned.ts
git commit -m "feat: replace LWW reconciliation with delta pull using sync_version watermarks"
```

---

### Task 8: Remove dead code — exportOwnedWithTimestamps

**Files:**

- Modify: `app/lib/localDb/ownedStore.ts`
- Modify: `app/hooks/useSupabaseOwned.ts` (verify import removed)

- [ ] **Step 1: Verify no other callers**

Run: `grep -r 'exportOwnedWithTimestamps' --include='*.ts' --include='*.tsx'`
Expected: Only `ownedStore.ts` (definition) and `useSupabaseOwned.ts` (import, already removed in Task 7).

- [ ] **Step 2: Remove the function from ownedStore.ts**

Delete the `exportOwnedWithTimestamps` function (lines 396-421 of `ownedStore.ts`).

- [ ] **Step 3: Verify no import remains in useSupabaseOwned.ts**

Confirm the import was removed in Task 7.

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add app/lib/localDb/ownedStore.ts app/hooks/useSupabaseOwned.ts
git commit -m "chore: remove exportOwnedWithTimestamps (replaced by delta pull)"
```

---

## Chunk 6: Sync Status Indicator

### Task 9: SyncIndicator floating pill component

**Files:**

- Create: `app/components/ui/SyncIndicator.tsx`
- Modify: `app/components/providers/sync-provider.tsx`

- [ ] **Step 1: Create the SyncIndicator component**

Create: `app/components/ui/SyncIndicator.tsx`

```typescript
'use client';

import { useSyncStatus } from '@/app/components/providers/sync-provider';
import { useEntitlements } from '@/app/components/providers/entitlements-provider';
import { useSupabaseUser } from '@/app/hooks/useSupabaseUser';
import { useEffect, useRef, useState } from 'react';

type IndicatorState = 'hidden' | 'syncing' | 'synced' | 'pending' | 'error';

export function SyncIndicator() {
  const { user } = useSupabaseUser();
  const { hasFeature } = useEntitlements();
  const sync = useSyncStatus();
  const [state, setState] = useState<IndicatorState>('hidden');
  const [visible, setVisible] = useState(false);
  const prevSyncingRef = useRef(false);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout>>();

  // Extract values (may be null if outside provider or not Plus)
  const isSyncing = sync?.isSyncing ?? false;
  const pendingSyncCount = sync?.pendingSyncCount ?? 0;
  const lastSyncError = sync?.lastSyncError ?? null;
  const syncNow = sync?.syncNow;
  const shouldShow = !!user && hasFeature('sync.cloud') && !!sync;

  // Derive indicator state — hooks MUST be called unconditionally
  useEffect(() => {
    if (!shouldShow) {
      setState('hidden');
      setVisible(false);
      return;
    }

    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = undefined;
    }

    if (lastSyncError) {
      setState('error');
      setVisible(true);
    } else if (isSyncing) {
      setState('syncing');
      setVisible(true);
      prevSyncingRef.current = true;
    } else if (prevSyncingRef.current) {
      // Just finished syncing — show "Synced" briefly
      prevSyncingRef.current = false;
      setState('synced');
      setVisible(true);
      dismissTimerRef.current = setTimeout(() => {
        setVisible(false);
      }, 1500);
    } else if (pendingSyncCount > 0) {
      setState('pending');
      setVisible(true);
    } else {
      setState('hidden');
      setVisible(false);
    }

    return () => {
      if (dismissTimerRef.current) {
        clearTimeout(dismissTimerRef.current);
      }
    };
  }, [shouldShow, isSyncing, pendingSyncCount, lastSyncError]);

  // Gate: only render for authenticated Plus users
  if (!shouldShow || !visible) return null;

  const handleClick = () => {
    if ((state === 'error' || state === 'pending') && syncNow) {
      void syncNow();
    }
  };

  return (
    <div
      role="status"
      aria-live="polite"
      onClick={handleClick}
      className={`
        fixed bottom-20 right-4 z-50
        flex items-center gap-2 rounded-full px-3 py-1.5
        text-sm font-medium shadow-lg
        transition-all duration-300 ease-out
        ${state === 'error'
          ? 'bg-red-100 text-red-800 dark:bg-red-900/80 dark:text-red-200 cursor-pointer'
          : state === 'pending'
            ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/80 dark:text-amber-200 cursor-pointer'
            : state === 'synced'
              ? 'bg-green-100 text-green-800 dark:bg-green-900/80 dark:text-green-200'
              : 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200'
        }
        ${visible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'}
      `}
    >
      {state === 'syncing' && (
        <>
          <SyncingIcon />
          <span>Syncing...</span>
        </>
      )}
      {state === 'synced' && (
        <>
          <CheckIcon />
          <span>Synced</span>
        </>
      )}
      {state === 'pending' && (
        <>
          <CloudIcon />
          <span>{pendingSyncCount}</span>
        </>
      )}
      {state === 'error' && (
        <>
          <WarningIcon />
          <span>Sync failed</span>
        </>
      )}
    </div>
  );
}

function SyncingIcon() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function CloudIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
    </svg>
  );
}

function WarningIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  );
}
```

- [ ] **Step 2: Mount SyncIndicator in sync-provider.tsx**

Modify: `app/components/providers/sync-provider.tsx`

Add import and render:

```typescript
import { SyncIndicator } from '@/app/components/ui/SyncIndicator';
```

In the return, add `<SyncIndicator />` after `{children}`:

```tsx
return (
  <SyncContext.Provider value={{ ...status, syncNow }}>
    {children}
    <SyncIndicator />
  </SyncContext.Provider>
);
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Manual verification**

Open the app in dev, log in as a Plus user, make a change to a part. Verify:

- "Syncing..." pill appears briefly
- Transitions to "Synced" checkmark
- Fades out after ~1.5s
- If you disconnect network and make a change, "Pending" with count appears
- Reconnect: syncs and shows lifecycle

- [ ] **Step 5: Commit**

```bash
git add app/components/ui/SyncIndicator.tsx app/components/providers/sync-provider.tsx
git commit -m "feat: add SyncIndicator floating pill for sync status visibility"
```

---

## Chunk 7: Integration Testing & Cleanup

### Task 10: End-to-end verification and formatting

**Files:**

- All modified files

- [ ] **Step 1: Run full test suite**

Run: `npm test -- --run`
Expected: All tests pass.

- [ ] **Step 2: Type-check entire project**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Lint and format**

Run: `npm run format`
Expected: Clean output.

- [ ] **Step 4: Run format check**

Run: `npm run format:check`
Expected: No formatting issues.

- [ ] **Step 5: Commit any formatting fixes**

```bash
# Stage only files modified in this feature
git add app/ supabase/
git commit -m "chore: format and lint sync overhaul changes"
```

---

### Task 11: Update project memory and backlog

**Files:**

- Modify: `memory/active-context.md`
- Modify: `docs/BACKLOG.md`

- [ ] **Step 1: Update active-context.md**

Add sync overhaul completion summary.

- [ ] **Step 2: Update BACKLOG.md**

Mark "Multi-Device Sync" tasks as complete. Add any follow-up items discovered during implementation (e.g., batch pull optimization for many open tabs).

- [ ] **Step 3: Commit**

```bash
git add memory/active-context.md docs/BACKLOG.md
git commit -m "docs: update memory bank and backlog for sync overhaul completion"
```
