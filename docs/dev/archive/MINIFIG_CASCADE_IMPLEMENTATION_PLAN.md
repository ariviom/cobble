# Minifig Cascade - Deterministic Implementation Plan

**Date**: Dec 31, 2025

## What Was Working Before (RB IDs)

The old system (`ed060ce` commit - "minimal two-way minifig part sync") used a **COMPUTED/DERIVED approach**:

### Old Behavior: Children → Parent (Display Only)

```typescript
// Computed minifig status based on subparts
const minifigStatusByKey = useMemo(() => {
  for (const rel of row.componentRelations) {
    const childOwned = ownedByKey[rel.key] ?? 0;
    if (childOwned < rel.quantity) {
      missingCount += rel.quantity - childOwned;
    }
  }

  // Derive parent status from children
  if (missingCount === 0) {
    status = 'complete';
  }
}, [rows, ownedByKey]);

// Display computed value (NOT actual owned)
const displayOwned =
  derivedStatus?.state === 'complete'
    ? r.quantityRequired // Show as owned if all parts owned
    : owned; // Show actual owned otherwise
```

**Key Insight**: The minifig APPEARED to be owned when all its subparts were owned, but the actual `owned` value wasn't changed. This was **display-only**, not true cascade.

---

## What You're Asking For: Parent → Children (Actual Cascade)

When you toggle a parent minifigure's owned quantity:

1. **Parent changes**: `sw0001` owned 0 → 1
2. **Children CASCADE**: Head, torso, legs all update 0 → 1
3. **Persists to DB**: All changes sync to Supabase

This is **BIDIRECTIONAL** sync:

- **Parent → Children**: Actual cascade (what you need)
- **Children → Parent**: Derived display (what was working)

---

## Deterministic Solution: Two-Way Sync

### 1. Parent → Children CASCADE (New)

When parent owned changes, propagate to ALL children:

```typescript
const handleOwnedChange = useCallback(
  (key: string, nextOwned: number, options?: { skipCascade?: boolean }) => {
    // Update this key
    setOwned(setNumber, key, nextOwned);

    // CASCADE DOWN: If this is a parent, update children
    if (!options?.skipCascade) {
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
    }

    // Enqueue parent for sync
    if (enableCloudSync && userId) {
      enqueueChange(key, nextOwned);
    }
  },
  [rows, setOwned, setNumber, enableCloudSync, userId, enqueueChange]
);
```

### 2. Children → Parent DISPLAY (Restore Old Behavior)

Show parent as "complete" when all children are owned:

```typescript
const minifigStatusByKey = useMemo(() => {
  const result = new Map<string, MinifigStatus>();

  for (const row of rows) {
    if (!isMinifigParentRow(row)) continue;

    const key = row.inventoryKey;
    const relations = row.componentRelations ?? [];

    if (relations.length === 0) {
      result.set(key, { state: 'unknown', missingCount: 0 });
      continue;
    }

    let missingCount = 0;
    for (const rel of relations) {
      const childOwned = ownedByKey[rel.key] ?? 0;
      const requiredForParent = rel.quantity;

      if (childOwned < requiredForParent) {
        missingCount += requiredForParent - childOwned;
      }
    }

    result.set(key, {
      state: missingCount === 0 ? 'complete' : 'missing',
      missingCount,
    });
  }

  return result;
}, [rows, ownedByKey]);

// In render: display computed value for parent minifigs
const displayOwned = isMinifigParentRow(row)
  ? minifigStatusByKey.get(key)?.state === 'complete'
    ? row.quantityRequired
    : (ownedByKey[key] ?? 0)
  : (ownedByKey[key] ?? 0);
```

---

## Edge Cases & Solutions

### 1. **Decrementing a Minifig**

**Scenario**: User decrements `sw0001` from 2 → 1

**Solution**: CASCADE decrements children proportionally

```typescript
// Parent: 2 → 1
// Children: Update to match parent quantity
for (const child of componentRelations) {
  childOwned = parentOwned * child.quantity;
  // If parent = 1, child = 1 * 1 = 1
}
```

**Result**: Deterministic - children always match parent × quantity

---

### 2. **Child Owned Independently (Not Through Parent)**

**Scenario**: User owns a head part independently, then toggles the minifig

**Solution**: **Parent always wins** during cascade

```typescript
// Before: head owned = 3 (independent)
// Parent toggle 0 → 1
// After: head owned = 1 (CASCADE overwrites)
```

**Rationale**: Deterministic behavior - parent cascade is explicit intent

---

### 3. **Multiple Parents Share Same Child**

