# Sync Overhaul: Server-Versioned Delta Sync with Refresh-on-Focus

**Date:** 2026-03-12
**Status:** Approved

## Problem

Cross-device sync of owned part quantities is unreliable. Some sets sync correctly between devices, others do not. Root cause: the `user_set_parts.updated_at` column is never refreshed on upsert (no trigger, and the API omits it from the payload), making the timestamp-based last-write-wins (LWW) reconciliation produce incorrect results when the same part is edited from multiple devices.

Secondary issues: pull only runs once per page mount (no refresh-on-focus), non-leader tabs can't trigger immediate sync (30s worst-case delay), and there's no sync status visibility for users.

## Solution Overview

Replace timestamp-based LWW with server-managed monotonic version numbers. Each write to `user_set_parts` gets a `sync_version` from a Postgres sequence. Clients track a per-set watermark and pull only rows changed since their watermark. Add refresh-on-focus pulling, wire up cross-tab sync requests, and add a floating sync status indicator.

## Design

### 1. Database Changes

#### New sequence

```sql
CREATE SEQUENCE public.user_set_parts_sync_seq;
```

Global sequence across the table (not per-user or per-set). This gives a total ordering of all writes, enabling efficient `WHERE sync_version > N` queries.

#### New column

```sql
ALTER TABLE public.user_set_parts
  ADD COLUMN sync_version bigint NOT NULL DEFAULT 0;
```

#### Trigger

```sql
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
```

Every write (insert or update) gets a new monotonic `sync_version` and a fresh `updated_at`. This fixes the original `updated_at` bug as a side effect.

**Interaction with existing trigger:** The existing `trg_sync_user_parts_inventory` trigger (from `20260228000534_parts_infrastructure.sql`) is an `AFTER INSERT OR UPDATE OR DELETE` trigger that syncs aggregate quantities to `user_parts_inventory`. The new `trg_bump_sync_version` is a `BEFORE INSERT OR UPDATE` trigger. Postgres fires BEFORE triggers first, then AFTER triggers. The new trigger assigns `sync_version` and `updated_at` on `NEW`, then the existing AFTER trigger reads the committed row (with the new values) and updates the inventory aggregate. No conflict.

#### Backfill performance note

The `user_set_parts` table is currently small (early-stage product). The single-statement backfill is safe. If the table grows significantly before this migration is deployed, batch the backfill in chunks of 10,000 rows.

#### Index

```sql
CREATE INDEX user_set_parts_sync_version_idx
  ON public.user_set_parts (user_id, set_num, sync_version);
```

Supports the delta pull query pattern: `WHERE user_id = ? AND set_num = ? AND sync_version > ?`.

#### Backfill

Existing rows get `sync_version` from the sequence so that the first delta pull fetches them:

```sql
UPDATE public.user_set_parts
SET sync_version = nextval('public.user_set_parts_sync_seq')
WHERE sync_version = 0;
```

### 2. API Changes (`POST /api/sync`)

#### Request shape: unchanged

The existing sync queue format and Zod validation remain as-is.

#### Response shape: extended

```typescript
type SyncResponse = {
  success: boolean;
  processed: number;
  failed?: Array<{ id: number; error: string }>;
  versions?: Record<string, number>; // setNumber → max sync_version
};
```

After batch upsert, the API queries back the max `sync_version` per affected `set_num`. The Supabase JS client doesn't support `MAX()` aggregation natively, so use `supabase.rpc()` with a small helper function:

```sql
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
```

This is called after both the batch-success path and the per-row-fallback path (lines 216-246 of route.ts), once all upserts/deletes are complete. Returns the result as `versions` in the response.

**Implementation note:** The `versions` query runs after all upserts but before `update_found_count`. The `update_found_count` RPC only modifies `user_sets.found_count`, not `user_set_parts`, so it does not affect `sync_version` values.

For beacon (fire-and-forget) requests: no response is read, so watermarks are not updated. They catch up on the next confirmed sync or pull.

**sendBeacon and CSRF:** The `/api/sync` route uses `withCsrfProtection()`. Beacon requests cannot set custom headers, but the CSRF middleware (`app/lib/middleware/csrf.ts`) allows requests through when a valid `origin` header is present, which browsers include on beacon requests. This existing behavior is relied upon and should not be changed without updating the beacon path.

