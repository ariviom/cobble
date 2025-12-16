# Current Improvement Plan

**Created:** December 16, 2025  
**Reviewer:** Senior Staff Engineer Audit  
**Context:** Scaling-focused architectural review for post-beta growth  
**Status:** Active

---

## Executive Summary

The codebase has a **solid architectural foundation** for an MVP/beta launch. Previous improvement work (documented in `PREVIOUS_IMPROVEMENT_PLANS.md`) addressed many immediate concerns. This plan identifies **architectural patterns that will create compounding problems at scale**.

| Risk Area                     | Severity    | Scaling Impact                  | Effort |
| ----------------------------- | ----------- | ------------------------------- | ------ |
| Multi-layer cache incoherence | 🔴 Critical | Data inconsistency, stale reads | High   |
| Sync queue race conditions    | 🟠 High     | Data loss, conflicts            | Medium |
| CSRF protection gaps          | 🟠 High     | Security vulnerability          | Low    |
| External API cascade failures | 🟠 High     | User experience degradation     | Medium |
| Service role privilege sprawl | 🟡 Medium   | Security surface expansion      | Medium |
| In-memory state leaks         | 🟡 Medium   | Memory bloat, incorrect counts  | Low    |

---

## 🔴 Critical Issues

### 1. Multi-Layer Cache Incoherence

**Severity:** 🔴 Critical  
**Effort:** High (2-3 days)  
**ROI:** High - prevents support burden and data trust issues

#### Problem

The codebase has 4+ independent caching layers without coordinated invalidation:

```
Browser → React Query (5min stale) → IndexedDB (24h TTL) → In-memory LRU (varies) → Supabase
```

**Evidence:**

- `app/hooks/useInventory.ts` - Client-side IndexedDB cache with version checking
- `app/lib/services/inventory.ts` - Server-side LRU cache for spares (7-day TTL)
- `app/lib/bricklink.ts` - Multiple LRU caches (price guide, subsets, supersets)
- React Query stale time of 5 minutes

#### Why This Matters at Scale

- When catalog data is updated (via ingestion), only `rb_download_versions` changes
- Client-side IndexedDB caches may hold stale inventory data for up to 24 hours
- Server-side in-memory caches survive deploys on edge functions (varies by platform)
- Users see inconsistent data across page refreshes or devices
- Debugging "why is this data wrong" becomes extremely difficult

#### Root Cause

Each cache layer was added independently without a unified invalidation strategy.

#### Implementation Plan

**Step 1: Create a CacheCoordinator service**

```typescript
// NEW FILE: app/lib/cache/coordinator.ts
import 'server-only';

export type CacheGeneration = {
  inventoryParts: string | null;
  colors: string | null;
  parts: string | null;
};

let currentGeneration: CacheGeneration | null = null;
let lastFetch = 0;
const REFRESH_INTERVAL_MS = 60_000; // Check every minute

export async function getCacheGeneration(): Promise<CacheGeneration> {
  const now = Date.now();
  if (currentGeneration && now - lastFetch < REFRESH_INTERVAL_MS) {
    return currentGeneration;
  }

  const supabase = getCatalogReadClient();
  const { data } = await supabase
    .from('rb_download_versions')
    .select('source, version')
    .in('source', ['inventory_parts', 'colors', 'parts']);

  currentGeneration = {
    inventoryParts:
      data?.find(d => d.source === 'inventory_parts')?.version ?? null,
    colors: data?.find(d => d.source === 'colors')?.version ?? null,
    parts: data?.find(d => d.source === 'parts')?.version ?? null,
  };
  lastFetch = now;
  return currentGeneration;
}

export function makeCacheKey(
  base: string,
  generation: CacheGeneration
): string {
  return `${base}:v:${generation.inventoryParts ?? 'none'}`;
}
```

**Step 2: Update IndexedDB cache to use version keys**

