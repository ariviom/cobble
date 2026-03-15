# Shared Minifigure Parts Fix - Complete

## Summary

Successfully fixed the issue where sets with multiple minifigures sharing the same subpart (e.g., two minifigs with the same visor) would incorrectly:

1. Display only 1 part required instead of 2
2. Skip cascade updates when toggling parent minifigs

## Problem

When a set contains multiple minifigures that share subparts:

- **Example**: Set has Luke and Han, both need the same visor (part `98100:1`)
- **Expected**: `quantityRequired: 2` (1 for Luke + 1 for Han)
- **Actual Before Fix**: `quantityRequired: 1` (only counted once)
- **Expected**: Toggling Luke adds 1 visor, toggling Han adds 1 more
- **Actual Before Fix**: Cascade was skipped entirely for shared parts

## Root Causes

### Issue 1: Quantity Not Aggregated (useInventory.ts)

When enrichment processed minifig subparts:

- First minifig created subpart row with `quantityRequired: 1`
- Second minifig found existing row, added to `parentRelations`
- **Bug**: `quantityRequired` was never incremented

### Issue 2: Cascade Skipped Shared Parts (useSupabaseOwned.ts)

The cascade logic intentionally skipped shared parts:

```typescript
const isSharedChild = (childRow?.parentRelations?.length ?? 0) > 1;
if (isSharedChild) {
  continue; // ❌ Completely skipped
}
```

## Solution Implemented

### Fix 1: Aggregate Quantities in useInventory.ts

**Location**: `app/hooks/useInventory.ts` lines ~245-267

Added aggregation when a subpart already exists:

```typescript
if (!alreadyLinked) {
  // This is a new parent for this child (shared part)
  // Aggregate the quantity required
  child.quantityRequired += sp.quantity;
  child.parentRelations.push({
    parentKey,
    quantity: sp.quantity,
  });
}
```

### Fix 2: Contribution-Based Cascade in useSupabaseOwned.ts

**Location**: `app/hooks/useSupabaseOwned.ts` lines ~121-171

Replaced skip logic with contribution-based delta calculation:

```typescript
// Get current parent owned BEFORE updating
const previousParentOwned = getOwned(setNumber, key);
const parentDelta = nextOwned - previousParentOwned;

for (const child of row.componentRelations) {
  const childRow = rows.find(r => r.inventoryKey === child.key);
  if (!childRow) continue;

  // How many does THIS parent need?
  const parentContribution = child.quantity;

  // Current child owned
  const currentChildOwned = getOwned(setNumber, child.key);

  // Calculate contribution-based delta
  const childDelta = parentDelta * parentContribution;
  const newChildOwned = Math.max(
    0,
    Math.min(childRow.quantityRequired, currentChildOwned + childDelta)
  );

  // Update child (skip cascade to avoid infinite loop)
  setOwned(setNumber, child.key, newChildOwned);

  // Enqueue child for sync if cloud sync enabled
  if (enableCloudSync && userId) {
    enqueueChange(child.key, newChildOwned);
  }
}
```

**Key Changes**:

- Capture `previousParentOwned` BEFORE updating parent
- Calculate delta: `parentDelta = nextOwned - previousParentOwned`
- Apply proportional change: `childDelta = parentDelta * parentContribution`
- Clamp to valid range: `[0, quantityRequired]`
- Works for both increment and decrement

### Fix 3: Update Status Computation in useInventory.ts

**Location**: `app/hooks/useInventory.ts` lines ~328-360

Updated minifig status to check total required for shared parts:

```typescript
for (const rel of relations) {
  const childOwned = ownedByKey[rel.key] ?? 0;
  const childRow = rows.find(r => r.inventoryKey === rel.key);

  // For shared parts, check if total owned meets total required
  // (quantityRequired is now aggregated for shared parts)
  const totalChildRequired = childRow?.quantityRequired ?? rel.quantity;

  if (childOwned < totalChildRequired) {
    // Not enough to satisfy ALL parents (including this one)
    // This parent's portion is considered missing
    missingCount += rel.quantity;
  }
}
```

## Example Scenarios

### Scenario 1: Two Minifigs, Same Visor

- Luke needs 1 visor, Han needs 1 visor
- **Total Required**: 2 visors
- **Toggle Luke**: owned 0 → 1
- **Toggle Han**: owned 1 → 2
- **Status**: Both show "complete" when 2 visors owned

### Scenario 2: Different Quantities

- Minifig A needs 2 helmets, Minifig B needs 1 helmet
- **Total Required**: 3 helmets
- **Toggle A**: owned 0 → 2
- **Toggle B**: owned 2 → 3
- **Decrement A**: owned 3 → 1

### Scenario 3: Partial Manual Ownership

- User manually sets visor owned to 1
- **Toggle Minifig A** (needs 2): 1 + 2 = 3 owned
- **Decrement Minifig A**: 3 - 2 = 1 owned

## Files Modified

| File                                        | Changes                                                |
| ------------------------------------------- | ------------------------------------------------------ |
| `app/hooks/useInventory.ts`                 | Added quantity aggregation, updated status computation |
| `app/hooks/useSupabaseOwned.ts`             | Replaced skip logic with contribution-based cascade    |
| `app/hooks/__tests__/useInventory.test.tsx` | Added tests for shared parts                           |

## Testing

### New Tests Added

1. `aggregates quantityRequired for shared minifig parts` - Verifies quantity aggregation
2. `computes minifig status correctly for shared parts` - Verifies status with 0, 1, and 2 visors owned

### Test Results

- ✅ Build successful
- ✅ All 208 tests passing
- ✅ No TypeScript errors
- ✅ No linter errors

## Edge Cases Handled

1. **Different quantities per parent**: Minifig A needs 2, Minifig B needs 1 → total 3
2. **Partial ownership**: User has 1, toggle adds 2 → total 3
3. **Over-ownership**: User has 5, decrement removes 2 → total 3
4. **Shared validation**: Parent status only "complete" when total owned ≥ total required
5. **Clamp to range**: New owned is clamped to `[0, quantityRequired]`

## Data Consistency

- `componentRelations[].quantity` on parent = per-minifig requirement (e.g., 1)
- `parentRelations[].quantity` on child = same per-minifig requirement (e.g., 1)
- `quantityRequired` on child = sum of all parent contributions (e.g., 2)

## Date Completed

December 31, 2025

## Impact

This fix ensures that:

- Shared minifig parts display the correct total quantity needed
- Toggling any parent minifig correctly updates shared part quantities
- Multiple minifigs can be toggled independently without conflicts
- The system accurately tracks inventory for complex sets with shared parts