### 3. Push Path (SyncWorker)

#### After confirmed push

Update IndexedDB watermarks with the returned `versions` map. Each entry advances the watermark for that `(userId, setNumber)` pair.

#### Beacon path

Unchanged — fire-and-forget, queue entries retained, watermarks not updated. Next confirmed sync or pull reconciles naturally.

#### Existing queue mechanics

No changes to enqueue, dedup, retry, or batch logic. The queue stores operations; the server assigns versions via the trigger.

### 4. Pull Path (useSupabaseOwned)

#### Replace LWW with delta pull

Current flow (removed):

1. Fetch all rows for (userId, setNumber)
2. Export local timestamps from IndexedDB
3. Per-key timestamp comparison (cloud wins ties)

New flow:

1. Read watermark from IndexedDB `syncWatermarks` table (default 0)
2. Query: `user_set_parts WHERE user_id = ? AND set_num = ? AND sync_version > ? AND is_spare = false`
3. Apply returned rows to local state (definitionally newer — no comparison needed)
4. Update watermark to `max(sync_version)` from response

**Spare parts:** The delta pull query filters `is_spare = false`, same as the current LWW code (line 295 of useSupabaseOwned.ts). Spare parts are excluded from the owned tracking UI.

First pull (watermark = 0): fetches all rows, same volume as today.
Subsequent pulls: fetches only changed rows since last pull.

#### Local-only keys

Keys present in local IndexedDB but not in Supabase (watermark = 0 case) are still enqueued for upload, same as today. For watermark > 0 pulls, local-only keys are already in the sync queue from when they were created — no special handling needed.

#### Conflict resolution

No timestamp comparison. The server's `sync_version` is authoritative. If a row was updated on the server (by another device), the pull applies it. If the current device also has a pending edit for the same row, it's still in the sync queue and will be pushed, getting a newer `sync_version`. Last writer wins via monotonic sequence, not wall clocks.

### 5. Refresh-on-Focus

#### Trigger: browser tab becomes visible

1. SyncWorker pushes pending changes (existing behavior)
2. After confirmed push, broadcasts `pull_request` via TabCoordinator
3. All mounted set pages (all open app-level set tabs) fire delta pulls using their per-set watermarks
4. Sets with no changes since the watermark get empty responses

**Query cost:** If a user has N set tabs open, focus triggers N delta pull queries. Each query uses the per-set watermark index and returns only changed rows. For typical usage (2-5 open sets, 0-10 changed rows per set), this is negligible. If N grows large, a future optimization could batch into a single query with `set_num = ANY(...)` and `sync_version > MIN(watermarks)`, then distribute results client-side. Not needed for initial implementation.

#### Trigger: sync_complete broadcast

When the leader completes a push, it broadcasts `sync_complete`. All mounted set pages re-pull. This covers the case where a non-leader tab's changes are pushed by the leader — the leader's own set pages see the new data.

#### No polling

Pulls are event-driven: on mount, on focus, and on sync-complete. Between events, local state is trusted.

### 6. TabCoordinator Improvements

#### Wire up `sync_request`

Currently a stub (tabCoordinator.ts lines 115-120). The leader now responds by triggering a sync.

**Coupling mechanism:** TabCoordinator remains decoupled from SyncWorker. Instead, TabCoordinator exposes a new `onSyncRequested(callback)` registration method. SyncWorker registers a callback during `subscribeToLeader()` that calls `performSync()`. This follows the same pattern as the existing `onLeaderChange(callback)`.

```
Non-leader tab enqueues change
  → sends sync_request via BroadcastChannel
  → leader's TabCoordinator receives it
  → fires registered onSyncRequested callbacks (debounced 500ms)
  → SyncWorker.performSync() runs
  → leader broadcasts sync_complete
  → all set pages delta-pull
```

This eliminates the 30-second worst-case wait for non-leader tab changes.

#### New message type: `pull_request`

Broadcast after confirmed push or on visibility change. Set pages listen and trigger delta pulls.