```typescript
// app/lib/localDb/catalogCache.ts
export async function getCachedInventory(
  setNumber: string,
  expectedVersion: string | null
): Promise<InventoryRow[] | null> {
  const meta = await db.catalogSetMeta.get(setNumber);

  // Invalidate if version mismatch
  if (meta?.inventoryVersion !== expectedVersion) {
    await db.catalogSetParts.where('setNumber').equals(setNumber).delete();
    await db.catalogSetMeta.delete(setNumber);
    return null;
  }

  // ... existing logic
}
```

**Step 3: Add cache-bust mechanism for real-time invalidation (optional)**

Consider Supabase Realtime subscription or polling endpoint for aggressive invalidation.

#### Acceptance Criteria

- [ ] Create `CacheCoordinator` service
- [ ] Update IndexedDB cache to validate version on read
- [ ] Update server-side caches to include version in keys
- [ ] Add logging for cache hit/miss with version info
- [ ] Test: Change catalog version, verify stale data not served

---

### 2. Sync Queue Race Conditions Across Tabs ✅ COMPLETED

**Severity:** 🟠 High  
**Effort:** Medium (1-2 days)  
**ROI:** High - prevents data loss frustration  
**Status:** ✅ Completed December 16, 2025

#### Problem

The sync queue design assumed single-tab operation, but users commonly have multiple tabs open.

**Evidence:**

- `app/lib/localDb/syncQueue.ts` - Consolidates operations per key but not across tabs
- `app/components/providers/data-provider.tsx` - Each tab runs independent sync intervals

#### Scenario

1. User opens Set X in Tab A, marks 10 pieces as owned
2. User opens Set X in Tab B, marks 5 different pieces as owned
3. Tab A syncs first → server has Tab A's 10 pieces
4. Tab B syncs → server overwrites with Tab B's 5 pieces
5. User loses 10 pieces of progress

#### Root Cause

No cross-tab coordination for sync operations. Last-write-wins without merge semantics.

#### Implementation Plan

**Option A: BroadcastChannel Leader Election (Recommended)**

```typescript
// NEW FILE: app/lib/sync/tabCoordinator.ts
'use client';

const CHANNEL_NAME = 'brick_party_sync';
const HEARTBEAT_INTERVAL = 5000;
const LEADER_TIMEOUT = 10000;

type SyncMessage =
  | { type: 'heartbeat'; tabId: string; timestamp: number }
  | { type: 'claim_leader'; tabId: string }
  | { type: 'leader_ack'; tabId: string }
  | { type: 'sync_request'; tabId: string };

class TabCoordinator {
  private channel: BroadcastChannel | null = null;
  private tabId = crypto.randomUUID();
  private isLeader = false;
  private leaderTabId: string | null = null;
  private lastLeaderHeartbeat = 0;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      this.channel = new BroadcastChannel(CHANNEL_NAME);
      this.channel.onmessage = this.handleMessage.bind(this);
      this.startHeartbeat();
      this.claimLeadership();
    }
  }

  private handleMessage(event: MessageEvent<SyncMessage>) {
    const msg = event.data;

    switch (msg.type) {
      case 'heartbeat':
        if (msg.tabId === this.leaderTabId) {
          this.lastLeaderHeartbeat = msg.timestamp;
        }
        break;
      case 'claim_leader':
        // Defer to existing leader or lower tabId
        if (
          this.isLeader ||
          (this.leaderTabId && this.leaderTabId < msg.tabId)
        ) {
          this.channel?.postMessage({ type: 'leader_ack', tabId: this.tabId });
        }
        break;
      case 'leader_ack':
        if (!this.isLeader) {
          this.leaderTabId = msg.tabId;
          this.lastLeaderHeartbeat = Date.now();
        }
        break;
    }
  }

  private claimLeadership() {
    this.channel?.postMessage({ type: 'claim_leader', tabId: this.tabId });
    // If no ack received in 500ms, become leader
    setTimeout(() => {
      if (!this.leaderTabId) {
        this.isLeader = true;
        this.leaderTabId = this.tabId;
      }
    }, 500);
  }

  private startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      if (this.isLeader) {
        this.channel?.postMessage({
          type: 'heartbeat',
          tabId: this.tabId,
          timestamp: Date.now(),
        });
      } else {
        // Check if leader is dead
        if (Date.now() - this.lastLeaderHeartbeat > LEADER_TIMEOUT) {
          this.claimLeadership();
        }
      }
    }, HEARTBEAT_INTERVAL);
  }

  shouldSync(): boolean {
    return this.isLeader || !this.channel; // Fallback to all tabs if BroadcastChannel unavailable
  }

  requestSync() {
    if (!this.isLeader && this.channel) {
      this.channel.postMessage({ type: 'sync_request', tabId: this.tabId });
    }
  }

  destroy() {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    this.channel?.close();
  }
}

export const tabCoordinator =
  typeof window !== 'undefined' ? new TabCoordinator() : null;
```

