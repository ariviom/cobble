# Minifig Mapping Analysis

## Overview

This document analyzes the minifig mapping system and documents the fix for set 10244-1 as a case study.

## System Architecture

### Data Flow

```
Rebrickable CSV → rb_inventories, rb_inventory_minifigs, rb_minifigs
                       ↓
BrickLink API → bl_set_minifigs (with rb_fig_id linkage)
                       ↓
Automatic Mapping Algorithm → bricklink_minifig_mappings
                       ↓
Manual Review UI → Manual corrections & approvals
```

### Tables

1. **`rb_minifigs`**: Rebrickable minifig catalog
2. **`rb_inventories`**: Rebrickable set inventories (multiple versions per set)
3. **`rb_inventory_minifigs`**: Junction table linking inventories to minifigs
4. **`bl_set_minifigs`**: BrickLink set minifigs with `rb_fig_id` foreign key
5. **`bricklink_minifig_mappings`**: Global RB→BL mappings with confidence scores

## Case Study: Set 10244-1 (Fairground Mixer)

### Problem

User reported: "I only see 8 of the 13 minifigures for the set I provided."

After investigation:

- BrickLink: 13 minifigs (twn198-twn209, plus twn204a)
- Rebrickable: 12 unique minifigs across 2 inventory versions
- Initial mappings: Only 10 minifigs had `rb_fig_id` values

### Root Cause

The automatic mapping algorithm uses the **latest** Rebrickable inventory version (version 2 for this set), which has only 11 minifigs. This meant 3 minifigs from version 1 were not included in the candidate pool:

**Version 1 (12 figs):** fig-009172 through fig-009183  
**Version 2 (11 figs):** Same as V1, but fig-009179 replaced by fig-011219, and fig-009179 removed

**Minifigs only in Version 1:**

- fig-009174: "Blue Torso, Red Legs, Dark Bluish Grey Kepi"
- fig-009181: "Dark Purple Torso, Dark Tan Legs, Dark Bluish Grey Legs"
- fig-009182: "Orange Torso, Reddish Brown Legs, Dark BLuish Grey Cap"

**BrickLink minifigs without mappings:**

- twn198: "Dunk Tank Lady"
- twn199: "Juggling Man"
- twn201: "Ticket Lady"

### Solution Applied

Manual mappings were created based on name analysis:

| BrickLink ID | BrickLink Name | Rebrickable ID | Rebrickable Name                            |
| ------------ | -------------- | -------------- | ------------------------------------------- |
| twn199       | Juggling Man   | fig-009174     | Blue Torso, Red Legs, Dark Bluish Grey Kepi |
| twn201       | Ticket Lady    | fig-009181     | Dark Purple Torso, Dark Tan Legs            |
| twn198       | Dunk Tank Lady | fig-009182     | Orange Torso, Reddish Brown Legs            |

**SQL executed:**

```sql
UPDATE bl_set_minifigs SET rb_fig_id = 'fig-009174' WHERE set_num = '10244-1' AND minifig_no = 'twn199';
UPDATE bl_set_minifigs SET rb_fig_id = 'fig-009181' WHERE set_num = '10244-1' AND minifig_no = 'twn201';
UPDATE bl_set_minifigs SET rb_fig_id = 'fig-009182' WHERE set_num = '10244-1' AND minifig_no = 'twn198';

INSERT INTO bricklink_minifig_mappings (rb_fig_id, bl_item_id, confidence, source, manually_approved)
VALUES
  ('fig-009174', 'twn199', 0.95, 'manual', true),
  ('fig-009181', 'twn201', 0.95, 'manual', true),
  ('fig-009182', 'twn198', 0.95, 'manual', true)
ON CONFLICT (rb_fig_id) DO UPDATE SET bl_item_id = EXCLUDED.bl_item_id, confidence = EXCLUDED.confidence, source = EXCLUDED.source, manually_approved = EXCLUDED.manually_approved, reviewed_at = NOW();
```

### Result

✅ All 13 minifigs now display in the review UI  
✅ Manual mappings marked with `manually_approved = true`  
✅ Source displayed as "manual-approval" in UI

## Broader Analysis

### Sets with Unmapped Minifigs

Query to find problematic sets:

```sql
SELECT
  set_num,
  COUNT(*) as total_minifigs,
  COUNT(*) FILTER (WHERE rb_fig_id IS NOT NULL) as mapped_count,
  COUNT(*) FILTER (WHERE rb_fig_id IS NULL) as unmapped_count,
  ROUND(100.0 * COUNT(*) FILTER (WHERE rb_fig_id IS NOT NULL) / COUNT(*), 1) as mapped_pct
FROM bl_set_minifigs
GROUP BY set_num
HAVING COUNT(*) FILTER (WHERE rb_fig_id IS NULL) > 0
ORDER BY unmapped_count DESC, set_num;
```

**Top offenders (as of analysis):**

- `3407-1`: 1/37 mapped (2.7%)
- `3569-1`: 3/28 mapped (10.7%)
- `9247-1`: 7/32 mapped (21.9%)
- `10188-1`: 15/27 mapped (55.6%)
- **`10244-1`: 10/13 mapped (76.9%)** ← Fixed to 13/13 (100%)

### Common Causes of Unmapped Minifigs

1. **Multiple Rebrickable inventory versions**
   - Algorithm uses latest version only
   - Older versions may have different minifigs

2. **BrickLink-exclusive minifigs**
   - Promotional figures not in Rebrickable catalog
   - Regional exclusives
   - Mismatched inventory databases

3. **Name mismatch**
   - Different naming conventions between platforms
   - Spelling variations
   - Different detail levels in descriptions

4. **Missing Rebrickable data**
   - Some BrickLink minifigs genuinely don't exist in RB database

## Algorithm Improvements

### Recommended Enhancements

1. **Use union of all inventory versions**

   ```typescript
   // Instead of just latest version
   const allVersionMinifigs = await getAllInventoryVersions(setNum);
   const uniqueMinifigs = [...new Set(allVersionMinifigs.flat())];
   ```

2. **Enhanced name similarity**
   - Already implemented: substring matching, key name extraction
   - Future: NLP-based semantic similarity

3. **Image similarity (pHash)**
   - Already implemented and active
   - Helps disambiguate visually similar minifigs

4. **Process of elimination**
   - Already implemented
   - Boosts confidence for "last fig standing" scenarios

5. **Flag unmapped for manual review**
   - Add UI indicator for sets with unmapped minifigs
   - Priority queue for review based on set popularity

### Manual Review Workflow

The review UI (`/dev/minifig-review`) now supports:

- ✅ Filtering by specific set
- ✅ Viewing all minifigs (mapped and unmapped)
- ✅ Real-time updates after manual actions
- ✅ Manual approval marking (100% confidence)
- ✅ Visual selector for easy remapping
- ✅ Debounced set search input

## Conclusion

Set 10244-1 demonstrated a limitation in the automatic mapping algorithm: **using only the latest Rebrickable inventory version caused missed mappings**. The fix involved:

1. Identifying unmapped BL minifigs
2. Finding unlinked RB minifigs from all inventory versions
3. Manual matching based on name analysis
4. Updating `bl_set_minifigs` and `bricklink_minifig_mappings` tables

**Next Steps:**

- Consider implementing multi-version support in the automatic algorithm
- Create a batch script to identify and surface unmapped minifigs
- Enhance the review UI to highlight sets with unmapped minifigs
- Add a "suggest mapping" feature based on name/image similarity for unmapped pairs
