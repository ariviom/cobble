# Backup/Import Sync Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix three sync gaps in backup/import: stale loose parts count (S2), incomplete export for logged-in users (S3), and restore not pushing to Supabase (S4).

**Architecture:** All three fixes are isolated to two files. S2 adds a `visibilitychange` listener to `UserCollectionOverview`. S3 and S4 modify `BackupImportTab` to read from/write to Supabase for logged-in users, keeping IndexedDB as the fallback for anonymous users.

**Tech Stack:** React, Supabase browser client, Dexie/IndexedDB, Zustand

---

### Task 1: S2 — Add `visibilitychange` listener for loose parts count

**Files:**

- Modify: `app/components/home/UserCollectionOverview.tsx:420-428`

**Step 1: Replace the existing `useEffect` for `loosePartsCount`**

Replace lines 420–428 with:

```tsx
useEffect(() => {
  let cancelled = false;
  const refresh = () => {
    getLoosePartsCount().then(count => {
      if (!cancelled) setLoosePartsCount(count);
    });
  };
  refresh();
  const onVisibility = () => {
    if (document.visibilityState === 'visible') refresh();
  };
  document.addEventListener('visibilitychange', onVisibility);
  return () => {
    cancelled = true;
    document.removeEventListener('visibilitychange', onVisibility);
  };
}, [setsRecord]);
```

This keeps the existing `setsRecord` dependency (so local set changes still trigger a recount) and adds `visibilitychange` so the count refreshes when the user returns from the `/account` import page.

**Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: No new errors

**Step 3: Commit**

```
S2: Refresh loose parts count on visibilitychange
```

---

### Task 2: S3 — Export owned parts and loose parts from Supabase for logged-in users

**Files:**

- Modify: `app/account/components/BackupImportTab.tsx:96-277` (export handler)
- Modify: `app/account/components/BackupImportTab.tsx:735-797` (JSX — add Plus messaging)

**Step 1: Move owned parts and loose parts reads into the `if (user)` block**

Currently lines 110–124 read from IndexedDB unconditionally. Replace the entire `handleDownloadBackup` body (lines 101–276) with:

```tsx
    try {
      // Gather sets from user-sets store
      const sets = Object.values(userSets)
        .filter(s => s.status.owned)
        .map(s => ({
          setNumber: s.setNumber,
          status: 'owned' as const,
        }));

      // Defaults for anonymous users
      let ownedParts: Array<{
        setNumber: string;
        inventoryKey: string;
        quantity: number;
      }> = [];
      let looseParts: Array<{
        partNum: string;
        colorId: number;
        quantity: number;
      }> = [];
      let lists: Array<{
        id: string;
        name: string;
        items: Array<{ itemType: 'set' | 'minifig'; itemId: string }>;
      }> = [];
      let minifigs: Array<{ figNum: string; status: string }> = [];
      let preferences: Record<string, unknown> = {};

      if (user) {
        const supabase = getSupabaseBrowserClient();

        // Fetch owned parts, loose parts, lists, minifigs, and preferences in parallel
        const [ownedPartsRes, loosePartsRes, listsRes, minifigsRes, prefsRes] =
          await Promise.all([
            supabase
              .from('user_set_parts')
              .select('set_num, part_num, color_id, owned_quantity')
              .eq('user_id', user.id)
              .gt('owned_quantity', 0),
            supabase
              .from('user_parts_inventory')
              .select('part_num, color_id, loose_quantity')
              .eq('user_id', user.id)
              .gt('loose_quantity', 0),
            supabase
              .from('user_lists')
              .select('id, name')
              .eq('user_id', user.id),
            supabase
              .from('user_minifigs')
              .select('fig_num, status')
              .eq('user_id', user.id),
            supabase
              .from('user_preferences')
              .select('theme, theme_color, settings')
              .eq('user_id', user.id)
              .single(),
          ]);

        // Process owned parts from Supabase
        if (ownedPartsRes.data) {
          ownedParts = ownedPartsRes.data.map(r => ({
            setNumber: r.set_num as string,
            inventoryKey: `${r.part_num}:${r.color_id}`,
            quantity: r.owned_quantity as number,
          }));
        }

        // Process loose parts from Supabase
        if (loosePartsRes.data) {
          looseParts = loosePartsRes.data.map(r => ({
            partNum: r.part_num as string,
            colorId: r.color_id as number,
            quantity: r.loose_quantity as number,
          }));
        }

        // Process lists + items (unchanged logic)
        if (listsRes.data && listsRes.data.length > 0) {
          const listIds = listsRes.data.map(l => l.id as string);

          // Batch list item queries at 200 IDs max
          const allItems: Array<{
            list_id: string;
            item_type: string;
            set_num: string | null;
            minifig_id: string | null;
          }> = [];
          for (let i = 0; i < listIds.length; i += 200) {
            const batch = listIds.slice(i, i + 200);
            const itemsRes = await supabase
              .from('user_list_items')
              .select('list_id, item_type, set_num, minifig_id')
              .in('list_id', batch);
            if (itemsRes.data) {
              allItems.push(
                ...itemsRes.data.map(item => ({
                  list_id: item.list_id as string,
                  item_type: item.item_type as string,
                  set_num: item.set_num as string | null,
                  minifig_id: item.minifig_id as string | null,
                }))
              );
            }
          }

          // Group items by list
          const itemsByList = new Map<
            string,
            Array<{ itemType: 'set' | 'minifig'; itemId: string }>
          >();
          for (const item of allItems) {
            const listItems = itemsByList.get(item.list_id) ?? [];
            const itemId =
              item.item_type === 'set' ? item.set_num : item.minifig_id;
            if (itemId) {
              listItems.push({
                itemType: item.item_type as 'set' | 'minifig',
                itemId,
              });
            }
            itemsByList.set(item.list_id, listItems);
          }

          lists = listsRes.data.map(l => ({
            id: l.id as string,
            name: l.name as string,
            items: itemsByList.get(l.id as string) ?? [],
          }));
        }

        // Process minifigs
        if (minifigsRes.data) {
          minifigs = minifigsRes.data.map(m => ({
            figNum: m.fig_num as string,
            status: (m.status as string) ?? 'owned',
          }));
        }

        // Process preferences
        if (prefsRes.data) {
          const settings = (prefsRes.data.settings ?? {}) as Record<
            string,
            unknown
          >;
          preferences = {
            theme: prefsRes.data.theme ?? undefined,
            themeColor: prefsRes.data.theme_color ?? undefined,
            pricing: settings.pricing ?? undefined,
            minifigSync: settings.minifigSync ?? undefined,
          };
          // Strip undefined keys
          for (const key of Object.keys(preferences)) {
            if (preferences[key] === undefined) {
              delete preferences[key];
            }
          }
        }
      } else {
        // Anonymous: read from local IndexedDB
        const ownedRows = await getLocalDb().localOwned.toArray();
        ownedParts = ownedRows.map(r => ({
          setNumber: r.setNumber,
          inventoryKey: r.inventoryKey,
          quantity: r.quantity,
        }));

        const looseRows = await getAllLooseParts();
        looseParts = looseRows.map(r => ({
          partNum: r.partNum,
          colorId: r.colorId,
          quantity: r.quantity,
        }));
      }

      // (rest of function unchanged: assembleBackup, downloadBackup, success message)
```

