# Minifig ID Architecture Evaluation

## Executive Summary

The current codebase is in a **hybrid state** where we attempted to migrate to BrickLink IDs but several critical components still depend on Rebrickable IDs. This creates confusion, broken functionality, and doesn't fully achieve the goal of having deterministic BrickLink-based minifig identification for pricing and linking.

**Goal**: Remove ALL Rebrickable→BrickLink mapping logic. BrickLink becomes the exclusive source for:

- Minifigure IDs
- Minifigure metadata (name, image)
- Minifigure subassembly parts (heads, torsos, legs, etc.)

---

## Critical Distinction: Subassembly Parts vs. Accessories

### Minifig Subassembly Parts (BL-only)

These are the **component parts that physically make up a minifigure**:

- Head (e.g., `3626cpb2345`)
- Torso (e.g., `973pb1234c01`)
- Legs/Hips (e.g., `970c00pb123`)
- Arms, hands

**Source**: `bl_minifig_parts` table (populated from BL API `/items/MINIFIG/{id}/subsets`)

**Requirement**: These must use BL part IDs and BL-constructed image URLs. They are displayed when toggling a minifig owned/missing on the set page.

### Accessories (No special handling needed)

These are items **included with** the minifigure in the set but **not part of the minifig's body**:

- Weapons (lightsabers, swords, guns)
- Helmets/hats
- Capes
- Tools
- Equipment

**Source**: Regular set inventory from `rb_inventory_parts`

**Key insight**: Accessory part IDs are generally the **same in both Rebrickable and BrickLink** (e.g., `3062b` is a round brick in both systems). These come from the standard inventory and don't require RB→BL mapping.

### Why This Matters

When a user toggles a minifigure owned/missing:

1. The **subassembly parts** (from `bl_minifig_parts`) should toggle with BL IDs and BL images
2. The **accessories** are separate inventory items and are unaffected by this toggle - they remain regular RB inventory items

### Set Page Behavior (Target State)

