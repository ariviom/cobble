# Minifigure Cascade Implementation - Complete

## Summary

Successfully re-implemented the minifigure subpart cascade logic using BrickLink IDs, adapting the previous working solution to the new BL-centric system.

## Implementation

### 1. Bidirectional Cascade System

The cascade works in two directions:

#### Parent → Children (Direct Cascade)

When a parent minifigure's owned quantity changes, the owned quantities of its subparts are automatically updated.

**Location**: `app/hooks/useSupabaseOwned.ts`

**Logic**:

- When `handleOwnedChange` is called for a parent minifigure
- Check if the row has `componentRelations` (subparts)
- For each child subpart:
  - Skip if the child is shared across multiple parents (to avoid conflicts)
  - Calculate child owned: `parentOwned * childQuantity`
  - Update child owned quantity (with `skipCascade: true` to avoid loops)
  - Enqueue child for cloud sync if enabled

#### Children → Parent (Derived Display)

The parent minifigure's displayed owned quantity is computed based on its subparts' status.

**Location**: `app/hooks/useInventory.ts`

**Logic**:

- Compute `minifigStatusByKey` map for all parent minifigs
- For each parent:
  - Check all subpart relations
  - Count missing subparts
  - Set state to `'complete'` if all subparts are owned, else `'missing'`
- In `InventoryTableView`, use derived status to compute `displayOwned`:
  - If status is `'complete'`, display `quantityRequired`
  - Otherwise, display actual `ownedByKey` value (0)

### 2. Edge Cases Handled

- **Shared subparts**: Children that belong to multiple parents are skipped during cascade to avoid conflicts
- **Decrementing minifigs**: When parent owned is reduced, children are automatically reduced proportionally
- **Infinite loops**: The `skipCascade` option prevents cascades from triggering cascades
- **Cloud sync**: Child updates are properly enqueued for Supabase sync when enabled
- **Anonymous users**: Cascade works in local-only mode for unauthenticated users

### 3. Files Modified

- `app/hooks/useSupabaseOwned.ts`: Added cascade-down logic
- `app/hooks/useInventory.ts`: Added `minifigStatusByKey` computation and `MinifigStatus` type
- `app/hooks/useInventoryViewModel.ts`: Passed through `minifigStatusByKey`
- `app/components/set/InventoryTableContainer.tsx`: Destructured and passed `minifigStatusByKey`
- `app/components/set/InventoryTableView.tsx`: Used `minifigStatusByKey` to compute `displayOwned`
- `app/hooks/useMinifigMeta.ts`: Fixed `blId` references (now same as `figNum`)
- `app/lib/localDb/catalogCache.ts`: Removed obsolete `blId` field and merge logic
- `app/components/nav/SetTopBar.tsx`: Removed unused code
- `app/api/user/minifigs/route.ts`: Removed invalid parameter
- `app/lib/api/responses.ts`: Added missing newline

## Testing

- ✅ Build successful
- ✅ All 206 tests passing
- ✅ TypeScript compilation clean
- ✅ No linter errors

## How It Works

1. **User increments a minifigure**:
   - `handleOwnedChange('fig:sw0001', 1)` is called
   - Parent owned is updated to 1
   - Cascade logic detects this is a minifig parent
   - Each subpart (head, torso, legs) owned is set to 1
   - All changes sync to Supabase

2. **Display updates**:
   - `minifigStatusByKey` is recomputed
   - Checks if all subparts are owned
   - If complete, parent displays as owned (green checkmark)
   - If missing any subparts, parent displays as not owned

3. **User decrements a minifigure**:
   - `handleOwnedChange('fig:sw0001', 0)` is called
   - Parent owned is updated to 0
   - Each subpart owned is set to 0
   - Display updates to show minifig as not owned

## Key Differences from Previous Implementation

- Uses BrickLink IDs throughout (no RB→BL mapping)
- Cascade logic integrated into `useSupabaseOwned` hook
- Status computation uses `Map<string, MinifigStatus>` for efficiency
- Properly handles shared subparts
- Works with the new BL-centric data model

## Date Completed

December 31, 2025
