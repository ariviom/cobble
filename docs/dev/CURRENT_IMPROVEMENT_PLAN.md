# Plan 12: Unified Data Source Audit & Dead Code Cleanup

**Last Updated:** February 15, 2026
**Status:** Complete

## Summary

After completing Plans 08-11 (RB↔BL ID mapping, same-by-default, bricklinkable ingest, RB minifig migration), the codebase has arrived at a **fully RB-catalog-driven architecture**. This plan formalized the current unified approach and removed dead code from the old BL-first minifig approach.

## Current Architecture

| Entity         | Primary Source                                             | BL API Usage                                        |
| -------------- | ---------------------------------------------------------- | --------------------------------------------------- |
| **Parts**      | `rb_parts`, `rb_inventory_parts_public`                    | None                                                |
| **Colors**     | `rb_colors`                                                | None                                                |
| **Sets**       | `rb_sets`, `rb_inventories`                                | None                                                |
| **Minifigs**   | `rb_minifigs`, `rb_inventory_minifigs`, `rb_minifig_parts` | None                                                |
| **Pricing**    | N/A (BL only)                                              | `blGetPartPriceGuide`, `blGetSetPriceGuide`         |
| **Identify**   | RB primary                                                 | `blGetPartSupersets/Subsets/Colors/Part` (fallback) |
| **Validation** | N/A                                                        | `blValidatePart` (on-demand)                        |

## Changes Made

### Phase 1: Removed Dead BL API Functions

- Deleted from `app/lib/bricklink.ts`: `blGetMinifig`, `blGetMinifigSupersets`, `blGetSetSubsets`, `blGetColor`, `blGetPartImageUrl`
- Removed `BLMinifig` type and `minifigSupersetsCache`

### Phase 2: Removed Dead BL Ingest Script

- Deleted `scripts/ingest-bricklink-minifigs.ts`
- Removed `ingest:bricklink-minifigs` npm script from `package.json`

### Phase 3: Cleaned Up catalogAccess.ts

- Removed `bl_sets` and `bricklink_minifig_mappings` from `SERVICE_ROLE_TABLES`
- Kept `bl_set_minifigs` and `bl_minifig_parts` (still used by ingest-rebrickable.ts tier matching)
- Removed `bricklink_minifigs` after replacing its usage in Phase 4

### Phase 4: Replaced /user/[handle] BL Minifig Fallback

- Replaced `bricklink_minifigs` query with `rb_minifigs` lookup via `bl_minifig_id`
- Now returns `num_parts` (which BL catalog didn't have)

### Phase 5: Database Table Cleanup

- Migration `20260215165608_drop_dead_bl_tables.sql` drops `bl_sets` and `bricklink_minifigs`

### Phase 6: Documentation Updates

- Updated `memory/active-context.md`: removed old BL minifig architecture section, updated data source decisions
- Updated `memory/progress.md`: replaced old BL-first minifig entries with unified RB approach
- Archived Plan 10 from this file
