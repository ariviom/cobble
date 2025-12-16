# Enhanced Minifig Mapping Confidence Algorithm

## Overview

This document describes the enhanced minifig mapping algorithm that significantly improves confidence scores for small sets and character name matches.

## Key Improvements

### 1. **Substring Matching** (Weight: 0.35)

Character-level longest common substring matching catches character names even when descriptions differ.

**Example:**

- RB: `"Overlord - Trans-Purple Head, Black Torso"`
- BL: `"Overlord - Legacy, 2 Arms"`
- LCS: `"Overlord - "` → High similarity despite different descriptions

### 2. **Key Name Extraction** (Weight: 0.20)

Extracts primary character identifier (word before first delimiter) for precise boolean matching.

**Example:**

- RB: `"Lloyd - EVO Head Wrap"` → `"lloyd"`
- BL: `"Lloyd - Core"` → `"lloyd"`
- Match: Perfect (1.0)

### 3. **Unique Part Count Matching** (Confidence: 0.95)

NEW matching stage! If a part count appears only once in both RB and BL for a set, it's a near-deterministic match.

**Example (3-fig set):**

```
RB: fig-A (6 parts), fig-B (7 parts), fig-C (8 parts)
BL: bl-X (7 parts), bl-Y (6 parts), bl-Z (8 parts)

Matches:
- 6 parts: fig-A → bl-Y (0.95 confidence)
- 7 parts: fig-B → bl-X (0.95 confidence)
- 8 parts: fig-C → bl-Z (0.95 confidence)
```

### 4. **Set Size Confidence Boost**

Smaller sets have fewer possible combinations, increasing match certainty.

**Boost Formula:**

- 1 minifig: Boost to 1.0 (perfect certainty)
- 2 minifigs: +0.10 to +0.30 based on base similarity
- 3 minifigs: +0.05 to +0.20 based on base similarity
- 4-5 minifigs: +0.04 to +0.07
- 6+ minifigs: +0.00 to +0.03

## Confidence Formula

### Base Similarity (with image):

```
score = (jaccard * 0.20) +        // Token-based
        (substring * 0.35) +      // Character-level LCS
        (keyName * 0.20) +        // Character identifier
        (partCount * 0.05) +      // Part similarity
        (image * 0.20)            // Visual similarity
```

### Base Similarity (without image):

```
score = (jaccard * 0.25) +        // Token-based
        (substring * 0.44) +      // Character-level LCS
        (keyName * 0.25) +        // Character identifier
        (partCount * 0.06)        // Part similarity
```

### Final Confidence:

```
final = min(1.0, base_similarity + set_size_boost)
```

## Matching Stages (in order)

1. **Exact Normalized Name** → 1.0 confidence
2. **⭐ NEW: Unique Part Count** → 0.95 confidence (verified with name sim > 0.2)
3. **Combined Similarity** → Variable (threshold: 0.25, with set size boost)
4. **Greedy Fallback** → Variable (equal counts, with set size boost)
5. **⭐ NEW: Process of Elimination** → 0.90 confidence (75%+ high-conf, 1-2 low remain)
6. **Single Fig** → 1.0 confidence (only option remaining)

## Real-World Example

**Set 112218-1** (Lloyd vs. Overlord - 2 minifigs):

| Dimension     | Overlord                     | Lloyd                |
| ------------- | ---------------------------- | -------------------- |
| Jaccard       | 0.11 \* 0.20 = 0.022         | 0.20 \* 0.20 = 0.040 |
| **Substring** | 0.40 \* **0.35** = **0.140** | 0.35 \* 0.35 = 0.123 |
| **Key Name**  | 1.0 \* **0.20** = **0.200**  | 1.0 \* 0.20 = 0.200  |
| Part Count    | 0.5 \* 0.05 = 0.025          | 0.6 \* 0.05 = 0.030  |
| Image         | 0 (not yet)                  | 0                    |
| **Base**      | **0.387**                    | **0.393**            |
| Set Boost     | +0.30 (2 figs)               | +0.30                |
| **FINAL**     | **0.687** ✅                 | **0.693** ✅         |

