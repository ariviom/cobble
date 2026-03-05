# Minifig Sync Scope Design

## Problem

Minifig sync only pulls from `owned=true` sets. Users who add sets to collections (lists) before confirming ownership don't get those sets' minifigs synced. The collection "All" view also splits sets into "Owned" / "Uncategorized" group headers, which is confusing.

## Design

### 1. Preference: `syncScope`

Add `syncScope: 'collection' | 'owned'` to the existing `settings.minifigSync` JSONB namespace.

- **`'collection'`** (default): Sync minifigs from all sets that are owned OR in any user list.
- **`'owned'`**: Sync minifigs only from `owned=true` sets (previous behavior). Labeled "Owned Only" in UI.

Stored in `user_preferences.settings.minifigSync.syncScope`.

### 2. Settings UI

Add a radio or select control in the **Sets tab** (`SetsTab.tsx`), next to the existing "Sync minifigs from owned sets" toggle:

- Label: "Sync minifigs from"
- Options: "Collection" (default) | "Owned Only"
- Only visible when the sync toggle is on.

### 3. Sync Route Changes

`/api/user/minifigs/sync-from-sets/route.ts`:

- Load `syncScope` from preferences (default: `'collection'`).
- When `'collection'`: query `user_list_items WHERE item_type='set'` for additional set_nums, union with owned set_nums before proceeding.
- When `'owned'`: current behavior (only `user_sets WHERE owned=true`).
- The list membership sync (minifigs added to parent set's lists) already works for both cases since it uses the same set_num pool.

### 4. Collection View Grouping

`UserCollectionOverview.tsx`:

- When sorted by "collection" in the "All" view, use a single **"All Sets"** group header instead of splitting into "Owned" / "Uncategorized".
- Specific list views and "Owned" filter continue to work as-is.

## Files to Change

- `app/lib/userMinifigSyncPreferences.ts` — Add `syncScope` field, update load/save
- `app/account/components/SetsTab.tsx` — Add sync scope selector UI
- `app/account/page.tsx` — Pass initial sync scope to client
- `app/api/user/minifigs/sync-from-sets/route.ts` — Respect `syncScope` preference
- `app/components/home/UserCollectionOverview.tsx` — Replace "Owned"/"Uncategorized" grouping with "All Sets"