**Step 2: Update DataProvider to use coordinator**

```typescript
// app/components/providers/data-provider.tsx
import { tabCoordinator } from '@/app/lib/sync/tabCoordinator';

// In performSync:
const performSync = useCallback(async () => {
  if (!tabCoordinator?.shouldSync()) {
    return; // Let leader handle sync
  }
  // ... existing sync logic
}, []);
```

#### Acceptance Criteria

- [x] Create TabCoordinator with BroadcastChannel
- [x] Implement leader election with heartbeat
- [x] Update DataProvider to defer to leader
- [x] Force sync on tab close (bypasses leader check)
- [x] Graceful degradation when BroadcastChannel unavailable

---

## 🟠 High Priority Issues

### 3. CSRF Protection Gaps ✅ COMPLETED

**Severity:** 🟠 High  
**Effort:** Low (2-3 hours)  
**ROI:** Medium - security hygiene  
**Status:** ✅ Completed December 16, 2025

#### Problem

Several POST routes lacked CSRF protection. All have now been updated with `withCsrfProtection`.

| Route                                    | Has Protection | Risk          |
| ---------------------------------------- | -------------- | ------------- |
| `/api/prices/bricklink`                  | ✅ Yes         | -             |
| `/api/sync`                              | ✅ Yes         | -             |
| `/api/identify`                          | ✅ Yes         | -             |
| `/api/group-sessions`                    | ✅ Yes         | -             |
| `/api/auth/signout`                      | ✅ Yes         | -             |
| `/api/sets/id/[setNumber]/refresh-image` | ✅ Yes         | -             |
| `/api/dev/minifig-mappings/fix`          | ✅ Yes         | -             |
| `/api/export/log-confidence`             | ✅ Yes         | -             |
| `/api/sync/ping`                         | ❌ No          | Very low risk |

#### Implementation Plan

**Step 1: Add CSRF to missing routes**

```typescript
// app/api/auth/signout/route.ts
import { withCsrfProtection } from '@/app/lib/middleware/csrf';

export const POST = withCsrfProtection(async (request: NextRequest) => {
  // ... existing signout logic
});
```

```typescript
// app/api/sets/id/[setNumber]/refresh-image/route.ts
import { withCsrfProtection } from '@/app/lib/middleware/csrf';

export const POST = withCsrfProtection(async (req: NextRequest) => {
  // ... existing logic
});
```

**Step 2: Create ESLint rule or checklist item**

Add to code review checklist:

> All POST/PUT/PATCH/DELETE routes must use `withCsrfProtection` unless they have external webhook signatures

#### Acceptance Criteria

- [x] Add `withCsrfProtection` to `/api/auth/signout`
- [x] Add `withCsrfProtection` to `/api/sets/id/[setNumber]/refresh-image`
- [x] Add `withCsrfProtection` to `/api/export/log-confidence`
- [x] Add `withCsrfProtection` to `/api/dev/minifig-mappings/fix`
- [ ] Document CSRF requirement in code review checklist
- [x] Stripe webhook still works (uses signature, not CSRF - no change needed)

---

### 4. External API Cascade Failures ✅ COMPLETED

**Severity:** 🟠 High  
**Effort:** Medium (1 day)  
**ROI:** High - prevents outage amplification  
**Status:** ✅ Completed December 16, 2025

