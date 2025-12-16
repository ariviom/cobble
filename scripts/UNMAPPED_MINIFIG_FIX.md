# Unmapped Minifig Fix - Implementation Guide

## Problem Statement

When BrickLink has minifigs that don't match perfectly with Rebrickable's naming conventions, or when minifigs exist in different inventory versions, the automatic mapping algorithm may fail to create matches. This results in "unmapped" BL minifigs (those with `rb_fig_id = NULL` in `bl_set_minifigs`).

### Example: Set 10244-1

- **BrickLink:** 13 minifigs
- **Rebrickable:** 12 unique minifigs across 2 inventory versions
- **Issue:** 3 BL minifigs remained unmapped after automatic algorithm ran

## Root Causes

1. **Name Mismatch:** BrickLink uses descriptive names (e.g., "Juggling Man") while Rebrickable uses technical descriptions (e.g., "Blue Torso, Red Legs, Dark Bluish Grey Kepi")

2. **Multiple Inventory Versions:** While the ingest script processes ALL inventory versions, some minifigs may only appear in older versions and have poor name matches

3. **Insufficient Similarity:** Automatic algorithm thresholds are conservative to avoid false positives, so low-similarity pairs remain unmatched

## Solution Overview

We've implemented a three-pronged approach:

### 1. Enhanced Ingest Script (Already Working)

**File:** `scripts/minifig-mapping-core.ts`

The `createMinifigMappingsForSet()` function already:

- ✅ Loads ALL inventory versions for a set (not just the latest)
- ✅ Aggregates unique minifigs across all versions
- ✅ Attempts multiple matching stages (name, similarity, greedy fallback)
- ✅ Now logs when multiple inventory versions are detected

**Change Made:**

```typescript
// Now logs multi-version detection
if (inventories && inventories.length > 1) {
  console.log(
    `${logPrefix} Set ${setNum} has ${inventories.length} inventory versions (using union of all)`
  );
}
```

### 2. Enhanced Backfill Script

**File:** `scripts/backfill-confidence-scores.ts`

**Changes Made:**

- After reprocessing each set, checks for remaining unmapped BL minifigs
- Finds unlinked RB minifigs (those not yet matched to any BL minifig in the set)
- Uses enhanced name similarity scoring
- Creates mappings for pairs with match score ≥ 0.3
- Reports all unmapped fixes in summary

**Usage:**

```bash
# Dry run to see what would be fixed
npm run backfill:confidence-scores 0 0.7 --dry-run

# Live run to apply fixes
npm run backfill:confidence-scores 0 0.7

# Process specific number of sets
npm run backfill:confidence-scores 0 0.7 --dry-run 10
```

**New Output:**

```
✨ Unmapped Minifigs Fixed:
--------------------------------------------------------------------------------
10244-1 | Juggling Man → Blue Torso, Red Legs, Dark Bluish Grey Kepi
  twn199 → fig-009174 (confidence: 0.80, source: backfill:name-match)
```

### 3. Dedicated Unmapped Fix Script (New)

**File:** `scripts/fix-all-unmapped-minifigs.ts`

A specialized script that:

- Scans ALL sets with unmapped BL minifigs
- For each set, attempts to match unmapped BL → unlinked RB minifigs
- Uses enhanced name similarity algorithm
- Prevents duplicate mappings (one BL → one RB per set)
- Provides detailed reporting and statistics

**Usage:**

```bash
# Dry run to see what would be fixed
npm run fix:unmapped-minifigs -- --dry-run

# Dry run with limit
npm run fix:unmapped-minifigs -- --dry-run 50

# Live run to apply fixes
npm run fix:unmapped-minifigs

# Live run with limit
npm run fix:unmapped-minifigs -- 100
```

**Output Example:**

```
[fix-unmapped] 🚀 Starting unmapped minifig fix...
[fix-unmapped] Mode: 🔍 DRY RUN
[fix-unmapped] 🔍 Finding sets with unmapped minifigs...
[fix-unmapped] Found 847 sets with unmapped minifigs

[fix-unmapped] 📦 Batch 1/17

  🔍 10244-1: 3 unmapped BL minifigs
  ✨ Attempting to match 3 BL → 3 RB
    ✅ twn199 → fig-009174 [score: 0.60, conf: 0.64]
    ✅ twn201 → fig-009181 [score: 0.45, conf: 0.51]
    ✅ twn198 → fig-009182 [score: 0.50, conf: 0.55]

================================================================================
📊 SUMMARY
================================================================================
Sets processed: 847
Sets skipped: 123
Total fixes: 1,234

✨ Unmapped Minifigs Fixed:

10244-1 (3 fixes):
  twn199 (Juggling Man) → fig-009174 (Blue Torso, Red Legs, Dark Bluish Grey Kepi)
    Confidence: 0.64, Match score: 0.60
  twn201 (Ticket Lady) → fig-009181 (Dark Purple Torso, Dark Tan Legs)
    Confidence: 0.51, Match score: 0.45
  twn198 (Dunk Tank Lady) → fig-009182 (Orange Torso, Reddish Brown Legs)
    Confidence: 0.55, Match score: 0.50

📊 Confidence Distribution:
  High (≥0.7): 345 (28.0%)
  Med (0.5-0.7): 512 (41.5%)
  Low (<0.5): 377 (30.5%)
  Average: 0.612

✅ Complete!
ℹ️  This was a DRY RUN. No changes were made.
ℹ️  Run without --dry-run to apply changes.
```

