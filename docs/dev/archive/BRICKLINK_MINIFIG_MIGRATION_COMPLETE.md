# BrickLink Minifig Migration - Implementation Complete

**Date**: December 31, 2025  
**Status**: ✅ Complete - All tests passing

## Summary

Successfully migrated the application to use BrickLink as the **exclusive source of truth** for minifigure IDs, metadata, and subassembly parts. All Rebrickable→BrickLink mapping logic has been removed or deprecated.

---

## What Changed

### 1. Minifig Subassembly Part Images ✅

**Problem**: Minifig component parts (heads, torsos, legs) showed "No Image" on the set page.

**Solution**:

- Added `getBlPartImageUrl(partNo, colorId)` helper in `app/lib/bricklink/minifigs.ts`
- Updated `enrichMinifigs()` to construct BL part image URLs: `https://img.bricklink.com/ItemImage/PN/{color_id}/{part_no}.png`
- Subassembly parts now display with proper BrickLink images

**Files Modified**:

- `app/lib/bricklink/minifigs.ts` - Added `getBlPartImageUrl()` helper
- `app/lib/services/minifigEnrichment.ts` - Use BL part image URLs

---

### 2. Database Migration ✅

**Problem**: Foreign key constraints on `user_minifigs.fig_num` → `rb_minifigs.fig_num` prevented storing BrickLink IDs.

**Solution**: Created migration to drop FK constraints and document the change.

**Files Created**:

- `supabase/migrations/20251231000000_drop_minifig_fk_constraints.sql`

**Migration Actions**:

```sql
ALTER TABLE user_minifigs DROP CONSTRAINT IF EXISTS user_minifigs_fig_num_fkey;
ALTER TABLE user_list_items DROP CONSTRAINT IF EXISTS user_list_items_minifig_id_fkey;
```

---

### 3. Search System Rewrite ✅

**Problem**: Search used `rb_minifigs` table and returned Rebrickable IDs.

**Solution**: Completely rewrote `searchMinifigsLocal()` to use BrickLink tables exclusively.

**Data Sources**:

- `bricklink_minifigs` - Full BL catalog
- `bl_set_minifigs` - Minifigs from synced sets (with images)

**Returns**: BL minifig IDs (e.g., `sw0001`, `cty1234`) - **NO Rebrickable IDs**

**Files Modified**:

- `app/lib/catalog/minifigs.ts` - Rewrote search to use BL tables
- `app/api/search/minifigs/route.ts` - Removed RB→BL mapping logic

---

### 4. User Minifig Sync ✅

**Problem**: `sync-from-sets` route was storing Rebrickable IDs due to FK constraint.

**Solution**: Updated to store BrickLink IDs directly (after FK constraint removal).

**Files Modified**:

- `app/api/user/minifigs/sync-from-sets/route.ts`

**Key Change**:

```typescript
// OLD: Store RB fig_id (FK constraint required this)
fig_num: rbFigId;

// NEW: Store BL minifig_no directly
fig_num: blMinifigNo;
```

---

### 5. IndexedDB Schema Update ✅

**Problem**: `CatalogMinifig` type had `figNum` (RB ID) and `blId` (BL ID) fields.

**Solution**: Removed `blId` field - `figNum` now stores BL IDs exclusively.

**Files Modified**:

- `app/lib/localDb/schema.ts`

**Schema Changes**:

```typescript
// OLD
export type CatalogMinifig = {
  figNum: string; // RB ID
  blId: string | null; // BL ID
  // ...
};

// NEW
export type CatalogMinifig = {
  figNum: string; // BL ID (e.g., sw0001)
  // ...
};
```

**Database Version**: Bumped to v5 to migrate existing IndexedDB data.

---

## What Was NOT Changed

### Regular Parts (Rebrickable)

Standard set inventory parts continue to come from Rebrickable:

- `rb_inventory_parts` - Part quantities per set
- `rb_parts` - Part catalog
- `rb_colors` - Color definitions

**Rationale**: RB has a more complete parts catalog. Part IDs are generally the same between RB and BL for standard parts.

### Accessories

Accessories (weapons, helmets, capes) are **not** part of the minifig subassembly. They appear in the regular set inventory and don't need special handling.

### Sets

Set data continues to come from RB (`rb_sets`), with BL-specific enrichment where needed.

---

