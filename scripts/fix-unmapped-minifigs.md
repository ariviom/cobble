# Fix for Unmapped Minifigs in Set 10244-1

## Problem Analysis

**Issue:** Set 10244-1 showed only 10 of 13 minifigs with mappings

**Root Cause:**

- BrickLink has 13 minifigs for set 10244-1
- Rebrickable has 12 unique minifigs across 2 inventory versions
- The automatic mapping algorithm failed to map 3 BL minifigs to their corresponding RB minifigs

**Details:**

- **Rebrickable Version 1:** 12 minifigs (fig-009172 through fig-009183)
- **Rebrickable Version 2:** 11 minifigs (same as V1, but fig-009179 replaced by fig-011219)
- **Union of both versions:** 13 unique RB minifigs
- **BrickLink:** 13 minifigs (twn198-twn209, plus twn204a)

## Unmapped Minifigs

The following 3 BL minifigs had no `rb_fig_id` in `bl_set_minifigs`:

- `twn198` - "Dunk Tank Lady"
- `twn199` - "Juggling Man"
- `twn201` - "Ticket Lady"

The following 3 RB minifigs were not linked to any BL minifig:

- `fig-009174` - "Blue Torso, Red Legs, Dark Bluish Grey Kepi"
- `fig-009181` - "Dark Purple Torso, Dark Tan Legs, Dark Bluish Grey Legs"
- `fig-009182` - "Orange Torso, Reddish Brown Legs, Dark BLuish Grey Cap"

## Manual Mapping Applied

Based on name analysis and Rebrickable inventory data:

1. `twn199` (Juggling Man) → `fig-009174` (Blue Torso, ... Kepi)
2. `twn201` (Ticket Lady) → `fig-009181` (Dark Purple Torso, Dark Tan Legs)
3. `twn198` (Dunk Tank Lady) → `fig-009182` (Orange Torso, Reddish Brown Legs)

## SQL Applied

```sql
-- Update bl_set_minifigs to link the 3 unmapped BL minifigs
UPDATE bl_set_minifigs SET rb_fig_id = 'fig-009174' WHERE set_num = '10244-1' AND minifig_no = 'twn199';
UPDATE bl_set_minifigs SET rb_fig_id = 'fig-009181' WHERE set_num = '10244-1' AND minifig_no = 'twn201';
UPDATE bl_set_minifigs SET rb_fig_id = 'fig-009182' WHERE set_num = '10244-1' AND minifig_no = 'twn198';

-- Create global mappings
INSERT INTO bricklink_minifig_mappings (rb_fig_id, bl_item_id, confidence, source, manually_approved)
VALUES
  ('fig-009174', 'twn199', 0.95, 'manual', true),
  ('fig-009181', 'twn201', 0.95, 'manual', true),
  ('fig-009182', 'twn198', 0.95, 'manual', true)
ON CONFLICT (rb_fig_id) DO UPDATE SET
  bl_item_id = EXCLUDED.bl_item_id,
  confidence = EXCLUDED.confidence,
  source = EXCLUDED.source,
  manually_approved = EXCLUDED.manually_approved,
  reviewed_at = NOW();
```

## Result

All 13 minifigs in set 10244-1 now have proper RB→BL mappings and will display in the review UI.

## Finding Similar Issues

To find other sets with unmapped BL minifigs:

```sql
-- Find sets with unmapped BL minifigs
SELECT
  set_num,
  COUNT(*) as total_minifigs,
  COUNT(*) FILTER (WHERE rb_fig_id IS NOT NULL) as mapped_count,
  COUNT(*) FILTER (WHERE rb_fig_id IS NULL) as unmapped_count
FROM bl_set_minifigs
GROUP BY set_num
HAVING COUNT(*) FILTER (WHERE rb_fig_id IS NULL) > 0
ORDER BY unmapped_count DESC, set_num;
```

## Algorithm Improvement Opportunities

The mapping algorithm should be enhanced to:

1. Consider minifigs from ALL Rebrickable inventory versions, not just the latest
2. Use more sophisticated name matching for edge cases
3. Leverage image similarity (pHash) to disambiguate similar-named minifigs
4. Flag sets with unmapped minifigs for manual review
