# Minifig Subpart Cascade Fix Plan

**Issue**: Toggling the owned quantity of a parent minifigure no longer cascades to its subassembly parts.

**Status**: ✅ Images working | ❌ Cascade broken

---

## Problem Analysis

### What Should Happen

When a user changes the owned quantity of a parent minifigure (e.g., `fig:sw0001`):

1. The parent minifig's owned quantity updates
2. **All subassembly parts** (head, torso, legs) should also update proportionally
3. Example: Setting `sw0001` to owned=2 should set all its subparts to owned=2

### Current Behavior

- ✅ Minifig subpart images now display correctly (BL image URLs)
- ✅ Parent-child relationships are established via `componentRelations` and `parentRelations`
- ❌ Changing parent minifig owned quantity does NOT cascade to children

### Root Cause

The `handleOwnedChange` function in `useSupabaseOwned.ts` (lines 109-124) only updates the **single key** that was changed. It does NOT propagate changes to related parts.

```typescript
const handleOwnedChange = useCallback(
  (key: string, nextOwned: number) => {
    // Update local store immediately (IndexedDB + in-memory cache)
    setOwned(setNumber, key, nextOwned); // ← Only updates THIS key

    if (!enableCloudSync || !userId) {
      return;
    }

    // Enqueue change for sync to Supabase via the sync worker
    enqueueChange(key, nextOwned); // ← Only syncs THIS key
  },
  [enableCloudSync, setOwned, setNumber, userId, enqueueChange]
);
```

**No cascade logic exists** to:

1. Check if the changed key is a minifig parent
2. Find its `componentRelations`
3. Update each child part's owned quantity proportionally

---

## Key Data Structures

### InventoryRow Schema

```typescript
type InventoryRow = {
  partId: string; // e.g., "fig:sw0001" or "3626cpb2345"
  inventoryKey: string; // e.g., "fig:sw0001" or "3626cpb2345:1"
  quantityRequired: number;

  // Parent-child relationships
  componentRelations?: Array<{
    key: string; // Child key
    quantity: number; // Quantity per parent
  }>;

  parentRelations?: Array<{
    parentKey: string; // Parent key
    quantity: number; // Quantity per parent
  }>;
};
```

### Example Relationships

```
Parent: fig:sw0001 (Han Solo)
├── componentRelations: [
│     { key: "3626cpb2345:1", quantity: 1 },  // Head
│     { key: "973pb1234c01:1", quantity: 1 }, // Torso
│     { key: "970c00pb123:86", quantity: 1 }  // Legs
│   ]

Child: 3626cpb2345:1 (Head)
└── parentRelations: [
      { parentKey: "fig:sw0001", quantity: 1 }
    ]
```

---

## Solution: Add Cascade Logic

### Option A: Cascade in `handleOwnedChange` (Recommended)

**Pros**:

- Centralized logic
- Works for all owned change sources (UI, sync, group sessions)
- Single source of truth

**Cons**:

- Requires passing `rows` to `handleOwnedChange` or accessing them via context

**Implementation**:

```typescript
const handleOwnedChange = useCallback(
  (key: string, nextOwned: number) => {
    // Update local store immediately
    setOwned(setNumber, key, nextOwned);

    // CASCADE LOGIC: Find children if this is a parent minifig
    const row = rows.find(r => r.inventoryKey === key);
    if (row?.componentRelations && row.componentRelations.length > 0) {
      for (const child of row.componentRelations) {
        const childOwned = nextOwned * child.quantity;
        setOwned(setNumber, child.key, childOwned);

        if (enableCloudSync && userId) {
          enqueueChange(child.key, childOwned);
        }
      }
    }

    if (!enableCloudSync || !userId) {
      return;
    }

    // Enqueue change for sync to Supabase
    enqueueChange(key, nextOwned);
  },
  [enableCloudSync, setOwned, setNumber, userId, enqueueChange, rows]
);
```

---

### Option B: Cascade in `InventoryTableView` (Simpler, less ideal)

**Pros**:

- Easier to implement (rows already available)
- No changes to `useSupabaseOwned` hook

**Cons**:

