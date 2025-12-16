# Manual Approval Protection

## Overview

All backfill and automated mapping scripts now protect manually approved minifig mappings from being overwritten. This ensures that human-reviewed and approved mappings remain intact even when re-running automated processes.

## What Changed

### 1. Core Mapping Script (`minifig-mapping-core.ts`)

**Protection Added:**

- Before upserting mappings, checks for existing mappings with `manually_approved = true`
- Filters out manually approved mappings from the upsert operation
- Logs when manually approved mappings are preserved
- Updates stats to show both total mappings and those actually updated

**Code Flow:**

```typescript
// Check for existing manually approved mappings
const { data: existingMappings } = await supabase
  .from('bricklink_minifig_mappings')
  .select('rb_fig_id, bl_item_id, confidence, source, manually_approved')
  .in('rb_fig_id', rbFigIds);

const manuallyApproved = new Set(
  (existingMappings || [])
    .filter(m => m.manually_approved === true)
    .map(m => m.rb_fig_id)
);

// Filter out manually approved mappings
const mappingsToUpsert = validMappings.filter(
  m => !manuallyApproved.has(m.rb_fig_id)
);

if (manuallyApproved.size > 0) {
  console.log(
    `Preserving ${manuallyApproved.size} manually approved mapping(s)`
  );
}
```

**Console Output:**

```
[build-mappings] Preserving 3 manually approved mapping(s) for set 10244-1
[build-mappings] Mapping stats for set 10244-1 {
  total: 13,
  updated: 10,
  preserved: 3,
  lowConfidenceCount: 2,
  minConfidence: 0.25,
  avgConfidence: 0.68
}
```

### 2. Backfill Confidence Script (`backfill-confidence-scores.ts`)

**Protection Added:**

- Before creating unmapped minifig fixes, checks if the RB fig has a manually approved mapping
- Skips creating new mappings for manually approved RB figs
- Logs when skipping due to manual approval

**Code Flow:**

```typescript
// Check if this RB fig already has a manually approved mapping
const { data: existingMapping } = await supabase
  .from('bricklink_minifig_mappings')
  .select('rb_fig_id, manually_approved')
  .eq('rb_fig_id', bestMatch.fig_num)
  .maybeSingle();

if (existingMapping?.manually_approved) {
  console.log(
    `⚠️  Skipping ${bestMatch.fig_num} - already has manual approval`
  );
  continue;
}
```

**Console Output:**

```
  ✨ Mapping twn199 (Juggling Man) → fig-009174 (Blue Torso...) [score: 0.60]
  ⚠️  Skipping fig-009181 - already has manual approval
  ✨ Mapping twn198 (Dunk Tank Lady) → fig-009182 (Orange Torso...) [score: 0.50]
```

### 3. Unmapped Minifig Fix Script (`fix-all-unmapped-minifigs.ts`)

**Protection Added:**

- Before creating new mappings, checks if the RB fig has a manually approved mapping
- Skips creating new mappings for manually approved RB figs
- Logs when skipping due to manual approval

**Same implementation as backfill script above.**

## How Manual Approval Works

### Setting Manual Approval

Manual approval is set in two scenarios:

1. **Explicit Approval** - User clicks "Approve" in review UI:

   ```typescript
   {
     rb_fig_id: 'fig-009174',
     bl_item_id: 'twn199',
     confidence: 1.0,
     source: 'manual-approval',
     manually_approved: true,
     reviewed_at: NOW(),
     review_notes: 'Manually approved'
   }
   ```

2. **Manual Edit/Remap** - User remaps a minifig to different BL item:
   ```typescript
   {
     rb_fig_id: 'fig-009174',
     bl_item_id: 'twn199', // Changed from original
     confidence: 1.0,
     source: 'manual',
     manually_approved: true,
     reviewed_at: NOW(),
     review_notes: 'Manually corrected from twn200'
   }
   ```

### Review UI Integration

The review UI (`/dev/minifig-review`) displays manual approvals with:

- Source: `"manual-approval"` or `"manual"`
- Confidence: `1.0` (100%)
- Can be filtered out using "Hide Approved" checkbox

## Benefits

### 1. **Preserves Human Judgment**

- Manual reviews represent expert knowledge
- Prevents automated systems from reverting corrections
- Maintains trust in the review process

### 2. **Safe Re-runs**

- Can safely re-run backfill scripts multiple times
- Can update automatic mapping algorithms without fear
- Incremental improvement without losing progress

### 3. **Audit Trail**

- `manually_approved` flag clearly marks human-reviewed mappings
- `source` field indicates origin (manual, manual-approval)
- `reviewed_at` timestamp tracks when approval occurred
- `review_notes` provides context for the decision

### 4. **Efficient Workflows**

- Review and approve good automatic matches once
- Focus manual review on remaining low-confidence mappings
- Build up a corpus of trusted mappings over time

## Testing Manual Approval Protection

### Test Scenario 1: Core Mapping Script

```bash
# 1. Create a manual approval
curl -X POST http://localhost:3000/api/dev/minifig-mappings/fix \
  -d '{"action":"approve","rb_fig_id":"fig-009174","old_bl_minifig_no":"twn199"}'

# 2. Re-run mapping for that set
npm run build:minifig-mappings:all -- 10244-1

# 3. Verify manual approval preserved
# Should see: "Preserving 1 manually approved mapping(s) for set 10244-1"
```

