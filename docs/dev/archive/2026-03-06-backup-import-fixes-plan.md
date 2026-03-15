# Backup & Import Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Complete all incomplete write-through paths, fix sync bugs, and make backup/restore/import fully functional end-to-end.

**Architecture:** Task 1 creates the IndexedDB CRUD layer for loose parts (foundation). Tasks 2-3 are standalone fixes. Tasks 4-8 wire up the UI flows using Task 1's functions. All client-side writes go to IndexedDB first; the existing SyncWorker push loop handles delivery to Supabase.

**Tech Stack:** Dexie (IndexedDB), Zustand, Supabase browser client, Vitest

**Branch:** Continue on `feat/backup-import` (already checked out).

---

## Context for Implementers

### Key Files (read these before starting)

- `app/lib/localDb/schema.ts` — Dexie v9 schema, `LocalLoosePart` type, `SyncQueueItem` type
- `app/lib/localDb/ownedStore.ts` — Pattern to follow: `setOwnedForSet`, `importOwnedFromRecord`, `clearOwnedForSet`
- `app/lib/localDb/syncQueue.ts` — `enqueueSyncOperation()`, `enqueueOwnedChange()` (pattern for consolidation), `clearSyncQueue()`
- `app/account/components/BackupImportTab.tsx` — Main UI component to modify (611 lines)
- `app/api/sync/route.ts` — Sync endpoint handling `user_loose_parts` operations
- `app/lib/sync/SyncWorker.ts` — Already table-agnostic push (reads all `syncQueue` items)
- `app/lib/export/backupExport.ts` — `assembleBackup()` and `downloadBackup()`
- `app/lib/import/brickPartyParser.ts` — `BrickPartyBackup` type (Zod schema)
- `app/store/user-sets.ts` — `hydrateFromSupabase()` merges (doesn't replace), `clearAllStatusesForSet()` per-set
- `app/hooks/useMinifigStatus.ts` — Minifig writes go direct to Supabase: `supabase.from('user_minifigs').upsert()`
- `app/components/home/UserCollectionOverview.tsx` — Collection page, parts count at line 768

### Patterns to Follow

- **IndexedDB writes:** Use `db.transaction('rw', db.tableName, async () => { ... })` — see `ownedStore.ts:77-113`
- **Sync enqueue:** Use `enqueueSyncOperation()` from `syncQueue.ts:22-43`. Payload shape for `user_loose_parts`: `{ part_num, color_id, loose_quantity }`
- **Supabase browser client:** `getSupabaseBrowserClient()` from `app/lib/supabaseClient`
- **Minifig writes:** Direct Supabase upsert: `supabase.from('user_minifigs').upsert({ user_id, fig_num, status: 'owned' }, { onConflict: 'user_id,fig_num' })`
- **List writes:** Direct Supabase: `supabase.from('user_lists')` and `supabase.from('user_list_items')`
- **Preferences:** `saveUserPricingPreferences()` from `app/lib/userPricingPreferences.ts`, `saveUserMinifigSyncPreferences()` from `app/lib/userMinifigSyncPreferences.ts`

### Important Constraints

- Supabase `.in()` queries: batch size ~200 (URL length limits)
- `null` = intentional absence, `undefined` = not loaded yet
- All authenticated users have Supabase access (free + Plus). "Plus" only means SyncWorker pushes owned parts.
- The SyncWorker is already table-agnostic for push — it reads ALL `syncQueue` items and sends them to `/api/sync`. No SyncWorker changes needed.

---

## Task 1: Add localLooseParts CRUD + Sync Helpers

Foundation for all write-through tasks. Create IndexedDB operations for the `localLooseParts` table, mirroring the pattern from `ownedStore.ts`.

**Files:**

- Create: `app/lib/localDb/loosePartsStore.ts`
- Create: `app/lib/localDb/__tests__/loosePartsStore.test.ts`
- Modify: `app/lib/localDb/index.ts` — export new functions

**Step 1: Write the tests**

```typescript
// app/lib/localDb/__tests__/loosePartsStore.test.ts
import { describe, it, expect, beforeEach } from 'vitest';

// We test against the real Dexie instance using fake-indexeddb
// (already configured in vitest setup — check vitest.config.ts)

describe('loosePartsStore', () => {
  beforeEach(async () => {
    // Clear the table before each test
    const { getLocalDb } = await import('@/app/lib/localDb/schema');
    const db = getLocalDb();
    await db.localLooseParts.clear();
  });

  describe('getAllLooseParts', () => {
    it('returns empty array when no loose parts exist', async () => {
      const { getAllLooseParts } = await import('../loosePartsStore');
      const result = await getAllLooseParts();
      expect(result).toEqual([]);
    });

    it('returns all stored loose parts', async () => {
      const { getLocalDb } = await import('@/app/lib/localDb/schema');
      const { getAllLooseParts } = await import('../loosePartsStore');
      const db = getLocalDb();
      await db.localLooseParts.bulkAdd([
        { partNum: '3023', colorId: 5, quantity: 3, updatedAt: 1000 },
        { partNum: '3024', colorId: 0, quantity: 1, updatedAt: 1000 },
      ]);
      const result = await getAllLooseParts();
      expect(result).toHaveLength(2);
    });
  });

  describe('getLoosePartsCount', () => {
    it('returns 0 when empty', async () => {
      const { getLoosePartsCount } = await import('../loosePartsStore');
      expect(await getLoosePartsCount()).toBe(0);
    });

    it('returns total quantity across all entries', async () => {
      const { getLocalDb } = await import('@/app/lib/localDb/schema');
      const { getLoosePartsCount } = await import('../loosePartsStore');
      const db = getLocalDb();
      await db.localLooseParts.bulkAdd([
        { partNum: '3023', colorId: 5, quantity: 3, updatedAt: 1000 },
        { partNum: '3024', colorId: 0, quantity: 7, updatedAt: 1000 },
      ]);
      expect(await getLoosePartsCount()).toBe(10);
    });
  });

  describe('bulkUpsertLooseParts', () => {
    it('inserts new parts', async () => {
      const { bulkUpsertLooseParts, getAllLooseParts } = await import(
        '../loosePartsStore'
      );
      await bulkUpsertLooseParts([
        { partNum: '3023', colorId: 5, quantity: 3 },
        { partNum: '3024', colorId: 0, quantity: 1 },
      ]);
      const result = await getAllLooseParts();
      expect(result).toHaveLength(2);
      expect(result.find(p => p.partNum === '3023')?.quantity).toBe(3);
    });

    it('updates existing parts with max quantity in merge mode', async () => {
      const { getLocalDb } = await import('@/app/lib/localDb/schema');
      const { bulkUpsertLooseParts, getAllLooseParts } = await import(
        '../loosePartsStore'
      );
      const db = getLocalDb();
      await db.localLooseParts.add({
        partNum: '3023',
        colorId: 5,
        quantity: 10,
        updatedAt: 1000,
      });
      await bulkUpsertLooseParts(
        [{ partNum: '3023', colorId: 5, quantity: 3 }],
        'merge'
      );
      const result = await getAllLooseParts();
      expect(result.find(p => p.partNum === '3023')?.quantity).toBe(10); // max(10, 3)
    });

    it('overwrites existing parts in replace mode', async () => {
      const { getLocalDb } = await import('@/app/lib/localDb/schema');
      const { bulkUpsertLooseParts, getAllLooseParts } = await import(
        '../loosePartsStore'
      );
      const db = getLocalDb();
      await db.localLooseParts.add({
        partNum: '3023',
        colorId: 5,
        quantity: 10,
        updatedAt: 1000,
      });
      await bulkUpsertLooseParts(
        [{ partNum: '3023', colorId: 5, quantity: 3 }],
        'replace'
      );
      const result = await getAllLooseParts();
      expect(result.find(p => p.partNum === '3023')?.quantity).toBe(3);
    });
  });

  describe('clearAllLooseParts', () => {
    it('removes all entries', async () => {
      const { getLocalDb } = await import('@/app/lib/localDb/schema');
      const { clearAllLooseParts, getAllLooseParts } = await import(
        '../loosePartsStore'
      );
      const db = getLocalDb();
      await db.localLooseParts.add({
        partNum: '3023',
        colorId: 5,
        quantity: 3,
        updatedAt: 1000,
      });
      await clearAllLooseParts();
      expect(await getAllLooseParts()).toEqual([]);
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test -- --run app/lib/localDb/__tests__/loosePartsStore.test.ts`
Expected: FAIL (module not found)

**Step 3: Write the implementation**

```typescript
// app/lib/localDb/loosePartsStore.ts
import { getLocalDb, isIndexedDBAvailable } from './schema';
import type { LocalLoosePart } from './schema';

/**
 * Get all loose parts from IndexedDB.
 */
export async function getAllLooseParts(): Promise<LocalLoosePart[]> {
  if (!isIndexedDBAvailable()) return [];
  try {
    const db = getLocalDb();
    return await db.localLooseParts.toArray();
  } catch {
    return [];
  }
}

/**
 * Get total quantity of all loose parts.
 */
export async function getLoosePartsCount(): Promise<number> {
  if (!isIndexedDBAvailable()) return 0;
  try {
    const db = getLocalDb();
    const parts = await db.localLooseParts.toArray();
    let total = 0;
    for (const p of parts) {
      total += p.quantity;
    }
    return total;
  } catch {
    return 0;
  }
}

/**
 * Bulk upsert loose parts into IndexedDB.
 * - 'merge' mode: keep max(existing, imported) quantity
 * - 'replace' mode: overwrite with imported quantity
 */
export async function bulkUpsertLooseParts(
  parts: Array<{ partNum: string; colorId: number; quantity: number }>,
  mode: 'merge' | 'replace' = 'replace'
): Promise<void> {
  if (!isIndexedDBAvailable() || parts.length === 0) return;

  try {
    const db = getLocalDb();
    const now = Date.now();

    await db.transaction('rw', db.localLooseParts, async () => {
      for (const part of parts) {
        const qty = Math.max(0, Math.floor(part.quantity));
        if (qty === 0) continue;

        const existing = await db.localLooseParts
          .where('[partNum+colorId]')
          .equals([part.partNum, part.colorId])
          .first();

        if (existing) {
          const newQty =
            mode === 'merge' ? Math.max(existing.quantity, qty) : qty;
          await db.localLooseParts.put({
            partNum: part.partNum,
            colorId: part.colorId,
            quantity: newQty,
            updatedAt: now,
          });
        } else {
          await db.localLooseParts.add({
            partNum: part.partNum,
            colorId: part.colorId,
            quantity: qty,
            updatedAt: now,
          });
        }
      }
    });
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('Failed to bulk upsert loose parts:', error);
    }
  }
}

/**
 * Clear all loose parts from IndexedDB.
 */
export async function clearAllLooseParts(): Promise<void> {
  if (!isIndexedDBAvailable()) return;
  try {
    const db = getLocalDb();
    await db.localLooseParts.clear();
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('Failed to clear loose parts:', error);
    }
  }
}

/**
 * Enqueue a loose part change for sync to Supabase.
 * Consolidates with existing pending operations for the same key.
 */
export async function enqueueLoosePartChange(
  userId: string,
  clientId: string,
  partNum: string,
  colorId: number,
  quantity: number
): Promise<void> {
  if (!isIndexedDBAvailable()) return;

  try {
    const db = getLocalDb();
    const MAX_RETRY_COUNT = 5;

    const existingOps = await db.syncQueue
      .where('table')
      .equals('user_loose_parts')
      .filter(
        op =>
          op.retryCount < MAX_RETRY_COUNT &&
          op.userId === userId &&
          (op.payload as Record<string, unknown>).part_num === partNum &&
          (op.payload as Record<string, unknown>).color_id === colorId
      )
      .toArray();

    const now = Date.now();
    const payload = {
      part_num: partNum,
      color_id: colorId,
      loose_quantity: quantity,
    };

    if (existingOps.length > 0) {
      const mostRecent = existingOps[existingOps.length - 1]!;
      await db.syncQueue.update(mostRecent.id!, {
        payload,
        userId,
        createdAt: now,
        retryCount: 0,
        lastError: null,
      });
    } else {
      await db.syncQueue.add({
        table: 'user_loose_parts',
        operation: quantity > 0 ? 'upsert' : 'delete',
        payload,
        clientId,
        userId,
        createdAt: now,
        retryCount: 0,
        lastError: null,
      });
    }
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('Failed to enqueue loose part change:', error);
    }
  }
}
```

**Step 4: Export from index**

Add to `app/lib/localDb/index.ts`:

```typescript
export {
  getAllLooseParts,
  getLoosePartsCount,
  bulkUpsertLooseParts,
  clearAllLooseParts,
  enqueueLoosePartChange,
} from './loosePartsStore';
```

**Step 5: Run tests to verify they pass**

Run: `npm test -- --run app/lib/localDb/__tests__/loosePartsStore.test.ts`
Expected: All 6 tests PASS

**Step 6: Commit**

```bash
git add app/lib/localDb/loosePartsStore.ts app/lib/localDb/__tests__/loosePartsStore.test.ts app/lib/localDb/index.ts
git commit -m "Add localLooseParts CRUD and sync enqueue helpers"
```

---

## Task 2: Fix Sync Route — Orphan Rows + updated_at

**Review issue I3:** When loose parts are "deleted" (set `loose_quantity = 0`), rows where both `quantity = 0` AND `loose_quantity = 0` are left as dead rows. Also, upserts don't set `updated_at`.

**Files:**

- Modify: `app/api/sync/route.ts:269-333`

**Step 1: Fix the loose parts upsert to include updated_at**

In `app/api/sync/route.ts`, find the loose parts upsert block (~line 273). Change:

```typescript
const rows = userLoosePartsUpserts.map(u => ({
  user_id: u.payload.user_id,
  part_num: u.payload.part_num,
  color_id: u.payload.color_id,
  loose_quantity: u.payload.loose_quantity,
}));
```

to:

```typescript
const rows = userLoosePartsUpserts.map(u => ({
  user_id: u.payload.user_id,
  part_num: u.payload.part_num,
  color_id: u.payload.color_id,
  loose_quantity: u.payload.loose_quantity,
  updated_at: new Date().toISOString(),
}));
```

Apply the same to the individual retry rows (~line 290-296).

**Step 2: Fix the delete to clean up orphan rows**

In `app/api/sync/route.ts`, find the loose parts delete loop (~line 317). After the existing `.update()` call succeeds, add a cleanup step:

```typescript
// Execute deletes for user_loose_parts (set loose_quantity = 0, then clean up orphans)
for (const d of userLoosePartsDeletes) {
  const { error: deleteError } = await supabase
    .from('user_parts_inventory')
    .update({ loose_quantity: 0, updated_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .eq('part_num', d.payload.part_num)
    .eq('color_id', d.payload.color_id);

  if (deleteError) {
    failed.push({
      id: d.id,
      error: `delete_failed:${deleteError.message}`,
    });
  } else {
    processed++;
    // Clean up orphan rows where both quantity and loose_quantity are 0
    await supabase
      .from('user_parts_inventory')
      .delete()
      .eq('user_id', user.id)
      .eq('part_num', d.payload.part_num)
      .eq('color_id', d.payload.color_id)
      .eq('quantity', 0)
      .eq('loose_quantity', 0);
  }
}
```

**Step 3: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add app/api/sync/route.ts
git commit -m "Fix orphan rows and missing updated_at in loose parts sync"
```

---

## Task 3: Add File Size Validation

**Review issue M6:** No file size check before reading. Add a 10MB limit.

**Files:**

- Modify: `app/account/components/BackupImportTab.tsx`

**Step 1: Add size constant and validation**

At the top of `BackupImportTab.tsx`, after the `FORMAT_LABELS` constant:

```typescript
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
```

**Step 2: Add validation to handleRestoreFile**

In `handleRestoreFile` (~line 129), after `const file = event.target.files?.[0]; if (!file) return;`, add:

```typescript
if (file.size > MAX_FILE_SIZE_BYTES) {
  setRestoreError('File is too large (max 10 MB).');
  if (restoreInputRef.current) restoreInputRef.current.value = '';
  return;
}
```

**Step 3: Add validation to handleImportFileSelect**

In `handleImportFileSelect` (~line 217), after `const file = event.target.files?.[0]; if (!file) return;`, add:

```typescript
if (file.size > MAX_FILE_SIZE_BYTES) {
  setImportError('File is too large (max 10 MB).');
  if (importInputRef.current) importInputRef.current.value = '';
  return;
}
```

**Step 4: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 5: Commit**

```bash
git add app/account/components/BackupImportTab.tsx
git commit -m "Add 10MB file size validation to backup/import uploads"
```

---

## Task 4: Complete Backup Export

**Review issue I5:** Export only captures sets — owned parts, loose parts, lists, minifigs, and preferences are all empty. Make `handleDownloadBackup` async and gather all data.

**Files:**

- Modify: `app/account/components/BackupImportTab.tsx:87-121`

**Step 1: Add imports**

Add these imports to BackupImportTab.tsx:

```typescript
import { getLocalDb } from '@/app/lib/localDb/schema';
import { getAllLooseParts } from '@/app/lib/localDb/loosePartsStore';
import { getSupabaseBrowserClient } from '@/app/lib/supabaseClient';
```

**Step 2: Replace handleDownloadBackup**

Replace the entire `handleDownloadBackup` callback (~lines 87-121) with:

```typescript
const handleDownloadBackup = useCallback(async () => {
  setBackupError(null);
  setBackupSuccess(null);
  setIsExporting(true);

  try {
    // Gather sets from user-sets store
    const sets = Object.values(userSets)
      .filter(s => s.status.owned)
      .map(s => ({
        setNumber: s.setNumber,
        status: 'owned' as const,
      }));

    // Gather owned parts from IndexedDB
    const db = getLocalDb();
    const localOwnedRows = await db.localOwned.toArray();
    const ownedParts = localOwnedRows
      .filter(row => row.quantity > 0)
      .map(row => ({
        setNumber: row.setNumber,
        inventoryKey: row.inventoryKey,
        quantity: row.quantity,
      }));

    // Gather loose parts from IndexedDB
    const looseParts = (await getAllLooseParts()).map(p => ({
      partNum: p.partNum,
      colorId: p.colorId,
      quantity: p.quantity,
    }));

    // Gather lists, minifigs, preferences from Supabase (all auth users have access)
    let lists: Array<{
      id: string;
      name: string;
      items: Array<{ itemType: 'set' | 'minifig'; itemId: string }>;
    }> = [];
    let minifigs: Array<{ figNum: string; status: string }> = [];
    let preferences: Record<string, unknown> = {};

    if (user) {
      const supabase = getSupabaseBrowserClient();

      // Lists + items
      const { data: listsData } = await supabase
        .from('user_lists')
        .select('id,name')
        .eq('user_id', user.id);

      if (listsData && listsData.length > 0) {
        const listIds = listsData.map(l => l.id);
        const { data: itemsData } = await supabase
          .from('user_list_items')
          .select('list_id,item_type,set_num,minifig_id')
          .eq('user_id', user.id)
          .in('list_id', listIds);

        lists = listsData.map(l => ({
          id: l.id,
          name: l.name,
          items: (itemsData ?? [])
            .filter(item => item.list_id === l.id)
            .map(item => ({
              itemType: item.item_type as 'set' | 'minifig',
              itemId:
                item.item_type === 'set'
                  ? (item.set_num ?? '')
                  : (item.minifig_id ?? ''),
            }))
            .filter(item => item.itemId !== ''),
        }));
      }

      // Minifigs
      const { data: minifigsData } = await supabase
        .from('user_minifigs')
        .select('fig_num,status')
        .eq('user_id', user.id);

      if (minifigsData) {
        minifigs = minifigsData.map(m => ({
          figNum: m.fig_num,
          status: m.status,
        }));
      }

      // Preferences
      const { data: prefsData } = await supabase
        .from('user_preferences')
        .select('theme,theme_color,settings')
        .eq('user_id', user.id)
        .single();

      if (prefsData) {
        const settings = (prefsData.settings ?? {}) as Record<string, unknown>;
        preferences = {
          theme: prefsData.theme ?? undefined,
          themeColor: prefsData.theme_color ?? undefined,
          pricing: settings.pricing ?? undefined,
          minifigSync: settings.minifigSync ?? undefined,
        };
      }
    }

    const backup = assembleBackup({
      sets,
      ownedParts,
      looseParts,
      lists,
      minifigs,
      preferences,
    });

    downloadBackup(backup);

    const parts: string[] = [];
    if (sets.length > 0)
      parts.push(`${sets.length} set${sets.length !== 1 ? 's' : ''}`);
    if (ownedParts.length > 0)
      parts.push(
        `${ownedParts.length} owned part entr${ownedParts.length !== 1 ? 'ies' : 'y'}`
      );
    if (looseParts.length > 0)
      parts.push(
        `${looseParts.length} loose part${looseParts.length !== 1 ? 's' : ''}`
      );
    if (lists.length > 0)
      parts.push(`${lists.length} list${lists.length !== 1 ? 's' : ''}`);
    if (minifigs.length > 0)
      parts.push(
        `${minifigs.length} minifig${minifigs.length !== 1 ? 's' : ''}`
      );

    setBackupSuccess(
      `Backup downloaded${parts.length > 0 ? ` with ${parts.join(', ')}` : ''}.`
    );
  } catch (err) {
    setBackupError(
      err instanceof Error ? err.message : 'Failed to create backup.'
    );
  } finally {
    setIsExporting(false);
  }
}, [userSets, user]);
```

**Step 3: Update the button onClick to handle async**

Change the Download Backup button's `onClick` from `onClick={handleDownloadBackup}` to:

```tsx
onClick={() => void handleDownloadBackup()}
```

**Step 4: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 5: Commit**

```bash
git add app/account/components/BackupImportTab.tsx
git commit -m "Export all data types in backup (sets, parts, loose parts, lists, minifigs, preferences)"
```

---

## Task 5: Complete Restore — Local Data (Sets, Owned Parts, Loose Parts)

**Review issues C2/C3:** Restore only handles sets and doesn't clear existing data first. Fix to restore sets (full replace), owned parts, and loose parts.

**Files:**

- Modify: `app/account/components/BackupImportTab.tsx` — `restoreFromBackup` function (~lines 195-207)
- Modify: `app/store/user-sets.ts` — add `replaceAll` method

**Step 1: Add a replaceAll method to user-sets store**

In `app/store/user-sets.ts`, the `hydrateFromSupabase` method merges. For restore we need to replace all data. Add a new method in the store definition (after `clearAllStatusesForSet`):

```typescript
/**
 * Replace all sets in the store with the given entries.
 * Used for full restore from backup.
 */
replaceAllSets: (entries: HydratedSetInput[]) => void;
```

Implementation (add after the `clearAllStatusesForSet` implementation block, before `hydrateFromSupabase`):

```typescript
replaceAllSets: (entries: HydratedSetInput[]) => {
  set(prevState => {
    const nextSets: Record<string, UserSet> = {};
    const now = Date.now();

    for (const entry of entries) {
      if (!entry || typeof entry.setNumber !== 'string') continue;
      const normKey = normalizeKey(entry.setNumber);
      nextSets[normKey] = {
        setNumber: entry.setNumber,
        name: entry.name ?? entry.setNumber,
        year: typeof entry.year === 'number' ? entry.year : 0,
        imageUrl: typeof entry.imageUrl === 'string' ? entry.imageUrl : null,
        numParts: typeof entry.numParts === 'number' ? entry.numParts : 0,
        themeId: typeof entry.themeId === 'number' ? entry.themeId : null,
        status: entry.status ?? EMPTY_SET_STATUS,
        lastUpdatedAt:
          typeof entry.updatedAt === 'number' && Number.isFinite(entry.updatedAt)
            ? entry.updatedAt
            : now,
        foundCount:
          typeof entry.foundCount === 'number' ? entry.foundCount : 0,
      };
    }

    const nextState: UserSetsState = { ...prevState, sets: nextSets };
    persistState(nextState);
    return nextState;
  });
},
```

Add to the `UserSetsState` type:

```typescript
replaceAllSets: (entries: HydratedSetInput[]) => void;
```

**Step 2: Update BackupImportTab imports**

Add these imports (some may already be present from Task 4):

```typescript
import {
  clearAllLooseParts,
  bulkUpsertLooseParts,
} from '@/app/lib/localDb/loosePartsStore';
import { getLocalDb } from '@/app/lib/localDb/schema';
```

**Step 3: Get `replaceAllSets` from store**

In BackupImportTab, alongside the existing `hydrateFromSupabase` selector, add:

```typescript
const replaceAllSets = useUserSetsStore(state => state.replaceAllSets);
```

**Step 4: Replace `restoreFromBackup` implementation**

Replace the `restoreFromBackup` callback (~lines 195-207) with:

```typescript
const restoreFromBackup = useCallback(
  async (backup: BrickPartyBackup) => {
    // 1. Clear and restore sets
    const setEntries = backup.data.sets.map(s => ({
      setNumber: s.setNumber,
      status: { owned: s.status === 'owned' },
    }));
    replaceAllSets(setEntries);

    // 2. Clear and restore owned parts
    const db = getLocalDb();
    await db.localOwned.clear();
    if (backup.data.ownedParts.length > 0) {
      const now = Date.now();
      const ownedEntries = backup.data.ownedParts.map(p => ({
        setNumber: p.setNumber,
        inventoryKey: p.inventoryKey,
        quantity: p.quantity,
        updatedAt: now,
      }));
      await db.transaction('rw', db.localOwned, async () => {
        await db.localOwned.bulkAdd(ownedEntries);
      });
    }

    // 3. Clear and restore loose parts
    await clearAllLooseParts();
    if (backup.data.looseParts.length > 0) {
      await bulkUpsertLooseParts(
        backup.data.looseParts.map(p => ({
          partNum: p.partNum,
          colorId: p.colorId,
          quantity: p.quantity,
        })),
        'replace'
      );
    }
  },
  [replaceAllSets]
);
```

**Step 5: Make handleRestoreFile async-aware**

The `handleRestoreFile` callback calls `restoreFromBackup(backup)` synchronously (~line 167). Since `restoreFromBackup` is now async, change the try block:

```typescript
try {
  await restoreFromBackup(backup);
  setRestoreSuccess();
  // ... (keep existing success message)
} catch (err) {
  // ... (keep existing error handler)
}
```

Since `handleRestoreFile` is inside a `FileReader.onload` callback, the outer function is already a regular function. The `try/catch` is inside `reader.onload`. Change the `reader.onload` handler to be async:

```typescript
reader.onload = async () => {
```

**Step 6: Update eslint-disable deps**

Update the `handleRestoreFile` dependency array to include `restoreFromBackup`:

```typescript
}, [restoreFromBackup]);
```

Remove the `eslint-disable-next-line react-hooks/exhaustive-deps` comment (this also fixes M7).

**Step 7: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 8: Run all tests**

Run: `npm test -- --run`
Expected: All tests pass

**Step 9: Commit**

```bash
git add app/store/user-sets.ts app/account/components/BackupImportTab.tsx
git commit -m "Restore sets, owned parts, and loose parts from backup with full clear"
```

---

## Task 6: Complete Restore — Supabase Data (Lists, Minifigs, Preferences)

**Files:**

- Modify: `app/account/components/BackupImportTab.tsx` — extend `restoreFromBackup`

**Step 1: Extend restoreFromBackup with Supabase writes**

After the loose parts restore in `restoreFromBackup`, add:

```typescript
// 4. Restore lists, minifigs, preferences via Supabase (requires auth)
if (user) {
  const supabase = getSupabaseBrowserClient();

  // Restore lists
  // Delete existing lists and items
  await supabase.from('user_list_items').delete().eq('user_id', user.id);
  await supabase.from('user_lists').delete().eq('user_id', user.id);

  if (backup.data.lists.length > 0) {
    // Create lists
    const listRows = backup.data.lists.map(l => ({
      id: l.id,
      user_id: user.id,
      name: l.name,
    }));
    await supabase.from('user_lists').insert(listRows);

    // Create list items
    const itemRows = backup.data.lists.flatMap(l =>
      l.items.map(item => ({
        user_id: user.id,
        list_id: l.id,
        item_type: item.itemType,
        set_num: item.itemType === 'set' ? item.itemId : null,
        minifig_id: item.itemType === 'minifig' ? item.itemId : null,
      }))
    );
    if (itemRows.length > 0) {
      // Batch in chunks of 200
      for (let i = 0; i < itemRows.length; i += 200) {
        await supabase
          .from('user_list_items')
          .insert(itemRows.slice(i, i + 200));
      }
    }
  }

  // Restore minifigs
  await supabase.from('user_minifigs').delete().eq('user_id', user.id);

  if (backup.data.minifigs.length > 0) {
    const minifigRows = backup.data.minifigs.map(m => ({
      user_id: user.id,
      fig_num: m.figNum,
      status: m.status,
    }));
    for (let i = 0; i < minifigRows.length; i += 200) {
      await supabase
        .from('user_minifigs')
        .insert(minifigRows.slice(i, i + 200));
    }
  }

  // Restore preferences
  if (backup.preferences) {
    const prefs = backup.preferences;
    const settingsPayload: Record<string, unknown> = {};
    if (prefs.pricing) settingsPayload.pricing = prefs.pricing;
    if (prefs.minifigSync) settingsPayload.minifigSync = prefs.minifigSync;

    await supabase.from('user_preferences').upsert(
      {
        user_id: user.id,
        ...(prefs.theme ? { theme: prefs.theme } : {}),
        ...(Object.keys(settingsPayload).length > 0
          ? { settings: settingsPayload }
          : {}),
      },
      { onConflict: 'user_id' }
    );
  }
}
```

**Step 2: Add `user` to restoreFromBackup's dependency array and closure**

The function needs access to `user`. Update the dependency array:

```typescript
[replaceAllSets, user];
```

**Step 3: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add app/account/components/BackupImportTab.tsx
git commit -m "Restore lists, minifigs, and preferences from backup via Supabase"
```

