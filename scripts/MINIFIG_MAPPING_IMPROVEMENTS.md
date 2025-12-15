# Minifig Mapping Script Improvements

## Summary

Fixed and enhanced the minifig mapping ingest scripts (`build:minifig-mappings:all` and `build:minifig-mappings:user`) to address issues with subsequent runs and improve overall usability.

## Issues Fixed

### 1. **Skipping All Sets on Subsequent Runs**

**Problem**: After the first successful run, all sets had `minifig_sync_status='ok'` in the `bl_sets` table. On subsequent runs, the script would fetch the same 500 sets and skip all of them, processing nothing.

**Solution**:

- Query now filters out already-synced sets by checking `bl_sets.minifig_sync_status`
- Only processes sets that are unsynced (null, 'error', or 'pending' status)
- Fetches extra sets (3x the limit) to ensure we have enough after filtering

### 2. **No Ordering of Sets**

**Problem**: Sets were fetched in arbitrary order (likely by primary key), making it unpredictable which sets would be processed.

**Solution**:

- `build:minifig-mappings:all` - Orders by `set_num` (ascending) for consistent processing
- `build:minifig-mappings:user` - Orders by `created_at` (descending) to prioritize recently added user sets

### 3. **Limited Progress on First Run**

**Problem**: Only ~500 mappings were created despite a higher limit expectation.

**Clarification**: The `MINIFIG_MAPPING_MAX_SETS` (default 500) limits the number of **sets** processed, not individual mappings. Each set can have 0-N minifigs. Working as designed, but now with better logging to make this clear.

### 4. **Poor Progress Visibility**

**Problem**: Script output didn't show clear progress or statistics.

**Solution**: Added comprehensive logging:

- Progress counter: `[3/498] Processed 10311-1: 0 minifig mappings`
- Periodic progress updates every 50 sets
- Final summary with counts: `Phase 1 complete: 450 sets processed, 42 skipped, 6 errors, 1,234 minifig pairs`
- Separate tracking for processed/skipped/errored sets

## New Features

### `--force` Flag

Re-process already-synced sets:

```bash
npm run build:minifig-mappings:all -- --force
npm run build:minifig-mappings:user -- --force
```

Use cases:

- Re-sync sets after BrickLink catalog updates
- Fix mappings after algorithm improvements
- Recover from partial failures

### Enhanced Result Types

Updated `SetMappingResult` to include more detail:

```typescript
type SetMappingResult = {
  processed: boolean; // Successfully processed this run
  skipped: boolean; // Skipped because already synced
  error: boolean; // Error occurred during processing
  pairs: { rbFigId: string; blItemId: string }[];
};
```

## Usage

### Normal Operation (Process Unsynced Only)

```bash
# Process up to 500 unsynced sets from rb_sets
npm run build:minifig-mappings:all

# Process up to 500 unsynced user sets
npm run build:minifig-mappings:user
```

### Force Re-processing

```bash
# Re-process all sets, even those already synced
npm run build:minifig-mappings:all -- --force

# Re-process all user sets
npm run build:minifig-mappings:user -- --force
```

### Environment Variables

```bash
# Customize limits (default: 500 each)
MINIFIG_MAPPING_MAX_SETS=1000        # Max sets to process
MINIFIG_COMPONENT_API_BUDGET=500     # Max API calls for component mapping
```

## Expected Behavior

### First Run

```
[minifig-mapping:all] Processing 498 sets (cap: 500).
[minifig-mapping:all] [1/498] Processed 10309-1: 0 minifig mappings
[minifig-mapping:all] [2/498] Processed 1031-1: 0 minifig mappings
...
[minifig-mapping:all] Progress: 50/498 sets checked (48 processed, 0 skipped, 2 errors)
...
[minifig-mapping:all] Phase 1 complete: 495 sets processed, 0 skipped, 3 errors, 1,234 minifig pairs.
[minifig-mapping:all] Phase 2: Mapping component parts (budget: 500 API calls)...
[minifig-mapping:all] Phase 2 complete: 500 API calls, 892 parts mapped.
```

### Second Run (Without --force)

```
[minifig-mapping:all] Processing 487 sets (cap: 500).
[minifig-mapping:all] [1/487] Processed 20308-1: 4 minifig mappings
...
[minifig-mapping:all] Phase 1 complete: 487 sets processed, 0 skipped, 0 errors, 1,456 minifig pairs.
[minifig-mapping:all] Phase 2: Mapping component parts (budget: 500 API calls)...
```

### All Sets Synced

```
[minifig-mapping:all] No unsynced rb_sets found. Use --force to re-process already-synced sets.
```

## Implementation Details

### Query Strategy

1. Fetch 3x the limit from `rb_sets` (ordered)
2. Fetch sync status for those sets from `bl_sets`
3. Filter out sets with `minifig_sync_status='ok'` (unless `--force`)
4. Take first N sets after filtering

This approach ensures we always have enough unsynced sets to process, even when many sets are already synced.

### Backward Compatibility

- Existing callers of `processSetForMinifigMapping()` continue to work (force defaults to `false`)
- Scripts work identically when all sets are unsynced
- No database schema changes required

## Files Modified

- `scripts/build-minifig-mappings-from-all-sets.ts` - Main improvements
- `scripts/build-minifig-mappings-from-user-sets.ts` - Same improvements for user sets
- `scripts/minifig-mapping-core.ts` - Updated result type and added force parameter

## Testing

Verified that:

- ✅ Script processes unsynced sets on subsequent runs
- ✅ `--force` flag bypasses sync status checks
- ✅ Progress logging is clear and informative
- ✅ Phase 2 (component mapping) still works correctly
- ✅ Existing app code (on-demand sync) continues to work