### Test Scenario 2: Backfill Script

```bash
# 1. Set up manual approval (as above)

# 2. Run backfill
npm run backfill:confidence-scores 0 0.7 --dry-run 10

# 3. Verify manual approval preserved
# Should see: "⚠️  Skipping fig-009174 - already has manual approval"
```

### Test Scenario 3: Unmapped Fix Script

```bash
# 1. Set up manual approval (as above)

# 2. Run unmapped fix
npm run fix:unmapped-minifigs -- --dry-run 10

# 3. Verify manual approval preserved
# Should see: "⚠️  Skipping fig-009174 - already has manual approval"
```

## SQL Queries for Verification

### Check Manual Approvals

```sql
-- Count manual approvals by source
SELECT
  source,
  COUNT(*) as count,
  ROUND(AVG(confidence)::numeric, 3) as avg_confidence
FROM bricklink_minifig_mappings
WHERE manually_approved = true
GROUP BY source
ORDER BY count DESC;
```

### Find Protected Mappings

```sql
-- Find RB figs that would be protected from re-mapping
SELECT
  m.rb_fig_id,
  m.bl_item_id,
  m.confidence,
  m.source,
  m.reviewed_at,
  m.review_notes,
  rb.name as rb_name,
  bl.name as bl_name
FROM bricklink_minifig_mappings m
JOIN rb_minifigs rb ON m.rb_fig_id = rb.fig_num
LEFT JOIN bl_set_minifigs bl ON m.bl_item_id = bl.minifig_no
WHERE m.manually_approved = true
ORDER BY m.reviewed_at DESC
LIMIT 50;
```

### Verify Protection During Backfill

```sql
-- Compare mappings before and after backfill
-- Run this query before backfill
CREATE TEMP TABLE mappings_before AS
SELECT rb_fig_id, bl_item_id, confidence, source, manually_approved
FROM bricklink_minifig_mappings
WHERE manually_approved = true;

-- Run backfill script

-- Then check if any changed
SELECT
  b.rb_fig_id,
  b.bl_item_id as old_bl_id,
  a.bl_item_id as new_bl_id,
  b.confidence as old_conf,
  a.confidence as new_conf
FROM mappings_before b
JOIN bricklink_minifig_mappings a ON b.rb_fig_id = a.rb_fig_id
WHERE b.bl_item_id != a.bl_item_id
   OR b.confidence != a.confidence
   OR b.manually_approved != a.manually_approved;

-- Should return 0 rows if protection is working
```

## Edge Cases Handled

### 1. **Partial Manual Approval in Set**

- Some minifigs manually approved, others not
- Script updates only non-approved mappings
- Logs show preserved count

### 2. **All Minifigs Manually Approved**

- Script skips entire set update
- Logs: "All mappings for set X are manually approved - no updates needed"
- Returns early to save processing time

### 3. **Manual Approval Mid-Backfill**

- If a mapping is manually approved while backfill is running
- Next time that RB fig is encountered, it will be protected
- No race condition issues (each set processed independently)

### 4. **Conflicting Automatic Match**

- Automatic algorithm suggests different mapping than manual approval
- Manual approval takes precedence
- Automatic suggestion is discarded

## Future Enhancements

### 1. **Bulk Approval**

- UI feature to approve multiple mappings at once
- Useful for approving all high-confidence mappings in a set
- Would set `manually_approved = true` for batch

### 2. **Approval Expiry**

- Option to re-review old manual approvals
- Flag approvals older than X months
- Useful if automatic algorithm improves significantly

### 3. **Confidence Threshold Protection**

- Protect mappings above certain confidence (e.g., 0.95)
- Prevents overwriting very good automatic matches
- Configurable threshold

### 4. **Protected Mapping Report**

- Generate report of all manually approved mappings
- Export to CSV for review
- Track which users made which approvals (if auth added)

## Best Practices

### For Developers

1. **Always check `manually_approved` before upsert**
   - Use the pattern from the three scripts above
   - Filter before upsert, don't rely on DB constraints alone

2. **Log protection actions**
   - Always log when skipping due to manual approval
   - Helps with debugging and verification

3. **Preserve existing approvals**
   - When creating new scripts that modify mappings
   - Always implement protection for manually approved mappings

### For Users

1. **Review before approving**
   - Manual approval is permanent (until manually changed)
   - Double-check images and names match

2. **Use notes field**
   - Add context when manually remapping
   - Helps future reviewers understand decisions

3. **Approve incrementally**
   - Don't need to approve everything at once
   - Approve as you review, scripts will respect it

4. **Re-run scripts safely**
   - After approving some mappings, can re-run backfill
   - Approved mappings stay intact
   - Remaining mappings may improve with algorithm updates

## Summary

All automated mapping scripts now respect the `manually_approved` flag, ensuring that human expertise is preserved through algorithm updates and re-runs. This creates a safe, incremental workflow where manual review builds up a trusted corpus of mappings that automated systems will never overwrite.