---

## Task 7: Wire BrickScan Import Write-Through

**Review issues I1/I2:** BrickScan import resolves IDs but doesn't write to IndexedDB. Merge/Replace toggle has no effect.

**Files:**

- Modify: `app/account/components/BackupImportTab.tsx` — the BrickScan branch of `handleImport` (~lines 287-384)

**Step 1: Add imports (if not already present)**

```typescript
import {
  bulkUpsertLooseParts,
  clearAllLooseParts,
  enqueueLoosePartChange,
} from '@/app/lib/localDb/loosePartsStore';
import { v4 as uuidv4 } from 'uuid'; // or use crypto.randomUUID()
```

Check if `uuid` is already a dependency. If not, use `crypto.randomUUID()` instead (available in all modern browsers).

**Step 2: Replace the BrickScan handling in handleImport**

After the ID mapping response is received and `mappedParts`/`mappedMinifigs`/`unmappedParts`/`unmappedMinifigs` are computed (~lines 340-347), replace the "For now, show the mapping result" block (~lines 373-384) with:

```typescript
// Write mapped parts to localLooseParts
if (mappedParts.length > 0) {
  const partsToWrite = mappedParts.map(p => {
    // Find original quantity from parsed data
    const original = parts.find(
      orig => orig.blPartId === p.blPartId && orig.blColorId === p.blColorId
    );
    return {
      partNum: p.rbPartNum!,
      colorId: p.rbColorId!,
      quantity: original?.quantity ?? 1,
    };
  });

  if (importMode === 'replace') {
    await clearAllLooseParts();
  }

  await bulkUpsertLooseParts(partsToWrite, importMode);

  // Enqueue sync for each part
  const clientId = crypto.randomUUID();
  for (const part of partsToWrite) {
    await enqueueLoosePartChange(
      user!.id,
      clientId,
      part.partNum,
      part.colorId,
      part.quantity
    );
  }
}

// Write mapped minifigs to Supabase
if (mappedMinifigs.length > 0) {
  const supabase = getSupabaseBrowserClient();

  if (importMode === 'replace') {
    await supabase.from('user_minifigs').delete().eq('user_id', user!.id);
  }

  const minifigRows = mappedMinifigs.map(m => ({
    user_id: user!.id,
    fig_num: m.rbFigNum!,
    status: 'owned' as const,
  }));

  for (let i = 0; i < minifigRows.length; i += 200) {
    await supabase
      .from('user_minifigs')
      .upsert(minifigRows.slice(i, i + 200), { onConflict: 'user_id,fig_num' });
  }
}

// Build result message
const summaryParts: string[] = [];
if (mappedParts.length > 0) {
  summaryParts.push(
    `${mappedParts.length} part${mappedParts.length !== 1 ? 's' : ''} imported`
  );
}
if (mappedMinifigs.length > 0) {
  summaryParts.push(
    `${mappedMinifigs.length} minifig${mappedMinifigs.length !== 1 ? 's' : ''} imported`
  );
}

const warningParts: string[] = [...warnings];
if (unmappedParts.length > 0) {
  warningParts.push(
    `${unmappedParts.length} part${unmappedParts.length !== 1 ? 's' : ''} could not be mapped`
  );
}
if (unmappedMinifigs.length > 0) {
  warningParts.push(
    `${unmappedMinifigs.length} minifig${unmappedMinifigs.length !== 1 ? 's' : ''} could not be mapped`
  );
}

const resultMsg =
  summaryParts.length > 0
    ? `Import complete: ${summaryParts.join(', ')}.` +
      (warningParts.length > 0 ? ` Warnings: ${warningParts.join('; ')}.` : '')
    : 'No items could be resolved from this file.';

setImportSuccess(resultMsg);
```