```
┌─────────────────────────────────────────────────────────────────┐
│ Set 75192-1 Inventory                                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  [☑] sw0100 Han Solo                     ← Toggle minifig       │
│      ├── 3626cpb2345 Head (Light Nougat) ← Auto-toggles (BL)   │
│      ├── 973pb1234c01 Torso (White)      ← Auto-toggles (BL)   │
│      └── 970c00pb123 Legs (Blue)         ← Auto-toggles (BL)   │
│                                                                 │
│  [ ] 64567 Blaster (Black)               ← Separate item (RB)  │
│  [ ] 30246 Wrench (Dark Gray)            ← Separate item (RB)  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

- **Minifig row**: Uses BL ID (`sw0100`), BL image URL
- **Subassembly parts**: Uses BL part IDs, BL color IDs, BL image URLs
- **Accessories**: Uses RB part IDs from inventory (matching IDs in BL anyway)

---

## Current State Analysis

### Components Using Rebrickable IDs (RB)

| Component                   | File                              | Issue                                                            |
| --------------------------- | --------------------------------- | ---------------------------------------------------------------- |
| **`user_minifigs` table**   | Database schema                   | FK constraint to `rb_minifigs.fig_num` - **Cannot store BL IDs** |
| **`user_list_items` table** | Database schema                   | FK constraint to `rb_minifigs.fig_num`                           |
| **Minifig search**          | `app/lib/catalog/minifigs.ts`     | Searches `rb_minifigs` table, returns RB fig_nums                |
| **Set minifig lookup**      | `app/lib/catalog/minifigs.ts`     | Uses `rb_inventory_minifigs` (RB fig IDs)                        |
| **Minifig images**          | `app/lib/catalog/minifigs.ts`     | Uses `rb_minifig_images` table                                   |
| **IndexedDB cache**         | `app/lib/localDb/schema.ts`       | `catalogMinifigs` table has `figNum` (RB format expected)        |
| **useMinifigStatus hook**   | `app/hooks/useMinifigStatus.ts`   | Writes to `user_minifigs` with whatever ID is passed             |
| **Rebrickable API calls**   | `app/lib/rebrickable/minifigs.ts` | `getSetsForMinifig()` uses RB IDs                                |

### Components Using BrickLink IDs (BL)

| Component                  | File                                    | Status                     |
| -------------------------- | --------------------------------------- | -------------------------- |
| **Set inventory minifigs** | `app/lib/bricklink/minifigs.ts`         | ✅ Uses `bl_set_minifigs`  |
| **Minifig detail page**    | `app/api/minifigs/[figNum]/route.ts`    | ✅ Expects BL ID           |
| **Minifig enrichment**     | `app/lib/services/minifigEnrichment.ts` | ✅ Uses BL IDs             |
| **Minifig parts**          | `app/lib/bricklink/minifigs.ts`         | ✅ Uses `bl_minifig_parts` |
| **Inventory service**      | `app/lib/services/inventory.ts`         | ✅ Returns BL IDs          |

### Components Doing RB→BL Mapping (Problematic)

| Component            | File                                            | Issue                                                                |
| -------------------- | ----------------------------------------------- | -------------------------------------------------------------------- |
| **Search results**   | `app/api/search/minifigs/route.ts`              | Returns RB IDs, then maps to BL IDs separately                       |
| **sync-from-sets**   | `app/api/user/minifigs/sync-from-sets/route.ts` | Uses RB fig_id from `bl_set_minifigs.rb_fig_id` (FK compliance hack) |
| **Identify handler** | `app/api/identify/sets/handlers/minifig.ts`     | Accepts both, maps between them                                      |
| **getUserMinifigs**  | `app/lib/server/getUserMinifigs.ts`             | Assumes `user_minifigs.fig_num` is BL ID (incorrect!)                |

---

## Root Problem

The **foreign key constraint** on `user_minifigs.fig_num` → `rb_minifigs.fig_num` prevents us from storing BrickLink IDs in user collections. This cascades into:

1. **Search results use RB IDs** because the search is against `rb_minifigs`
2. **User collections use RB IDs** because of the FK
3. **Need RB→BL mapping everywhere** to display BL info/links/pricing
4. **Data inconsistency** when mapping fails or doesn't exist

---

## The Goal (Restated)

> **Deterministic BrickLink-based minifig identification** for:
>
> - Pricing lookups
> - BrickLink URL linking
> - Consistent display across the app
> - No manual RB→BL mapping or review needed

---

## Options for Moving Forward

### Option A: Full BrickLink Migration (Recommended)

**Drop all RB dependencies for minifig IDs.** BrickLink becomes the sole source of truth.

#### Changes Required

1. **Database Migration**
   - Drop FK constraint on `user_minifigs.fig_num` → `rb_minifigs`
   - Drop FK constraint on `user_list_items.minifig_id` → `rb_minifigs`
   - Document that `fig_num` now stores BL minifig IDs
   - Add index on `bl_set_minifigs(minifig_no)` if not exists

2. **Search System**
   - Replace `searchMinifigsLocal()` to search `bricklink_minifigs` instead of `rb_minifigs`
   - Or: Search `bl_set_minifigs` and deduplicate by `minifig_no`
   - Return BL IDs directly (no mapping step)

3. **User Data**
   - Nuke `user_minifigs` (single user, pre-launch)
   - Re-sync from sets using BL IDs
   - Update `useMinifigStatus` to work with BL IDs

4. **API Consistency**
   - All minifig endpoints accept/return BL IDs only
   - Remove all RB fig_num → BL minifig_no mapping code
   - Minifig detail page URL uses BL ID

5. **IndexedDB Cache**
   - Update `catalogMinifigs` to use BL ID as primary key
   - Migration for any cached data

#### Pros

- Clean, deterministic system
- No mapping logic needed
- Pricing/linking always works
- Simpler codebase

#### Cons

- Requires database migration
- User data reset (acceptable pre-launch)
- Minifig search might return fewer results initially (only minifigs in BL catalog)

---

### Option B: Keep RB as Catalog, BL for Display

**Keep RB as the catalog source, but always display BL info when available.**

#### How It Would Work

- Search uses `rb_minifigs` (comprehensive catalog)
- User data stores RB IDs (FK compliant)
- Display layer always looks up BL ID via `bl_set_minifigs.rb_fig_id`
- Pricing/linking uses BL ID when mapped, falls back to RB info

#### Pros

- No database migration needed
- Larger search catalog (RB has more minifigs)
- Existing user data preserved

#### Cons

- Still requires mapping layer
- Mapping can fail/be incomplete
- More complex code
- Doesn't solve the core problem

---

## Recommendation: Option A (Full BL Migration)

Given:

- Pre-launch phase with single user
- Goal of deterministic BL-based identification
- Pricing/linking require BL IDs
- Complexity of maintaining mapping layer

**Option A is the cleanest path forward.**

---

## Immediate Action Items (Quick Wins)

Before the full migration, fix the "No Image" issue for subassembly parts:

1. **Add `getBlPartImageUrl()` to `app/lib/bricklink/minifigs.ts`**
2. **Update `enrichMinifigs()` to use BL part image URLs**
3. **Verify images appear on set page**

This is a minimal change that fixes the visible bug while the larger migration proceeds.

---

## Implementation Plan

### Phase 1: Database Migration (Day 1)

```sql
-- Drop FK constraints that prevent BL ID storage
ALTER TABLE user_minifigs DROP CONSTRAINT IF EXISTS user_minifigs_fig_num_fkey;
ALTER TABLE user_list_items DROP CONSTRAINT IF EXISTS user_list_items_minifig_id_fkey;