- Only works for UI-initiated changes
- Won't cascade for group session sync or other sources
- Duplicates cascade logic if needed elsewhere

**Implementation**:

```typescript
onOwnedChange={nextOwned => {
  const clamped = clampOwned(nextOwned, row.quantityRequired ?? 0);
  const prevOwned = ownedByKey[key] ?? 0;

  // Update parent
  handleOwnedChange(key, clamped);

  // CASCADE: Update children
  if (row.componentRelations && row.componentRelations.length > 0) {
    for (const child of row.componentRelations) {
      const childOwned = clamped * child.quantity;
      handleOwnedChange(child.key, childOwned);
    }
  }

  broadcastPieceDelta({
    key,
    delta: clamped - prevOwned,
    newOwned: clamped,
  });
}}
```

---

## Recommended Approach: **Option A**

1. **Modify `useSupabaseOwned` hook** to accept `rows` as a dependency
2. **Add cascade logic** to `handleOwnedChange` function
3. **Ensure cascade works for all change sources**:
   - Manual UI changes
   - Group session remote deltas
   - Migration operations

---

## Implementation Steps

### Step 1: Update `useSupabaseOwned` Hook

**File**: `app/hooks/useSupabaseOwned.ts`

1. Add `rows` to function arguments
2. Add cascade logic in `handleOwnedChange`
3. Add `rows` to dependency array

### Step 2: Update Hook Consumers

**File**: `app/components/set/InventoryTableContainer.tsx`

Pass `rows` to `useSupabaseOwned`:

```typescript
const {
  handleOwnedChange,
  migration,
  isMigrating,
  confirmMigration,
  keepCloudData,
} = useSupabaseOwned({
  setNumber,
  rows, // ← Add this
  keys,
  enableCloudSync,
});
```

### Step 3: Test Cascade Behavior

**Test Cases**:

1. ✅ Toggle parent minifig from 0 → 1: All subparts update to 1
2. ✅ Toggle parent minifig from 1 → 0: All subparts update to 0
3. ✅ Change parent quantity to 2: All subparts update to 2
4. ✅ Cascade works in group sessions (remote delta)
5. ✅ Cascade persists to IndexedDB and Supabase

---

## Edge Cases to Consider

1. **Multiple Parents**: A subpart may belong to multiple minifigs
   - **Solution**: Only cascade when the PARENT is changed, not the child
   - Child parts can still be manually adjusted independently

2. **Subpart Already Owned from Regular Inventory**:
   - If a part exists in both regular inventory and as a minifig subpart, should cascade override?
   - **Proposed**: Cascade only affects minifig-specific subparts (those with `parentRelations`)

3. **Group Session Conflicts**:
   - If two users toggle the same minifig simultaneously
   - **Solution**: Last-write-wins (existing behavior is acceptable)

4. **Performance**: Cascade may trigger multiple IndexedDB writes
   - **Solution**: Batch writes are already debounced, should be fine

---

## Testing Plan

### Unit Tests

- ✅ `handleOwnedChange` cascades to children when parent is updated
- ✅ Cascade respects `componentRelations` quantities
- ✅ Cascade does NOT trigger for regular parts (only minifig parents)

### Integration Tests

- ✅ Toggle minifig in UI, verify subparts update
- ✅ Remote delta in group session cascades to children
- ✅ Migration operations cascade to children

### Manual Testing

1. Load a set with minifigs
2. Toggle a minifig owned
3. Verify all subparts toggle proportionally
4. Verify changes persist after refresh

---

## Estimated Effort

| Task                           | Effort    |
| ------------------------------ | --------- |
| Update `useSupabaseOwned` hook | 30min     |
| Update hook consumers          | 10min     |
| Add unit tests                 | 30min     |
| Manual testing                 | 15min     |
| **Total**                      | **~1.5h** |

---

## Success Criteria

- ✅ Toggling parent minifig cascades to all subparts
- ✅ Cascade respects per-parent quantities
- ✅ Cascade works in group sessions
- ✅ Changes persist to IndexedDB and Supabase
- ✅ No performance degradation
- ✅ All tests passing
