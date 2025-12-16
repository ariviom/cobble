# Minifig Mapping Review Tool

## Overview

A development-only tool for reviewing and fixing low-confidence minifig mappings at the set level. This ensures quality control before mappings affect users in production.

## Access

**Development Only**: This tool is only available when `NODE_ENV !== 'production'`

**URL**: [http://localhost:3000/dev/minifig-review](http://localhost:3000/dev/minifig-review)

## Features

### 1. Set-Based Review

- Review mappings in the context of their sets
- See all low-confidence mappings for a set at once
- Understand the full context of each mapping

### 2. Side-by-Side Comparison

- **Rebrickable**: Shows RB minifig ID, name, and image
- **BrickLink**: Shows BL minifig ID, name, and image
- **Confidence Score**: Color-coded by severity:
  - 🔴 < 0.3: Very low (likely incorrect)
  - 🟡 0.3-0.5: Low (review carefully)
  - 🟢 0.5-0.7: Medium (probably okay)
- **Source**: Shows which matching strategy was used

### 3. Three Action Types

#### ✅ Approve

- Marks the mapping as manually reviewed and correct
- Sets `manual_review = true` in `bricklink_minifig_mappings`
- Keeps the mapping active
- Use when: The mapping is actually correct despite low confidence

#### ✏️ Edit

- Replaces the BL minifig ID with a corrected one
- Updates the specific set mapping in `bl_set_minifigs`
- Creates/updates global mapping with `confidence = 1.0` and `source = 'manual'`
- Use when: The mapping is wrong and you know the correct BL ID

#### ❌ Delete

- Removes the mapping from `bl_set_minifigs`
- Removes from global `bricklink_minifig_mappings` if no other sets use it
- Use when: The mapping is wrong and you don't know the correct one yet

### 4. Filters & Sorting

**Confidence Threshold**:

- < 0.3 (Very Low)
- < 0.4
- < 0.5 (Default)
- < 0.6
- < 0.7

**Sort By**:

- **Lowest Confidence First**: Focus on worst mappings
- **Average Confidence**: See sets with overall low quality
- **Most Issues First**: Tackle sets with many problems

## Workflow

### Finding Bad Mappings

1. **Start the dev server**:

   ```bash
   npm run dev
   ```

2. **Navigate to the review tool**:
   http://localhost:3000/dev/minifig-review

3. **Filter to very low confidence** (< 0.3)

4. **Review each set**:
   - Compare RB and BL images side-by-side
   - Check if the minifig names match
   - Verify the minifig appearance

### Fixing a Bad Mapping

**Example**: Set 1294-1 has `fig-008614` (Clone Trooper) mapped to `sw0001a` (wrong variant)

1. Click **✏️ Edit** on the mapping
2. Enter the correct BL ID: `sw0123b`
3. Click **Save**
4. The mapping is updated immediately
5. Future syncs will use this corrected mapping

### Approving a Low-Confidence Correct Mapping

**Example**: Set has confidence 0.33 but the mapping is actually correct

1. Verify the images match
2. Click **✅ Approve**
3. The mapping is marked as reviewed
4. It won't appear in low-confidence lists anymore

### Deleting an Incorrect Mapping

**Example**: Mapping is clearly wrong but you don't know the correct BL ID

1. Click **❌ Delete**
2. Confirm the deletion
3. The mapping is removed
4. The set can be re-synced later to try again

## Database Schema

### bricklink_minifig_mappings

Added columns for manual review tracking:

```sql
-- Whether this mapping has been manually reviewed
manual_review BOOLEAN DEFAULT FALSE

-- Timestamp of manual review
reviewed_at TIMESTAMPTZ

-- Notes from review (why corrected/approved)
review_notes TEXT
```

### bl_set_minifigs

Stores per-set mappings. When you fix a mapping:

- `minifig_no` is updated to the new BL ID
- `name` and `image_url` are refreshed from `bricklink_minifigs`
- `last_refreshed_at` is updated

## API Routes

### GET /api/dev/minifig-mappings/review

Fetches sets with low-confidence mappings.

**Query Parameters**:

- `confidence_threshold` (default: 0.5)
- `sort` (default: 'min_confidence')
- `limit` (default: 50)
- `offset` (default: 0)

**Response**:

```typescript
{
  sets: [
    {
      set_num: string,
      set_name: string,
      total_minifigs: number,
      low_confidence_count: number,
      avg_confidence: number,
      min_confidence: number,
      mappings: [
        {
          rb_fig_id: string,
          rb_name: string | null,
          rb_img_url: string | null,
          bl_minifig_no: string,
          bl_name: string | null,
          bl_img_url: string | null,
          confidence: number | null,
          source: string | null,
          quantity: number
        }
      ]
    }
  ],
  total: number,
  params: { ... }
}
```

### POST /api/dev/minifig-mappings/fix

Fixes a mapping (approve, edit, or delete).

**Request Body**:

```typescript
{
  set_num: string,
  rb_fig_id: string,
  old_bl_minifig_no: string,
  new_bl_minifig_no?: string, // Required for 'update' action
  action: 'update' | 'delete' | 'approve',
  notes?: string
}
```

**Response**:

```typescript
{
  success: true,
  action: string,
  set_num: string,
  rb_fig_id: string,
  // ... action-specific fields
}
```

## Common Scenarios

### Scenario 1: Wrong Variant

**Problem**: Mapping points to wrong variant (e.g., `sw0001a` vs `sw0001b`)

**Solution**:

1. Use **✏️ Edit**
2. Enter correct variant ID
3. Save

### Scenario 2: Completely Wrong Minifig

**Problem**: Algorithm matched two unrelated minifigs

**Solution**:

1. Use **❌ Delete** (if you don't know correct ID)
2. OR use **✏️ Edit** (if you know correct ID)

### Scenario 3: Correct but Low Confidence

**Problem**: Names are very different but images match

**Solution**:

1. Verify images carefully
2. Use **✅ Approve**

### Scenario 4: Can't Tell from Images

**Problem**: Both minifigs look similar

**Solution**:

1. Open BrickLink pages for both:
   - RB: `https://rebrickable.com/minifigs/{rb_fig_id}/`
   - BL: `https://www.bricklink.com/v2/catalog/catalogitem.page?M={bl_minifig_no}`
2. Compare detailed specs
3. Make decision

## Statistics & Insights

The tool shows useful context:

- **Total minifigs in set**: How many figs need mapping
- **Low confidence count**: How many need review
- **Average confidence**: Overall mapping quality for the set
- **Min confidence**: Worst mapping in the set

This helps prioritize:

- Sets with many low-confidence mappings
- Sets with very low minimum confidence
- Sets with overall poor mapping quality

## Tips

1. **Start with < 0.3**: Focus on very low confidence first
2. **Use images**: Trust visual comparison over names
3. **Check quantity**: Multiple of same fig increases confidence
4. **Consider context**: Set theme helps identify correct fig
5. **When in doubt, delete**: Better to have no mapping than wrong mapping
6. **Document corrections**: Add notes when fixing unusual cases

## Future Enhancements

Potential additions:

- Bulk operations (select multiple, approve/reject all)
- Component part comparison (heads, torsos, etc.)
- History tracking (see past corrections)
- Export corrected mappings for sharing
- Statistics dashboard (correction patterns, common issues)
- BrickLink search integration (find correct IDs)

## Safety

✅ **Development only**: Cannot be accessed in production
✅ **Granular**: Fixes individual set mappings, not global
✅ **Reversible**: Can re-sync sets to try again
✅ **Tracked**: All manual reviews are logged with timestamps
✅ **Contextual**: See full set context before making changes

## Related Documentation

- [MINIFIG_MAPPING_IMPROVEMENTS.md](../../scripts/MINIFIG_MAPPING_IMPROVEMENTS.md) - Script improvements and coverage tracking
- [minifig-mapping-core.ts](../../scripts/minifig-mapping-core.ts) - Core mapping algorithm
