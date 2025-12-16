# Image Similarity for Minifig Mapping

## Overview

This document describes the implementation of perceptual image hashing for visual similarity matching in the minifig mapping system. This enhancement significantly improves automatic mapping confidence by comparing minifig images alongside name and part count matching.

## Implementation Summary

### 1. Database Schema Changes

**Migration**: `20251215072512_add_image_hashes.sql`

Added image hash columns to three tables:

- `rb_minifigs`: Stores hashes for Rebrickable minifig images
- `rb_minifig_images`: Stores hashes for cached RB images
- `bl_set_minifigs`: Stores hashes for BrickLink set minifig images
- `bricklink_minifig_mappings`: Stores image similarity scores and match attempt flags

Each hash is stored as TEXT (hex string) with an algorithm identifier ('phash').

### 2. Image Hashing Library

**File**: `scripts/lib/imageHash.ts`

Implements perceptual hashing using:

- **sharp**: Image processing (resize, normalize)
- **imghash**: Perceptual hash generation (16-bit pHash)

Key functions:

- `generateImageHash(url)`: Downloads image and generates hash
- `calculateImageSimilarity(hash1, hash2)`: Compares hashes (0-1 score)
- `hammingDistance(hash1, hash2)`: Calculates bit difference
- `batchGenerateHashes(urls)`: Rate-limited batch processing

### 3. Backfill Script

**File**: `scripts/backfill-image-hashes.ts`
**Command**: `npm run backfill:image-hashes [mode]`

Modes:

- `rb`: Process Rebrickable minifig images only
- `bl`: Process BrickLink set minifig images only
- `both`: Process both (default)

Features:

- Batch processing (50 images per batch)
- Rate limiting (200ms between images, 2s between batches)
- Progress tracking
- Error handling (continues on individual failures)

### 4. Mapping Algorithm Updates

**File**: `scripts/minifig-mapping-core.ts`

#### Enhanced Similarity Calculation

```typescript
// Combined score weighting:
if (image similarity available):
  score = (name * 0.4) + (partCount * 0.2) + (image * 0.4)
else:
  score = (name * 0.7) + (partCount * 0.3)
```

#### Updated Matching Stages

1. **Exact Name Match** (confidence: 1.0)
   - No image similarity needed

2. **Similarity-Based Match** (threshold: 0.25)
   - Uses combined name + image + part count
   - Requires score gap of 0.1 from second-best
   - Source: `set:combined-similarity`

3. **Greedy Fallback** (equal counts)
   - Uses combined similarity
   - Source: `set:greedy-fallback`

4. **Single Fig Match** (1:1 remaining)
   - Source: `set:single-fig`

### 5. Automatic Hash Generation

**Integration Point**: `processSetForMinifigMapping()`

When BL minifigs are cached:

1. Generate perceptual hash for each image URL
2. Store hash in `bl_set_minifigs` table
3. Re-fetch minifigs with hashes for mapping

For RB minifigs:

- Hashes are loaded from `rb_minifig_images` table
- Backfill script should be run to populate initially

### 6. Review UI Enhancement

**File**: `app/dev/minifig-review/MinifigReviewClient.tsx`

**Feature**: Local state management prevents list reordering

When a mapping is fixed:

- Update is applied to local React Query cache
- Fixed mapping is removed from display
- No refetch until filter/page change
- Maintains review context and position

## Usage Workflow

### Initial Setup

```bash
# 1. Apply database migration (already done)
npx supabase db push

# 2. Install dependencies (already done)
npm install sharp imghash

# 3. Backfill existing images
npm run backfill:image-hashes both
```

### Ongoing Usage

**New mappings automatically include image similarity:**

```bash
# Run mapping as usual
npm run build:minifig-mappings:all

# Image hashes are generated during BL minifig caching
# Similarity scores are calculated during matching
```

### Review Improved Mappings

```bash
# Start dev server
npm run dev

# Navigate to: http://localhost:3000/dev/minifig-review
# Mappings now show improved confidence scores
# Use visual selector to review and fix low-confidence matches
```

## Performance Characteristics

### Image Hash Generation

- **Time per image**: ~200-500ms (download + resize + hash)
- **Batch processing**: 50 images per batch with 2s delay
- **Estimated time for 10,000 images**: ~1-2 hours

### Hash Comparison

- **Time per comparison**: < 1ms (Hamming distance calculation)
- **Memory**: Negligible (16-byte hex strings)
- **Database**: Indexed for fast lookups

### Impact on Mapping Scripts

- **Additional time**: ~200-500ms per BL minifig image
- **Rate limiting consideration**: Adds to overall BL API rate limits
- **Retry logic**: Individual failures don't stop batch processing

## Results & Benefits

### Improved Confidence Scores

**Before** (name-only):

- Low confidence for different naming conventions
- Many false positives/negatives

**After** (name + image):

- Higher confidence for visually matching minifigs
- Better handling of naming differences between RB/BL
- Reduced false matches

### Example Scenarios

1. **Same minifig, different names**
   - Name similarity: 0.3
   - Image similarity: 0.95
   - **Combined: 0.61** (high confidence)

2. **Different minifigs, similar names**
   - Name similarity: 0.7
   - Image similarity: 0.15
   - **Combined: 0.34** (low confidence - correctly flagged)

3. **Missing image data**
   - Falls back to name + part count only
   - No degradation from current behavior

## Maintenance

### Backfilling New Images

Run periodically to catch newly added images:

```bash
npm run backfill:image-hashes both
```

### Monitoring

Check `bricklink_minifig_mappings` table:

```sql
-- Count mappings with image similarity
SELECT
  COUNT(*) FILTER (WHERE image_match_attempted = true) as with_images,
  COUNT(*) FILTER (WHERE image_match_attempted = false) as without_images,
  AVG(confidence) FILTER (WHERE image_match_attempted = true) as avg_conf_with_img,
  AVG(confidence) FILTER (WHERE image_match_attempted = false) as avg_conf_without
FROM bricklink_minifig_mappings;
```

### Troubleshooting

**Issue**: Image hashes not being generated

- Check image URLs are valid
- Verify network connectivity
- Check server logs for download errors
- Confirm sharp/imghash packages installed

**Issue**: Low image similarity despite visual match

- Images may have different backgrounds
- Resolution differences
- Cropping variations
- Consider adjusting similarity threshold

## Future Enhancements

1. **Image Caching**: Cache downloaded images to speed up backfill
2. **Parallel Processing**: Use worker threads for batch processing
3. **Alternative Algorithms**: Test dHash, aHash for comparison
4. **ML Embeddings**: Consider CLIP for even better accuracy
5. **Admin UI**: Build interface for batch review/approval

## Technical Notes

### Perceptual Hashing (pHash)

- Resistant to minor changes (scaling, compression)
- 16-bit hash provides good balance of accuracy/speed
- Hamming distance measures bit differences
- Similarity threshold of 0.85 recommended for matches

### Rate Limiting

- Respects external API rate limits
- Configurable delays between requests
- Batch processing prevents overwhelming servers

### Error Handling

- Individual image failures don't stop batch
- Logged for manual review
- Graceful fallback to name-based matching

## References

- [Perceptual Hashing](https://en.wikipedia.org/wiki/Perceptual_hashing)
- [sharp Documentation](https://sharp.pixelplumbing.com/)
- [imghash Package](https://www.npmjs.com/package/imghash)