Key changes:

- `ownedParts` and `looseParts` declared as `let` with empty defaults before the `if (user)` block
- For logged-in users: two new Supabase queries added to the existing `Promise.all` (now 5 parallel queries instead of 3)
- For anonymous: IndexedDB reads moved into the `else` branch
- The `getAllLooseParts` import is still needed (for anonymous fallback)

**Step 2: Add Plus messaging in JSX**

After the description paragraph (line 747), add:

```tsx
{
  isLoggedIn && (
    <p className="text-body-sm mt-2 text-foreground-muted">
      Your collection syncs automatically between devices. Backups are useful
      for safekeeping or transferring to another account.
    </p>
  );
}
```

**Step 3: Verify types compile**

Run: `npx tsc --noEmit`
Expected: No new errors

**Step 4: Commit**

```
S3: Export owned/loose parts from Supabase for logged-in users
```

---

### Task 3: S4 — Restore pushes sets, owned parts, and loose parts to Supabase

**Files:**

- Modify: `app/account/components/BackupImportTab.tsx:280-396` (restore handler)

**Step 1: Add Supabase writes for sets, owned parts, and loose parts in `restoreFromBackup`**

Inside the existing `if (user)` block (which starts at line 319), add the following **before** the existing list/minifig/preference restoration code:

```tsx
// Restore sets to Supabase
await supabase.from('user_sets').delete().eq('user_id', user.id);
if (backup.data.sets.length > 0) {
  const setRows = backup.data.sets
    .filter(s => s.status === 'owned')
    .map(s => ({
      user_id: user.id,
      set_num: s.setNumber,
      owned: true,
    }));
  for (let i = 0; i < setRows.length; i += 200) {
    await supabase.from('user_sets').insert(setRows.slice(i, i + 200));
  }
}

// Restore owned parts to Supabase
await supabase.from('user_set_parts').delete().eq('user_id', user.id);
if (backup.data.ownedParts.length > 0) {
  const ownedRows = backup.data.ownedParts.map(p => {
    const lastColon = p.inventoryKey.lastIndexOf(':');
    const partNum = p.inventoryKey.slice(0, lastColon);
    const colorId = Number(p.inventoryKey.slice(lastColon + 1));
    return {
      user_id: user.id,
      set_num: p.setNumber,
      part_num: partNum,
      color_id: colorId,
      owned_quantity: p.quantity,
    };
  });
  for (let i = 0; i < ownedRows.length; i += 200) {
    await supabase.from('user_set_parts').upsert(ownedRows.slice(i, i + 200), {
      onConflict: 'user_id,set_num,part_num,color_id,is_spare',
    });
  }
}

// Restore loose parts to Supabase
await supabase
  .from('user_parts_inventory')
  .update({ loose_quantity: 0, updated_at: new Date().toISOString() })
  .eq('user_id', user.id)
  .gt('loose_quantity', 0);
if (backup.data.looseParts.length > 0) {
  const looseRows = backup.data.looseParts.map(p => ({
    user_id: user.id,
    part_num: p.partNum,
    color_id: p.colorId,
    loose_quantity: p.quantity,
  }));
  for (let i = 0; i < looseRows.length; i += 200) {
    await supabase
      .from('user_parts_inventory')
      .upsert(looseRows.slice(i, i + 200), {
        onConflict: 'user_id,part_num,color_id',
      });
  }
}
```

Note on `inventoryKey` parsing: uses `lastIndexOf(':')` because part numbers can contain colons (e.g., `bl:12345:67`).

**Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: No new errors

**Step 3: Commit**

```
S4: Push restored sets/owned/loose parts to Supabase for logged-in users
```

---

### Task 4: Final verification

**Step 1: Run full test suite**

Run: `npm test -- --run`
Expected: All tests pass (no existing tests break)

**Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: Clean

**Step 3: Run lint**

Run: `npm run lint`
Expected: No new warnings

**Step 4: Commit any lint fixes if needed**
