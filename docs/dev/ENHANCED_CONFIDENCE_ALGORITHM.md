# Enhanced Minifig Mapping Confidence Algorithm

## Overview

This document describes the enhanced minifig mapping algorithm that significantly improves confidence scores for small sets and character name matches.

For `/scripts/lib/backfill-confidence-scores.ts`

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
5. **Single Fig** → 1.0 confidence (only option)

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
npm run build:minifig-mappings:all --force
```

### Backfill Existing Mappings:

```bash
# Reprocess low-confidence mappings (0.0 - 0.7)
npm run backfill:confidence-scores 0 0.7

# Dry run to preview
npm run backfill:confidence-scores 0 0.7 --dry-run
```

### Review Results:

```bash
# Start dev server
npm run dev

# Navigate to: http://localhost:3000/dev/minifig-review
# Filter by confidence threshold to see improvements
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

## Source Tags

Mappings are tagged with their matching method:

- `set:name-normalized` - Exact normalized name match
- `set:unique-part-count` - Unique part count match (NEW)
- `set:combined-similarity` - Multi-dimensional similarity with boost
- `set:greedy-fallback` - Best available match with boost
- `set:single-fig` - Only remaining option

## Future Enhancements

1. **Process of Elimination**: For 2-3 fig sets, verify mappings by checking if alternatives are worse
2. **Theme/Series Detection**: Detect LEGO themes (Ninjago, Batman, etc.) for additional matching dimension
3. **Multi-word Key Names**: Extract compound character names ("Iron Man", "Wonder Woman")
4. **Historical Confidence Tracking**: Track confidence improvements over time

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