**Before:** 0.11 and 0.20 (low confidence)  
**After:** 0.69 and 0.69 (high confidence)  
**Improvement:** +0.58 and +0.49

## Expected Results

### Overall Improvements:

- **2-fig sets with character names**: 0.15 → 0.70 avg (+0.55)
- **3-fig sets with unique parts**: All at 0.95 confidence
- **Small sets (≤5 figs)**: +0.15 to +0.30 boost
- **Large sets**: Minimal change (algorithm still works well)

### Success Metrics:

- **Target**: 25% more mappings with confidence > 0.7
- **Unique part count**: Applies to ~40% of sets
- **Substring boost**: +0.20 avg for character name matches

## Usage

### Generate New Mappings:

```bash
# Process all sets with new algorithm
npm run build:minifig-mappings:all

# Force reprocess already-synced sets
npm run build:minifig-mappings:all -- --force
```

### Backfill Existing Mappings:

```bash
# Reprocess low-confidence mappings (0.0 - 0.7), show detailed output
npm run backfill:confidence-scores 0 0.7

# Dry run to preview changes (still saves to demonstrate, but marks as preview)
npm run backfill:confidence-scores 0 0.7 --dry-run

# Process first 10 sets only (for testing)
npm run backfill:confidence-scores 0 0.7 --dry-run 10

# Process specific confidence range
npm run backfill:confidence-scores 0 0.5
```

### Backfill Output Example:

```
[backfill-confidence] 🚀 Starting confidence score backfill...
[backfill-confidence] Target: mappings with confidence 0.00 - 0.70
[backfill-confidence] Mode: 🔍 DRY RUN
[backfill-confidence] Processing 15 sets

[backfill-confidence] 📦 Batch 1/1
  ⚙️  Reprocessing 112218-1 (Lloyd vs. Overlord)...
  📈 fig-012853: 0.11 → 0.69 (+0.58)
  📈 fig-012179: 0.20 → 0.69 (+0.49)

================================================================================
📊 SUMMARY
================================================================================
Sets processed: 15
Total mappings: 42
  📈 Improved: 38 (90.5%)
  📉 Degraded: 1 (2.4%)
  ➡️  Unchanged: 3 (7.1%)
Average change: +0.234

🏆 Top 10 Improvements:
--------------------------------------------------------------------------------
112218-1 | Overlord - Trans-Purple Head → Overlord - Legacy, 2 Arms
  0.11 → 0.69 (+0.58) | set:greedy-fallback → set:combined-similarity
112218-1 | Lloyd - EVO Head Wrap → Lloyd - Core
  0.20 → 0.69 (+0.49) | set:greedy-fallback → set:combined-similarity

📊 Confidence Distribution (After):
--------------------------------------------------------------------------------
0.0 - 0.3:    2 (  4.8%) ██
0.3 - 0.5:    4 (  9.5%) ████
0.5 - 0.7:    8 ( 19.0%) █████████
0.7 - 0.9:   18 ( 42.9%) █████████████████████
0.9 - 1.0:   10 ( 23.8%) ███████████

✅ Complete!
```

### Review Results:

```bash
# Start dev server
npm run dev

# Navigate to: http://localhost:3000/dev/minifig-review
# Features:
# - Filter by confidence threshold to see improvements
# - Filter by specific set number (e.g., "112218-1")
# - Hide approved mappings
# - Manually approve, edit, or delete mappings
# - Visual selector with images for remapping
```

## Algorithm Details

### Longest Common Substring (LCS)

Dynamic programming approach to find the longest contiguous substring shared between two strings.

```typescript
// Example
LCS("Overlord - Trans-Purple", "Overlord - Legacy")
→ "Overlord - " (10 chars)
→ Similarity: 10 / 24 = 0.42
```

### Key Name Extraction

```typescript
extractKeyName("Overlord - Trans-Purple Head") → "overlord"
extractKeyName("Lloyd - EVO Head Wrap") → "lloyd"
extractKeyName("Batman - Dark Knight") → "batman"
```