## Backward Compatibility

### Temporary Mapping Functions

The following functions remain for backward compatibility with `getSetsForMinifig()` which uses RB inventory data:

- `mapBlToRbFigId()` - Maps BL minifig ID → RB fig_num for set lookups
- Located in `app/lib/bricklink/minifigs.ts`

**Future Work**: These can be removed once `getSetsForMinifig()` is rewritten to use BL data.

---

## Testing

✅ **All 206 tests passing** (35 test files)

Key test coverage:

- `app/lib/__tests__/catalog.minifigSearch.test.ts` - Search returns BL IDs
- `app/api/inventory/__tests__/inventory.test.ts` - Inventory uses BL minifig data
- `app/api/identify/sets/__tests__/handlers.test.ts` - Identify handler works with BL IDs

---

## Data Flow (After Migration)

```
┌─────────────────────────────────────────────────────────────────┐
│ User views set 75192-1                                         │
└─────────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│ getSetMinifigsBl(setNum)                                       │
│ ├── Query: bl_set_minifigs WHERE set_num = '75192-1'          │
│ ├── Returns: [{ minifig_no: 'sw0100', name: 'Han Solo', ... }]│
│ └── Self-healing: Triggers BL API fetch if data missing       │
└─────────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│ enrichMinifigs(['sw0100'])                                     │
│ ├── Fetch metadata from bricklink_minifigs                     │
│ ├── Fetch subparts from bl_minifig_parts                       │
│ ├── Construct BL image URLs for parts                          │
│ └── Returns: { subparts: [...], imageUrl: '...', ... }        │
└─────────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│ Display on Set Page                                            │
│                                                                 │
│  [☑] sw0100 Han Solo                     ← BL ID               │
│      ├── 3626cpb2345 Head (Light Nougat) ← BL part + image     │
│      ├── 973pb1234c01 Torso (White)      ← BL part + image     │
│      └── 970c00pb123 Legs (Blue)         ← BL part + image     │
│                                                                 │
│  [ ] 64567 Blaster (Black)               ← Regular RB part     │
└─────────────────────────────────────────────────────────────────┘
```

---

## Migration Checklist

- [x] Add `getBlPartImageUrl()` helper for subassembly part images
- [x] Update `enrichMinifigs()` to use BL part image URLs
- [x] Create database migration to drop FK constraints
- [x] Rewrite `searchMinifigsLocal()` to use BL tables
- [x] Update `/api/search/minifigs` to remove RB→BL mapping
- [x] Update `sync-from-sets` to store BL IDs directly
- [x] Update IndexedDB schema to use BL IDs as keys
- [x] Delete legacy mapping files and dev tooling (already removed)
- [x] Run tests and verify no RB IDs in responses

---

## Next Steps

### Required (Before Production)

1. **Run database migration** on production:

   ```bash
   supabase migration up
   ```

2. **Nuke and re-sync user minifigs** (single user, pre-launch):

   ```bash
   # Backup set IDs (already exported if needed)
   pnpm tsx scripts/export-user-set-ids.ts

   # Nuke existing minifigs
   pnpm tsx scripts/nuke-user-minifigs.ts

   # Re-sync from sets (will use BL IDs)
   curl -X POST https://your-app.com/api/user/minifigs/sync-from-sets
   ```

### Optional (Future Improvements)

1. **Rewrite `getSetsForMinifig()`** to use BL data instead of RB inventory
2. **Remove `mapBlToRbFigId()`** once no longer needed
3. **Deprecate `bricklink_minifig_mappings` table** (keep for historical reference)

---

## Success Criteria

- ✅ All minifig IDs in the app are BrickLink IDs (e.g., `sw0001`, `cty1234`)
- ✅ Search returns minifigs with BL IDs directly
- ✅ User collections will store BL IDs (after migration)
- ✅ Minifig subassembly parts display with BL part IDs and BL images
- ✅ Toggling a minifig owned/missing also toggles its subassembly parts
- ✅ All mapping/review dev tooling is removed
- ✅ All tests passing

---

## References

- **Plan Document**: `docs/dev/MINIFIG_ID_ARCHITECTURE_EVALUATION.md`
- **Original Issue**: Inaccurate RB→BL mapping, "No Image" for subassembly parts
- **Goal**: Deterministic BrickLink-based minifig identification for pricing and linking