**Step 3: Add `importMode` to handleImport's dependency array**

Update the `useCallback` deps for `handleImport`:

```typescript
}, [importPreview, setOwned, isLoggedIn, importMode, user]);
```

**Step 4: Remove the old summaryParts/warningParts block**

Make sure you remove the old duplicate summaryParts/warningParts/resultMsg code that was at lines 349-384. The new code above replaces all of it.

**Step 5: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 6: Commit**

```bash
git add app/account/components/BackupImportTab.tsx
git commit -m "Wire BrickScan import to write loose parts and minifigs with merge/replace"
```

---

## Task 8: Show Loose Parts Count on Collection Page

**Review issue M1:** Design says "X parts from Y sets . Z loose parts" but only the first half is shown.

**Files:**

- Modify: `app/components/home/UserCollectionOverview.tsx:405-415, 768-775`

**Step 1: Add import**

```typescript
import { getLoosePartsCount } from '@/app/lib/localDb/loosePartsStore';
```

**Step 2: Add state for loose parts count**

After the `ownedSetCount` / `totalParts` memo (~line 415), add:

```typescript
const [loosePartsCount, setLoosePartsCount] = useState(0);

useEffect(() => {
  let cancelled = false;
  getLoosePartsCount().then(count => {
    if (!cancelled) setLoosePartsCount(count);
  });
  return () => {
    cancelled = true;
  };
}, [setsRecord]); // Re-check when collection changes (proxy for "something changed")
```