-- Add comment documenting the change
COMMENT ON COLUMN user_minifigs.fig_num IS 'BrickLink minifig ID (e.g., sw0001). FK to rb_minifigs removed to allow BL IDs.';

-- Ensure indexes exist for BL queries
CREATE INDEX IF NOT EXISTS idx_bricklink_minifigs_item_id ON bricklink_minifigs(item_id);
CREATE INDEX IF NOT EXISTS idx_bl_set_minifigs_minifig_no ON bl_set_minifigs(minifig_no);
```

### Phase 2: Minifig Subassembly Part Images (Day 1)

**Critical fix**: Subassembly parts currently show "No Image" because `imageUrl` is always `null`.

1. **Add BL part image URL constructor**:

```typescript
// In app/lib/bricklink/minifigs.ts
export function getBlPartImageUrl(partNo: string, colorId: number): string {
  return `https://img.bricklink.com/ItemImage/PN/${colorId}/${encodeURIComponent(partNo)}.png`;
}
```

2. **Update `enrichMinifigs()` in `minifigEnrichment.ts`**:

```typescript
// Line 197-205 - update to include images
const subparts: MinifigSubpart[] = parts.map(p => ({
  partId: p.blPartId,
  name: p.name ?? p.blPartId,
  colorId: p.blColorId,
  colorName: colorCache.get(p.blColorId) ?? `Color ${p.blColorId}`,
  quantity: p.quantity,
  imageUrl: getBlPartImageUrl(p.blPartId, p.blColorId), // ← FIX
  bricklinkPartId: p.blPartId,
}));
```

3. **Ensure image domain is allowed**:

- Already configured in `next.config.ts` for `img.bricklink.com`

### Phase 3: Search System Rewrite (Day 1-2)

Replace `searchMinifigsLocal()` in `app/lib/catalog/minifigs.ts` to:

1. Search `bricklink_minifigs` table by name/ID
2. Fall back to `bl_set_minifigs` for minifigs not in catalog
3. Return BL IDs directly (no mapping)
4. Get images from `bl_set_minifigs.image_url` or construct BL URL

### Phase 4: Simplify API Layer (Day 2)

1. **`/api/search/minifigs`** - Remove RB→BL mapping, return BL IDs
2. **`/api/minifigs/[figNum]`** - Already BL-centric, verify
3. **`/api/user/minifigs/sync-from-sets`** - Store BL IDs directly (FK removed)
4. **`/api/user/minifigs`** - Expect BL IDs in storage

### Phase 5: Client Updates (Day 2-3)

1. **`useMinifigStatus`** - Works with BL IDs
2. **`useMinifigMeta`** - Simplified (BL ID is primary)
3. **IndexedDB** - Update cache key to use BL ID
4. **UI Components** - Ensure all minifig links use BL ID

### Phase 6: User Data Migration (Day 3)

1. Run `export-user-set-ids.ts` (backup)
2. Run `nuke-user-minifigs.ts --confirm`
3. Trigger sync-from-sets to repopulate with BL IDs

### Phase 7: Legacy Code Removal (Day 3-4)

Delete all RB→BL mapping code and tooling:

| File                               | Action        | Reason                                           |
| ---------------------------------- | ------------- | ------------------------------------------------ |
| `app/lib/minifigMapping.ts`        | **DELETE**    | Re-exports mapping functions                     |
| `app/lib/minifigMappingBatched.ts` | **DELETE**    | Core mapping logic                               |
| `app/api/dev/minifig-mappings/`    | **DELETE**    | Dev tooling for manual review                    |
| `app/dev/minifig-review/`          | **DELETE**    | Manual review UI                                 |
| `scripts/minifig-mapping-core.ts`  | **REWRITE**   | Keep only BL data fetching, remove mapping logic |
| `bricklink_minifig_mappings` table | **DEPRECATE** | No longer needed (keep for historical reference) |

Functions to remove:

- `mapBrickLinkFigToRebrickable()`
- `mapRebrickableFigToBrickLinkOnDemand()`
- `getMinifigMappingsForSetBatched()`
- `getGlobalMinifigMappingsBatch()`
- `mapBlToRbFigId()` (after FK removal)

---

## Files to Modify

### Priority 1: Core BL-only Infrastructure

| File                                               | Action                                          |
| -------------------------------------------------- | ----------------------------------------------- |
| `app/lib/bricklink/minifigs.ts`                    | **UPDATE** - Add `getBlPartImageUrl()` helper   |
| `app/lib/services/minifigEnrichment.ts`            | **UPDATE** - Use BL part image URLs in subparts |
| `supabase/migrations/YYYYMMDD_drop_minifig_fk.sql` | **CREATE** - Drop FK constraints                |

### Priority 2: Search System

| File                               | Action                                       |
| ---------------------------------- | -------------------------------------------- |
| `app/lib/catalog/minifigs.ts`      | **REWRITE** - Search BL tables instead of RB |
| `app/api/search/minifigs/route.ts` | **SIMPLIFY** - Remove RB→BL mapping          |

### Priority 3: API Layer

| File                                            | Action                                             |
| ----------------------------------------------- | -------------------------------------------------- |
| `app/api/user/minifigs/sync-from-sets/route.ts` | **UPDATE** - Store BL IDs directly (after FK drop) |
| `app/api/minifigs/[figNum]/route.ts`            | **VERIFY** - Already BL-centric                    |
| `app/lib/server/getUserMinifigs.ts`             | **VERIFY** - Already expects BL                    |

### Priority 4: Client Layer

| File                                         | Action                             |
| -------------------------------------------- | ---------------------------------- |
| `app/hooks/useMinifigStatus.ts`              | **VERIFY** - Works with BL         |
| `app/lib/localDb/schema.ts`                  | **UPDATE** - BL ID as key          |
| `app/lib/localDb/minifigCache.ts`            | **UPDATE** - BL ID lookups         |
| `app/components/set/items/InventoryItem.tsx` | **VERIFY** - Uses BL IDs for links |

### Priority 5: Legacy Removal

| File                               | Action                                            |
| ---------------------------------- | ------------------------------------------------- |
| `app/lib/minifigMapping.ts`        | **DELETE**                                        |
| `app/lib/minifigMappingBatched.ts` | **DELETE**                                        |
| `app/api/dev/minifig-mappings/`    | **DELETE** (directory)                            |
| `app/dev/minifig-review/`          | **DELETE** (directory)                            |
| `app/lib/rebrickable/minifigs.ts`  | **DEPRECATE** - Remove minifig-specific functions |

---

## Success Criteria

- [ ] All minifig IDs in the app are BrickLink IDs (e.g., `sw0001`, `cty1234`)
- [ ] No RB fig_num (e.g., `fig-000001`) appears in UI or user data
- [ ] Search returns minifigs with BL IDs directly
- [ ] User collections store BL IDs
- [ ] Pricing/BrickLink links work without mapping
- [ ] No `mapRbToBl` or `mapBlToRb` functions needed
- [ ] `bricklink_minifig_mappings` table is unused (historical only)
- [ ] Minifig subassembly parts display with BL part IDs and BL images
- [ ] Toggling a minifig owned/missing also toggles its subassembly parts
- [ ] All mapping/review dev tooling is removed

---

## What Remains Unchanged

### Regular Parts (from Rebrickable)

The standard set inventory parts continue to come from Rebrickable:

- `rb_inventory_parts` - Part quantities per set
- `rb_parts` - Part catalog
- `rb_colors` - Color definitions

**Rationale**: RB has a more complete parts catalog. Part IDs are generally the same between RB and BL for standard parts. When BL-specific part IDs are needed for pricing, we use `rb_bl_part_mappings` or `rb_bl_color_mappings`.

### Accessories Included with Minifigs

Accessories (weapons, helmets, capes) are **not** part of the minifig subassembly. They appear in the regular set inventory and don't need special RB→BL mapping.

### Sets

Set data continues to come from RB (`rb_sets`), with BL-specific enrichment where needed.

---

## Testing Strategy

### Unit Tests

| Test                     | Description                                      |
| ------------------------ | ------------------------------------------------ |
| `getBlMinifigImageUrl()` | Returns correct BL minifig image URL             |
| `getBlPartImageUrl()`    | Returns correct BL part image URL with color     |
| `getSetMinifigsBl()`     | Returns minifigs with BL IDs, triggers self-heal |
| `getMinifigPartsBl()`    | Returns parts with BL IDs, triggers self-heal    |
| `enrichMinifigs()`       | Returns subparts with BL images                  |

### Integration Tests

| Test              | Description                             |
| ----------------- | --------------------------------------- |
| Set page load     | Minifigs load with BL IDs and images    |
| Minifig toggle    | Subassembly parts toggle with parent    |
| Search            | Returns BL IDs directly, no RB prefix   |
| User minifig sync | Stores BL IDs in `user_minifigs`        |
| Self-healing      | Triggers BL API fetch when data missing |

### Removal Verification Tests

| Test                           | Description                                     |
| ------------------------------ | ----------------------------------------------- |
| No RB fig_num in API responses | Verify no `fig-XXXXXX` format returned          |
| No mapping functions called    | Verify `mapBlToRb` / `mapRbToBl` unused         |
| Dev tooling removed            | Verify `/api/dev/minifig-mappings/` returns 404 |

---

## Estimated Effort

| Phase                   | Effort     |
| ----------------------- | ---------- |
| Database migration      | 1h         |
| Subassembly part images | 1-2h       |
| Search system rewrite   | 4-6h       |
| API simplification      | 2-3h       |
| Client updates          | 2-3h       |
| User data migration     | 0.5h       |
| Legacy code removal     | 2-3h       |
| Testing                 | 3-4h       |
| **Total**               | **16-23h** |

---

## Questions to Resolve

1. **Search coverage**: Will searching only BL catalog miss some minifigs?
   - Mitigation: Also search `bl_set_minifigs` which has all minifigs from synced sets

2. **Minifigs not in any set**: How to handle standalone minifigs?
   - These are rare; BL catalog (`bricklink_minifigs`) should have them

3. **Future RB features**: Will we need RB minifig data later?
   - Keep `rb_minifigs` table read-only for reference, but don't use for IDs

4. **Part image URL reliability**: Do BL part images always exist?
   - Pattern: `https://img.bricklink.com/ItemImage/PN/{color_id}/{part_no}.png`
   - Fallback: Use generic part placeholder if 404

5. **Color ID consistency**: Are BL color IDs stored correctly in `bl_minifig_parts`?
   - Verify `bl_color_id` column is populated from API response
   - Cross-reference with `rb_colors` for names (IDs should match)

---

## Next Steps

1. **Review and approve this plan**
2. **Quick Win**: Add `getBlPartImageUrl()` and fix subassembly part images (1-2h)
3. **Database Migration**: Create and run FK drop migration
4. **Search Rewrite**: Replace RB minifig search with BL search
5. **API Simplification**: Remove all mapping functions
6. **User Data Migration**: Nuke and re-sync from sets
7. **Legacy Removal**: Delete mapping files and dev tooling
8. **Testing**: Run test suite, verify no RB IDs in responses

---

## Appendix: BrickLink Image URL Patterns

| Item Type | URL Pattern                                                       |
| --------- | ----------------------------------------------------------------- |
| Minifig   | `https://img.bricklink.com/ItemImage/MN/0/{minifig_no}.png`       |
| Part      | `https://img.bricklink.com/ItemImage/PN/{color_id}/{part_no}.png` |
| Set       | `https://img.bricklink.com/ItemImage/SN/0/{set_no}.png`           |

These URLs are predictable and don't require API calls to construct.