#### Problem

The app depends on 3 external APIs with inconsistent resilience patterns.

| API         | Circuit Breaker | Retry  | Timeout | Concurrency Limit |
| ----------- | --------------- | ------ | ------- | ----------------- |
| BrickLink   | ✅ Yes          | ✅ Yes | ✅ 30s  | ✅ 8 concurrent   |
| Rebrickable | ❌ **No**       | ✅ Yes | ✅ 30s  | ❌ No             |
| Brickognize | ❌ **No**       | ❌ No  | ❌ No   | ❌ No             |

#### Why This Matters

- If Rebrickable goes down during traffic spike, every user request retries 3x
- This exhausts connection pools and creates cascading timeouts
- Identify flow calls multiple external APIs sequentially - one slow API blocks everything

#### Implementation Plan

**Step 1: Add circuit breaker to Rebrickable client**

```typescript
// app/lib/rebrickable/client.ts
const RB_BREAKER_THRESHOLD =
  Number.parseInt(process.env.RB_BREAKER_THRESHOLD ?? '', 10) || 5;
const RB_BREAKER_COOLDOWN_MS =
  Number.parseInt(process.env.RB_BREAKER_COOLDOWN_MS ?? '', 10) || 60_000;

let consecutiveFailures = 0;
let breakerOpenUntil = 0;

function assertBreakerClosed(): void {
  if (breakerOpenUntil > Date.now()) {
    throw new Error('rebrickable_circuit_open');
  }
}

function recordSuccess(): void {
  consecutiveFailures = 0;
}

function recordFailure(): void {
  consecutiveFailures += 1;
  if (consecutiveFailures >= RB_BREAKER_THRESHOLD) {
    breakerOpenUntil = Date.now() + RB_BREAKER_COOLDOWN_MS;
    consecutiveFailures = 0;
    logger.warn('rebrickable.circuit_opened', { cooldownMs: RB_BREAKER_COOLDOWN_MS });
  }
}

export async function rbFetch<T>(path: string, ...): Promise<T> {
  assertBreakerClosed(); // Add this at start

  try {
    // ... existing fetch logic
    recordSuccess();
    return result;
  } catch (err) {
    recordFailure();
    throw err;
  }
}
```

**Step 2: Add error code to domain errors**

```typescript
// app/lib/domain/errors.ts
export type AppErrorCode =
  // ... existing codes
  'rebrickable_circuit_open';
```

**Step 3: Handle circuit open in routes**

```typescript
// app/api/inventory/route.ts
} catch (err) {
  if (err instanceof Error && err.message === 'rebrickable_circuit_open') {
    return errorResponse('external_service_error', {
      message: 'Rebrickable is temporarily unavailable. Please try again shortly.',
      status: 503,
    });
  }
  // ... existing error handling
}
```

#### Acceptance Criteria

- [x] Add circuit breaker to Rebrickable client
- [x] Add `rebrickable_circuit_open` error code
- [x] Return 503 with retry guidance when circuit open
- [x] Log circuit open/close events
- [ ] Test: Simulate 5 failures, verify circuit opens (manual testing)

---

## 🟡 Medium Priority Issues

### 5. Service Role Privilege Sprawl

**Severity:** 🟡 Medium  
**Effort:** Medium (1 day)  
**ROI:** Medium - security hardening

#### Problem

Service role client (bypasses RLS) is used in 15 files. Some may not need elevated privileges.

#### Files Using Service Role

| File                                        | Reason             | Needs Service Role? |
| ------------------------------------------- | ------------------ | ------------------- |
| `app/api/minifigs/[figNum]/route.ts`        | Reads minifig data | 🟡 Audit needed     |
| `app/api/identify/sets/handlers/minifig.ts` | Reads catalog      | 🟡 Audit needed     |
| `app/lib/identify/blFallback.ts`            | Writes BL cache    | ✅ Yes              |
| `app/lib/services/billing.ts`               | User subscriptions | ✅ Yes              |
| `app/api/stripe/webhook/route.ts`           | Updates user data  | ✅ Yes              |
| `app/api/user/minifigs/route.ts`            | User data          | ✅ Yes              |