**Step 3: Update the display**

Replace the parts count display (~lines 768-775):

```tsx
{
  (ownedSetCount > 0 || loosePartsCount > 0) && (
    <div className="mx-auto mt-3 w-full max-w-7xl px-4">
      <p className="text-sm text-foreground-muted">
        {ownedSetCount > 0 && (
          <>
            {totalParts.toLocaleString()} parts from {ownedSetCount} set
            {ownedSetCount !== 1 ? 's' : ''}
          </>
        )}
        {ownedSetCount > 0 && loosePartsCount > 0 && ' · '}
        {loosePartsCount > 0 && (
          <>
            {loosePartsCount.toLocaleString()} loose part
            {loosePartsCount !== 1 ? 's' : ''}
          </>
        )}
      </p>
    </div>
  );
}
```

**Step 4: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 5: Run all tests**

Run: `npm test -- --run`
Expected: All tests pass

**Step 6: Commit**

```bash
git add app/components/home/UserCollectionOverview.tsx
git commit -m "Show loose parts count on collection page"
```

---

## Verification

After all tasks are complete:

1. Run: `npm test -- --run` — all tests pass
2. Run: `npx tsc --noEmit` — no type errors
3. Run: `npm run lint` — no lint errors
4. Manual test flow:
   - Download backup → verify .bp file contains all data sections
   - Restore from backup → verify confirmation dialog shows accurate counts, all data restored
   - Import BrickScan CSV → verify parts written to local DB, minifigs to Supabase
   - Import BrickScan XML → same verification
   - Import Rebrickable sets → verify sets marked as owned
   - Check collection page → verify "X parts from Y sets · Z loose parts" line
   - Upload file > 10MB → verify error message

## Note: Supabase Types (C1)

The generated TypeScript types at `supabase/types.ts` don't include `loose_quantity` because the migration hasn't been pushed to remote yet. Once the migration is deployed:

```bash
npm run generate-types
```

This is a deploy-time step, not a code change. The current code works because the Supabase client is permissive at runtime — type safety for `loose_quantity` will be enforced after regeneration.
