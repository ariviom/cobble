# Shared Minifigure Parts Fix Plan

## Problem Statement

When a set contains multiple minifigures that share the same subpart (e.g., two minifigs each with the same visor piece), the system incorrectly:

1. **Displays only 1 required** instead of 2
2. **Skips cascade entirely** for shared parts when toggling parent minifigs

### Example Scenario

- Set has 2 minifigs: Luke and Han
- Both minifigs use the same visor piece (part `1234:5`)
- Luke needs 1 visor, Han needs 1 visor
- **Expected**: `quantityRequired: 2`
- **Actual**: `quantityRequired: 1`

---

## Root Causes

### Issue 1: Quantity Not Aggregated (useInventory.ts)

**Location**: `app/hooks/useInventory.ts` lines 245-267

When processing minifig subparts:

- First minifig creates the subpart row with `quantityRequired: 1`
- Second minifig finds existing row, adds to `parentRelations`
- **Bug**: `quantityRequired` is NOT incremented

```typescript
// Lines 245-267 (current behavior)
if (existingIdx != null) {
  const child = working[existingIdx]!;
  // Updates image, bricklinkPartId, parentCategory...
  // Adds to parentRelations...
  // ❌ MISSING: quantityRequired += sp.quantity
}
```

### Issue 2: Cascade Skips Shared Parts (useSupabaseOwned.ts)

**Location**: `app/hooks/useSupabaseOwned.ts` lines 138-158

When toggling a parent minifig:

- Check if child is shared (`parentRelations.length > 1`)
- If shared, skip cascade entirely
- **Bug**: Shared parts never update when toggling parents

```typescript
// Current cascade logic
for (const child of row.componentRelations) {
  const isSharedChild = (childRow?.parentRelations?.length ?? 0) > 1;

  // ❌ BUG: Completely skips shared children
  if (isSharedChild) {
    continue;
  }

  const childOwned = nextOwned * child.quantity;
  setOwned(setNumber, child.key, childOwned);
}
```

---

## Solution Design

### Fix 1: Aggregate quantityRequired

In `useInventory.ts`, when a subpart already exists:

```typescript
if (existingIdx != null) {
  const child = working[existingIdx]!;

  // ✅ NEW: Aggregate quantity from this parent
  child.quantityRequired += sp.quantity;

  // ... rest of existing logic
}
```

### Fix 2: Smart Cascade for Shared Parts

Replace the skip logic with contribution-based cascade:

**Key insight**: Each parent minifig contributes a portion of the total required. When a parent is toggled:

- Calculate what this specific parent contributes
- Add/remove that contribution to/from the child's owned quantity

```typescript
// New cascade logic
for (const child of row.componentRelations) {
  const childRow = rows.find(r => r.inventoryKey === child.key);
  if (!childRow) continue;

  // How many does THIS parent need?
  const parentContribution = child.quantity; // e.g., 1 visor

  // Calculate new child owned based on toggle direction
  const currentChildOwned = getOwned(setNumber, child.key);
  const previousParentOwned = getOwned(setNumber, key); // before update

  // Delta: what changed for this parent?
  const parentDelta = nextOwned - previousParentOwned;

  // Apply contribution-weighted delta
  const childDelta = parentDelta * parentContribution;
  const newChildOwned = Math.max(
    0,
    Math.min(childRow.quantityRequired, currentChildOwned + childDelta)
  );

  setOwned(setNumber, child.key, newChildOwned);

  if (enableCloudSync && userId) {
    enqueueChange(child.key, newChildOwned);
  }
}
```

### Fix 3: Update minifigStatusByKey Computation

The status derivation also needs updating since `quantityRequired` changes:

```typescript
// In useInventory.ts minifigStatusByKey useMemo
for (const rel of relations) {
  const childOwned = ownedByKey[rel.key] ?? 0;
  const childRow = rows.find(r => r.inventoryKey === rel.key);

  // For THIS parent, check if its portion is satisfied
  const requiredForThisParent = rel.quantity; // e.g., 1

  // How many are accounted for by other parents?
  const otherParentsNeeded = (childRow?.parentRelations ?? [])
    .filter(pr => pr.parentKey !== key)
    .reduce((sum, pr) => sum + pr.quantity, 0);

  // Available for this parent
  const availableForThisParent = Math.max(0, childOwned - otherParentsNeeded);

  if (availableForThisParent < requiredForThisParent) {
    missingCount += requiredForThisParent - availableForThisParent;
  }
}
```

---

## Implementation Steps

### Step 1: Fix Quantity Aggregation

**File**: `app/hooks/useInventory.ts`

1. In the subpart merge loop, when `existingIdx != null`:
   - Add `child.quantityRequired += sp.quantity;`
   - Ensure componentRelations on parent still points to correct per-parent quantity

### Step 2: Fix Cascade Logic

**File**: `app/hooks/useSupabaseOwned.ts`

1. Capture previous owned value BEFORE calling `setOwned`
2. Replace the skip logic with contribution-based delta calculation
3. Clamp new child owned to valid range `[0, quantityRequired]`

### Step 3: Update Status Derivation

**File**: `app/hooks/useInventory.ts`

1. Update `minifigStatusByKey` computation
2. Account for each parent's share of shared subparts

### Step 4: Add Tests

**Files**:

- `app/hooks/__tests__/useInventory.test.tsx`
- `app/hooks/__tests__/useSupabaseOwned.test.tsx` (new)

Test cases:

1. Two minifigs with same subpart → quantityRequired is sum
2. Toggle first minifig → shared part increases by first minifig's contribution
3. Toggle second minifig → shared part reaches full required
4. Decrement first minifig → shared part decreases correctly
5. Status shows "complete" only when all parts are owned

---

## Edge Cases

### 1. Different quantities per parent

- Minifig A needs 2 visors
- Minifig B needs 1 visor
- Total: 3 visors
- Toggle A: +2 owned
- Toggle B: +1 owned

### 2. Partial ownership

- User manually sets visor owned to 1
- Toggle minifig A (needs 2): owned becomes 3 (1 + 2)
- Decrement minifig A: owned becomes 1 (3 - 2)

### 3. Over-ownership

- User has 5 visors owned
- Toggle off minifig A (needs 2): 5 - 2 = 3
- Toggle off minifig B (needs 1): 3 - 1 = 2

### 4. Data consistency

- `componentRelations[].quantity` on parent = per-minifig requirement
- `parentRelations[].quantity` on child = same per-minifig requirement
- `quantityRequired` on child = sum of all parent contributions

---

## Files to Modify

| File                                            | Changes                                            |
| ----------------------------------------------- | -------------------------------------------------- |
| `app/hooks/useInventory.ts`                     | Fix quantity aggregation, update status derivation |
| `app/hooks/useSupabaseOwned.ts`                 | Fix cascade logic for shared parts                 |
| `app/hooks/__tests__/useInventory.test.tsx`     | Add shared part tests                              |
| `app/hooks/__tests__/useSupabaseOwned.test.tsx` | New test file for cascade                          |

---

## Risk Assessment

- **Low risk**: Quantity aggregation fix is additive and isolated
- **Medium risk**: Cascade logic change affects user data sync
- **Mitigation**: Clamp values to valid range, comprehensive tests

---

## Testing Strategy

1. **Unit tests** for quantity aggregation
2. **Unit tests** for cascade with shared parts
3. **Integration test**: Full flow from inventory load → enrich → toggle → verify
4. **Manual test**: Load a set with shared minifig parts (e.g., multiple Clone Troopers)

---

## Estimated Effort

- Step 1 (Quantity): 15 minutes
- Step 2 (Cascade): 30 minutes
- Step 3 (Status): 20 minutes
- Step 4 (Tests): 45 minutes
- **Total**: ~2 hours