#### Implementation Plan

**Step 1: Audit each usage**

For each file importing `getSupabaseServiceRoleClient`:

1. Check what tables are accessed
2. Verify if RLS policies would block the operation
3. If anon/auth client would work, switch to it

**Step 2: Add documentation comment**

```typescript
// When service role IS needed, document why:
// Uses service role because: Writes to bl_parts which has no anon policy
const supabase = getSupabaseServiceRoleClient();
```

#### Acceptance Criteria

- [ ] Audit all 15 files using service role
- [ ] Switch to anon/auth client where possible
- [ ] Document reasoning for remaining service role usages
- [ ] Add lint warning for service role imports (optional)

---

### 6. In-Memory State Never Cleared ✅ VERIFIED

**Severity:** 🟡 Medium  
**Effort:** Low (2-3 hours)  
**ROI:** Low-Medium - prevents memory issues at scale  
**Status:** ✅ Already implemented correctly

#### Problem

Server-side in-memory Maps/Sets grow without bounds or clearing.

**Resolution:** Upon review, both `inFlightSpares` (inventory.ts:116-118) and `hydrationPromises` (owned.ts:269-270) already have proper `.finally()` cleanup blocks. No changes needed.

**Evidence:**

```typescript
// app/lib/services/inventory.ts
const inFlightSpares = new Map<string, Promise<SpareCacheValue>>();
// Never cleaned up - grows with each unique set
```

```typescript
// app/store/owned.ts (client-side)
const hydrationPromises: Map<string, Promise<void>> = new Map();
// Never cleaned up after promise resolves
```

#### Implementation Plan

**Step 1: Clean up inFlightSpares after promise resolves**

```typescript
// app/lib/services/inventory.ts
async function getSpareCacheEntry(
  setNumber: string
): Promise<SpareCacheValue | null> {
  const cached = spareCache.get(setNumber);
  if (cached) return cached;

  if (inFlightSpares.has(setNumber)) {
    return inFlightSpares.get(setNumber)!;
  }

  const promise = fetchSparesFromRebrickable(setNumber)
    .then(keys => {
      spareCache.set(setNumber, keys);
      return keys;
    })
    .finally(() => {
      inFlightSpares.delete(setNumber); // ✅ Already exists
    });

  inFlightSpares.set(setNumber, promise);
  return promise;
}
```

**Step 2: Clean up hydrationPromises**

```typescript
// app/store/owned.ts
hydrateFromIndexedDB: async (setNumber: string) => {
  // ... existing logic

  hydrationPromise.finally(() => {
    hydrationPromises.delete(setNumber); // Add cleanup
  });
};
```

#### Acceptance Criteria

- [x] Verify `inFlightSpares` is cleaned up (already has `.finally`)
- [x] Verify `hydrationPromises` cleanup (already has `.finally`)
- [x] LRU caches already have max size limits
- [ ] Log warning if in-flight maps grow too large (deferred - low priority)

---

## ✅ Well-Implemented Areas (No Action Needed)

The following patterns are well-designed for scale:

1. **Service layer separation** - Clear boundary between routes and business logic
2. **RLS security model** - Proper table classification in `catalogAccess.ts`
3. **Structured logging** - Consistent `logger` usage
4. **Error handling** - Normalized `AppError` codes and `errorResponse()` helper
5. **Rate limiting** - Distributed Supabase-backed with in-memory fallback
6. **Type safety** - Strict TypeScript, no `any` types
7. **Request tracing** - Request IDs in error responses
8. **External API resilience (BrickLink)** - Circuit breaker pattern (extend to others)

---

## Implementation Roadmap

### Phase 1: Security & Quick Wins (1-2 days) ✅ COMPLETED