**React hook wiring:** TabCoordinator exposes a new `onPullRequested(callback)` registration method. A new lightweight hook `useSyncPullListener(setNumber, pullFn)` subscribes to this in `useSupabaseOwned`. The hook registers/unregisters the callback on mount/unmount. When fired, it calls the delta pull function for its set. This keeps TabCoordinator framework-agnostic while giving React hooks a clean subscription point.

#### Debounce

Leader debounces `sync_request` handling with a 500ms window. Multiple rapid requests from non-leader tabs coalesce into a single `performSync()` call.

### 7. IndexedDB Schema

#### New table: `syncWatermarks`

```typescript
// Dexie schema addition
syncWatermarks: '&[userId+setNumber]';

interface SyncWatermark {
  userId: string;
  setNumber: string;
  lastSyncVersion: number;
}
```

Stores per-(user, set) watermarks. Keyed by compound index. Read on pull, updated after pull or confirmed push.

### 8. Sync Status Indicator

#### Component: `SyncIndicator`

A floating pill in the bottom-right corner, above the mobile nav bar.

#### States and visibility

| State   | Condition                             | Appearance                         | Behavior                                        |
| ------- | ------------------------------------- | ---------------------------------- | ----------------------------------------------- |
| Hidden  | `pending === 0 && !syncing && !error` | Not rendered                       | —                                               |
| Syncing | `isSyncing === true`                  | Animated cloud icon + "Syncing..." | Auto-dismisses when done                        |
| Synced  | Transition from syncing to idle       | Checkmark + "Synced"               | Shows 1.5s then fades out                       |
| Pending | `pending > 0 && !syncing`             | Cloud icon + count badge           | Tap triggers `syncNow()`                        |
| Error   | `lastSyncError !== null`              | Warning icon + "Sync failed"       | Persists until tapped (retries) or next success |

#### Transitions

Slide-up entrance, fade-out exit. Full lifecycle visible: Syncing → Synced → hidden.

#### Visibility gate

Only rendered for authenticated users with `sync.cloud` entitlement.

### 9. What Stays the Same

- **Sync queue**: enqueue, dedup, retry, batch logic
- **Microtask batching**: owned store → IndexedDB write scheduling
- **localStorage safety net**: unload persistence for pending writes
- **Leader election**: two-phase claim, heartbeat, timeout (except `sync_request` now handled)
- **Beacon strategy**: fire-and-forget on unload, watermarks catch up next session
- **Rate limiting**: existing per-user rate limit on `/api/sync`
- **`update_found_count` RPC**: still called after sync for affected sets

## Files to Create

- `supabase/migrations/YYYYMMDD_sync_version.sql` — column, sequence, trigger, RPC function, index, backfill
- `app/components/ui/SyncIndicator.tsx` — floating pill component

## Files to Modify

- `app/api/sync/route.ts` — call `get_max_sync_versions` RPC, return `versions` map in response
- `app/lib/sync/SyncWorker.ts` — update watermarks after push, broadcast pull_request on focus, register onSyncRequested callback
- `app/lib/sync/tabCoordinator.ts` — handle sync_request via callback, add pull_request message + onPullRequested/onSyncRequested registration, debounce sync_request
- `app/hooks/useSupabaseOwned.ts` — replace LWW with delta pull, subscribe to pull_request/sync_complete via TabCoordinator callbacks
- `app/lib/localDb/schema.ts` — add syncWatermarks table, bump DB version
- `app/lib/localDb/syncQueue.ts` — add watermark read/write/update helpers
- `app/components/providers/sync-provider.tsx` — mount SyncIndicator

## Dead Code to Remove

- `exportOwnedWithTimestamps()` in `app/lib/localDb/ownedStore.ts` — no longer needed after LWW removal (verify no other callers first)
- LWW reconciliation logic in `useSupabaseOwned.ts` — replaced by delta pull

## Testing Strategy

- **Unit tests**: watermark read/write, delta pull logic, sync_request debounce
- **Integration tests**: full push → watermark update → pull cycle
- **Migration test**: verify backfill populates sync_version for existing rows
- **Manual testing**: edit parts on device A, verify they appear on device B after tab focus