## Enhanced Name Similarity Algorithm

The new `calculateNameSimilarity()` function uses multiple techniques:

1. **Exact Match:** Full normalized name match → 1.0 score
2. **Word Matching:**
   - Exact word match → +1.0 per word
   - Substring match → +0.5 per word
3. **Long Substring Similarity:**
   - For words ≥4 chars, finds longest common substring
   - Adds weighted score based on substring length
4. **Final Score:** Normalized by total word count

**Confidence Calculation:**

```typescript
confidence = min(0.95, matchScore * 0.9 + 0.1);
```

This ensures:

- Match score of 0.3 → confidence of 0.37 (minimum to be created)
- Match score of 0.6 → confidence of 0.64
- Match score of 1.0 → confidence of 0.95 (capped to distinguish from perfect/manual matches)

## Workflow Recommendations

### For Backfilling Existing Data

1. **Run confidence score backfill** (includes unmapped fix):

   ```bash
   # Dry run first to preview
   npm run backfill:confidence-scores 0 0.7 --dry-run 20

   # Then live run in batches
   npm run backfill:confidence-scores 0 0.7
   ```

2. **Run dedicated unmapped fix** for remaining cases:

   ```bash
   # Dry run to see scope
   npm run fix:unmapped-minifigs -- --dry-run 100

   # Apply in controlled batches
   npm run fix:unmapped-minifigs -- 100
   ```

3. **Manual review** of low-confidence fixes:
   - Filter review UI by confidence < 0.5
   - Verify or correct automated matches
   - Approve good matches to boost confidence to 1.0

### For Ongoing Ingestion

The regular ingest scripts (`npm run build:minifig-mappings:all`) will now:

- Process ALL inventory versions automatically
- Log when multiple versions are detected
- Create the best possible automatic mappings

After ingest, periodically run:

```bash
npm run fix:unmapped-minifigs
```

To catch any remaining unmapped minifigs.

## Database Impact

### Tables Modified

1. **`bl_set_minifigs`**
   - Sets `rb_fig_id` for previously NULL values
   - Links BL minifigs to RB minifigs at the set level

2. **`bricklink_minifig_mappings`**
   - Creates new global mappings with:
     - `confidence`: 0.37-0.95 (based on match score)
     - `source`: `'backfill:name-match'` or `'script:unmapped-fix'`
     - `manually_approved`: `false`

### Performance Considerations

- Batch processing with rate limiting (500ms delay between sets)
- Configurable batch size (default: 50 sets per batch)
- Can be run incrementally with set limits

## Monitoring & Validation

### Check Unmapped Count

```sql
-- Sets with unmapped minifigs
SELECT
  set_num,
  COUNT(*) as total_minifigs,
  COUNT(*) FILTER (WHERE rb_fig_id IS NOT NULL) as mapped_count,
  COUNT(*) FILTER (WHERE rb_fig_id IS NULL) as unmapped_count,
  ROUND(100.0 * COUNT(*) FILTER (WHERE rb_fig_id IS NOT NULL) / COUNT(*), 1) as mapped_pct
FROM bl_set_minifigs
GROUP BY set_num
HAVING COUNT(*) FILTER (WHERE rb_fig_id IS NULL) > 0
ORDER BY unmapped_count DESC
LIMIT 20;
```

### Check Fix Quality

```sql
-- Review automated fixes with low confidence
SELECT
  m.rb_fig_id,
  m.bl_item_id,
  m.confidence,
  m.source,
  rb.name as rb_name,
  bl.name as bl_name
FROM bricklink_minifig_mappings m
JOIN rb_minifigs rb ON m.rb_fig_id = rb.fig_num
JOIN bl_set_minifigs bl ON m.bl_item_id = bl.minifig_no
WHERE m.source IN ('backfill:name-match', 'script:unmapped-fix')
  AND m.confidence < 0.5
ORDER BY m.confidence ASC
LIMIT 50;
```

## Known Limitations

1. **Name-based matching only:** Currently doesn't use image similarity for unmapped fixes (could be added)

2. **Conservative threshold:** Match score ≥ 0.3 to avoid false positives. This means some valid pairs may still remain unmapped.

3. **No cross-set matching:** Each set is processed independently. Some BL minifigs might be exclusive and never match to RB.

4. **Manual review recommended:** Low-confidence matches (<0.5) should be manually verified in the review UI.

## Future Enhancements

1. **Image-based matching:** Use pHash similarity for unmapped pairs
2. **Cross-set learning:** If a mapping works well in one set, suggest it in others
3. **Machine learning:** Train a classifier on manual approvals to improve automated matching
4. **Bulk review UI:** Interface to quickly approve/reject batches of low-confidence matches
5. **Feedback loop:** Track manual corrections to improve algorithm thresholds