Minimum 3 characters to avoid spurious matches.

### Unique Part Count Verification

Requires name similarity > 0.2 to avoid false positives:

```typescript
if (partCountUnique && nameSimilarity >= 0.2) {
  confidence = 0.95; // High confidence
}
```

### Set Size Boost Application

Applied to all similarity-based matches (stages 3 & 4):

```typescript
finalConfidence = min(
  1.0,
  baseSimilarity + calculateSetSizeBoost(totalFigs, baseSimilarity)
);
```

### Process of Elimination Logic

Applied when most figs in a set are already high-confidence:

**Criteria:**

- 75%+ of figs have confidence ≥ 0.7
- Only 1-2 low-confidence mappings remain
- Equal RB and BL fig counts (complete set)
- Target BL fig not already taken
- No other viable alternatives (similarity > 0.3)

**Result:**

- Boost to 0.90 confidence
- Source: `set:elimination`

**Example:**

```
4-fig set:
- RB-1 → BL-A (0.92) ✓
- RB-2 → BL-B (0.85) ✓
- RB-3 → BL-C (0.88) ✓
- RB-4 → BL-D (0.35) → BOOST TO 0.90 ✓ (only option left)
```

## Source Tags

Mappings are tagged with their matching method:

- `set:name-normalized` - Exact normalized name match
- `set:unique-part-count` - Unique part count match (NEW)
- `set:combined-similarity` - Multi-dimensional similarity with boost
- `set:greedy-fallback` - Best available match with boost
- `set:elimination` - Process of elimination boost (NEW)
- `set:single-fig` - Only remaining option
- `manual-approval` - Manually approved by human reviewer (overrides automatic source)

### Manual Approval

When a mapping is manually reviewed and approved via the `/dev/minifig-review` page:

- Confidence is set to **1.0** (perfect)
- `manually_approved` flag is set to `true`
- Source is displayed as `manual-approval` (overrides original source)
- Can be filtered out using "Hide Approved" checkbox

## Duplicate Prevention

The algorithm now includes duplicate detection to ensure no two RB figs map to the same BL fig within a set:

1. **Detection**: Before upserting, group mappings by `bl_item_id`
2. **Resolution**: If multiple RB figs map to same BL fig, keep highest confidence
3. **Logging**: Warns about conflicts for investigation
4. **Remapping**: Rejected figs can be automatically remapped if alternatives exist

**Example:**

```
RB-A → BL-1 (0.65) ❌ Rejected
RB-B → BL-1 (0.82) ✓ Kept (higher confidence)
RB-A → BL-2 (0.55) ✓ Remapped to alternative
```

## Performance Notes

- **Backfill speed**: ~0.5s per set (rate limited)
- **Memory usage**: Processes in batches of 50 sets
- **Database load**: Moderate (multiple queries per set)
- **Recommended**: Run during off-peak hours for large backfills

## Future Enhancements

1. ~~**Process of Elimination**~~ - ✅ IMPLEMENTED (Stage 4.5)
2. ~~**Duplicate Prevention**~~ - ✅ IMPLEMENTED
3. **Theme/Series Detection**: Detect LEGO themes (Ninjago, Batman, etc.) for additional matching dimension
4. **Multi-word Key Names**: Extract compound character names ("Iron Man", "Wonder Woman")
5. **Historical Confidence Tracking**: Track confidence improvements over time
6. **Bulk Manual Review**: Approve/reject multiple mappings at once

## Testing & Validation

Before deploying, validate on manually reviewed sets:

1. Sample 100 sets with various sizes (1-20 figs)
2. Compare old vs new confidence scores
3. Verify improved scores are actually correct matches
4. Check for any false positives from substring/part count matching

## References

- Original algorithm: `scripts/MINIFIG_MAPPING_IMPROVEMENTS.md`
- Image similarity: `docs/dev/IMAGE_SIMILARITY_IMPLEMENTATION.md`
- Core implementation: `scripts/minifig-mapping-core.ts`
