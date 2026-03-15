# Backup/Import Sync Fixes Design

Date: 2026-03-07
Branch: `feat/backup-import`

## Problem Summary

Three issues remain after the initial backup/import implementation:

- **S2**: Loose parts count on the collection page only refreshes when `setsRecord` changes — not when loose parts themselves change (e.g., after a BrickScan import).
- **S3**: Backup export reads owned parts and loose parts from local IndexedDB only. Plus users who haven't opened every set on this device get incomplete backups.
- **S4**: Restore writes sets/owned/loose parts locally but doesn't push to Supabase. On next hydration, stale Supabase data merges back in, and restored data never reaches other devices.

## Design

### S2: Loose parts count refresh via `visibilitychange`

**File:** `app/components/home/UserCollectionOverview.tsx` (lines 420-428)

Replace the current `useEffect` with one that:

1. Fetches on mount (React default)
2. Adds a `visibilitychange` listener that re-fetches when the tab becomes visible
3. Keeps `setsRecord` as a dependency for completeness

Since imports happen on `/account` and the collection page is a different route, the combination of remount + visibilitychange covers all real scenarios.

### S3: Export from Supabase for logged-in users

**File:** `app/account/components/BackupImportTab.tsx` (lines 96-277)

For logged-in users, fetch owned parts from `user_set_parts` and loose parts from `user_parts_inventory` (where `loose_quantity > 0`) via Supabase instead of IndexedDB. These queries join the existing parallel `Promise.all` that already fetches lists/minifigs/preferences.

For anonymous users, keep the current IndexedDB reads as fallback.

Add an informational note for logged-in users near the Download Backup button:

> "Your collection syncs automatically between devices. Backups are useful for safekeeping or transferring to another account."

### S4: Restore pushes to Supabase for logged-in users

**File:** `app/account/components/BackupImportTab.tsx` (lines 280-396)

For logged-in users, after local writes, also write directly to Supabase:

- **Sets**: Delete all `user_sets` rows for user, bulk insert restored sets (batched at 200)
- **Owned parts**: Delete all `user_set_parts` rows for user, bulk upsert restored parts (batched at 200, parse `inventoryKey` to extract `part_num` and `color_id`)
- **Loose parts**: Set `loose_quantity = 0` on existing `user_parts_inventory` rows, bulk upsert restored loose parts (batched at 200)

This mirrors the existing pattern used for lists, minifigs, and preferences (clear + bulk insert inside `if (user)`).

## Files Changed

| File                                             | Change                                                                                                                             |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `app/components/home/UserCollectionOverview.tsx` | Add `visibilitychange` listener to loose parts count effect                                                                        |
| `app/account/components/BackupImportTab.tsx`     | Export: read from Supabase for logged-in users; add Plus info note. Restore: push sets/owned/loose to Supabase for logged-in users |