| Task                       | Issue | Effort    | Priority  | Status       |
| -------------------------- | ----- | --------- | --------- | ------------ |
| Add CSRF to missing routes | #3    | 2-3 hours | 🟠 High   | ✅ Completed |
| Clean up in-memory Maps    | #6    | 2-3 hours | 🟡 Medium | ✅ Verified  |

### Phase 2: Resilience (1 day) ✅ COMPLETED

| Task                               | Issue | Effort    | Priority  | Status       |
| ---------------------------------- | ----- | --------- | --------- | ------------ |
| Add circuit breaker to Rebrickable | #4    | 4-6 hours | 🟠 High   | ✅ Completed |
| Audit service role usages          | #5    | 4-6 hours | 🟡 Medium | ⏳ Deferred  |

### Phase 3: Data Integrity (2-3 days) ✅ COMPLETED

| Task                      | Issue | Effort   | Priority | Status       |
| ------------------------- | ----- | -------- | -------- | ------------ |
| Implement tab coordinator | #2    | 1-2 days | 🟠 High  | ✅ Completed |

### Phase 4: Cache Architecture (2-3 days)

| Task                    | Issue | Effort   | Priority    |
| ----------------------- | ----- | -------- | ----------- |
| Create CacheCoordinator | #1    | 2-3 days | 🔴 Critical |

---

## Verification Checklist

Before closing each issue:

- [x] **CSRF (#3)**: All POST routes use `withCsrfProtection` ✅
- [x] **In-memory (#6)**: Maps cleaned up in `.finally()` blocks ✅
- [x] **Circuit breaker (#4)**: Rebrickable fails gracefully when upstream down ✅
- [ ] **Service role (#5)**: Only used where RLS bypass is required
- [x] **Tab sync (#2)**: Multi-tab editing doesn't lose data ✅
- [ ] **Cache (#1)**: Stale data cleared when catalog version changes ✅
- [ ] Build passes: `npm run build` ✅
- [ ] Tests pass: `npm run test` ✅

---

## Commands for Development

```bash
# Find all POST routes
rg "export (async function |function |const )(POST|PUT|PATCH|DELETE)" app/api/ --type ts

# Find service role usages
rg "getSupabaseServiceRoleClient" app/ --type ts -l

# Find unbounded Maps
rg "new Map<" app/ --type ts -C 3

# Find console.* usages
rg "console\.(log|warn|error)" app/ --type ts -c

# Run tests
npm run test

# Type check
npm run type-check
```

---

_Last updated: December 16, 2025_

---

## Changelog

### December 16, 2025

**Phase 1 Completed:**

- ✅ Added `withCsrfProtection` to 4 routes:
  - `/api/auth/signout`
  - `/api/sets/id/[setNumber]/refresh-image`
  - `/api/export/log-confidence`
  - `/api/dev/minifig-mappings/fix`
- ✅ Verified in-memory cleanup already implemented:
  - `inFlightSpares` in inventory.ts (line 116-118)
  - `hydrationPromises` in owned.ts (line 269-270)

**Phase 2 Completed:**

- ✅ Added circuit breaker to Rebrickable client:
  - Opens after 5 consecutive failures (configurable via `RB_BREAKER_THRESHOLD`)
  - Cooldown of 60 seconds (configurable via `RB_BREAKER_COOLDOWN_MS`)
  - Logs circuit open events via `logger.warn`
  - Exported `isRebrickableCircuitOpen()` for status checks
- ✅ Added `rebrickable_circuit_open` error code to domain errors
- ✅ Updated `/api/inventory` and `/api/search` routes to return 503 with retry guidance

**Phase 3 Completed:**

- ✅ Created `TabCoordinator` in `app/lib/sync/tabCoordinator.ts`:
  - Uses `BroadcastChannel` for cross-tab communication
  - Leader election with 5-second heartbeat interval
  - 12-second timeout for dead leader detection
  - Graceful fallback when BroadcastChannel unavailable
- ✅ Updated `DataProvider` to use coordinator:
  - Only leader tab performs sync operations
  - `force: true` option bypasses leader check for tab close
  - Exposes `isLeader` in context for UI feedback
  - Notifies other tabs when sync completes