**Scenario**: Two minifigs both use the same head part

**Solution**: Track last updated parent, OR skip cascade for shared parts

```typescript
const isSharedChild = (childRow?.parentRelations?.length ?? 0) > 1;

if (isSharedChild) {
  // Option A: Skip cascade (manual management)
  continue;

  // Option B: Sum parent demands
  const totalDemand = childRow.parentRelations.reduce(
    (sum, rel) => sum + rel.quantity,
    0
  );
  setOwned(setNumber, child.key, totalDemand);
}
```

**Recommended**: Option A (skip cascade for shared parts) to avoid conflicts

---

### 4. **User Manually Adjusts Child After Parent Cascade**

**Scenario**: Parent cascades child to 2, user manually sets child to 3

**Solution**: Manual change persists, cascade only triggers from parent

```typescript
// Parent cascades: child = 2
// User manually changes: child = 3
// Parent status shows 'missing' (child insufficient)
// Next parent toggle will re-cascade and overwrite
```

**Rationale**: User intent respected, but parent cascade is authoritative

---

### 5. **Undo/Redo Behavior**

**Scenario**: User toggles minifig 0 → 1 → 0

**Solution**: Cascade on BOTH directions

```typescript
// Toggle 0 → 1: Children cascade to 1
// Toggle 1 → 0: Children cascade to 0
```

**Result**: Symmetrical, deterministic behavior

---

## Implementation Steps

### Step 1: Add Parent → Children Cascade (1h)

**Files**:

- `app/hooks/useSupabaseOwned.ts` - Add cascade logic
- `app/components/set/InventoryTableContainer.tsx` - Pass `rows` to hook

### Step 2: Restore Children → Parent Display (30min)

**Files**:

- `app/hooks/useInventory.ts` OR `app/hooks/useInventoryViewModel.ts` - Add `minifigStatusByKey` computation
- `app/components/set/InventoryTableView.tsx` - Use `displayOwned` for parent rows

### Step 3: Handle Edge Cases (1h)

- Skip cascade for shared children (multiple parents)
- Add `skipCascade` option for programmatic updates
- Test decrement behavior

### Step 4: Test Suite (1h)

- Unit tests for cascade logic
- Integration tests for UI behavior
- Manual testing with real sets

---

## Testing Checklist

### Parent → Children CASCADE

- ✅ Toggle parent 0 → 1: Children update to 1
- ✅ Toggle parent 1 → 0: Children update to 0
- ✅ Set parent to 2: Children update to 2
- ✅ Decrement parent 2 → 1: Children update to 1
- ✅ Cascade persists to IndexedDB
- ✅ Cascade syncs to Supabase

### Children → Parent DISPLAY

- ✅ All children owned: Parent shows complete
- ✅ Some children missing: Parent shows missing
- ✅ No children: Parent shows unknown

### Edge Cases

- ✅ Shared child: Skip cascade (manual management)
- ✅ Manual child adjustment: Persists until next parent cascade
- ✅ Group session: Cascade works for remote changes

---

## Success Criteria

- ✅ **Deterministic**: Same input always produces same output
- ✅ **Symmetric**: Toggle 0→1→0 returns to original state
- ✅ **Transparent**: User understands cascade behavior
- ✅ **Performant**: No lag, debounced writes work correctly
- ✅ **Persistent**: Changes sync to IndexedDB and Supabase
- ✅ **Bi-directional**: Parent→Children cascade + Children→Parent display

---

## Estimated Effort

| Task                      | Effort    |
| ------------------------- | --------- |
| Parent → Children cascade | 1h        |
| Children → Parent display | 30min     |
| Edge case handling        | 1h        |
| Testing                   | 1h        |
| **Total**                 | **~3.5h** |

---

## Migration Notes

**Breaking Change**: Users who manually adjusted child parts will see those overwritten on next parent toggle.

**Mitigation**: This is acceptable because:

1. Pre-launch (single user)
2. Deterministic behavior is more important than preserving manual tweaks
3. User can always manually adjust children after parent cascade

---

## Alternative: Display-Only (No True Cascade)

If you DON'T want actual cascade and prefer the old display-only behavior:

**Restore Children → Parent display** (Step 2 only) without Step 1.

**Pros**:

- Simpler implementation
- No data conflicts
- User retains full control

**Cons**:

- Parent minifig owned value doesn't actually change
- Less intuitive (display doesn't match stored value)
- Can't use parent owned for inventory calculations

**Recommendation**: Implement **TRUE CASCADE** (Steps 1-4) for deterministic behavior.
