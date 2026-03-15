# Parts Infrastructure

Retained from the Can Build feature removal (2026-02-27). The search UI was removed but the underlying parts-coverage infrastructure is kept for future MOC upload support.

Migration: `20260228000534_parts_infrastructure.sql` (squashed from 9 original can-build migrations).

## DB Objects

### Table: `user_parts_inventory`

Aggregated per-user parts inventory keyed by `(user_id, part_num, color_id)`.

- Kept in sync via trigger on `user_set_parts` changes
- RLS enabled: users can only access their own rows
- Indexes: PK `(user_id, part_num, color_id)`, `(user_id)`, `(part_num, color_id)`, `(color_id)`

### Trigger: `sync_user_parts_inventory()`

Fires per-row on INSERT/UPDATE/DELETE on `user_set_parts`. Recalculates the aggregated quantity for the affected `(user_id, part_num, color_id)` tuple via a `SUM()` query, then upserts or deletes the corresponding `user_parts_inventory` row.

SECURITY DEFINER because the target table has RLS.

### Materialized Views

**`mv_set_parts`** — Flattened set parts: non-spare inventory parts + minifig component parts. Uses latest inventory version per set (handles multi-version sets). Indexes on `(part_num, color_id)` and `(set_num)`.

**`mv_set_non_spare_count`** — Pre-computed total non-spare entry count per set, derived from `mv_set_parts`. Unique index on `set_num`.

Both are global (not per-user) and only refreshed during catalog ingestion via `refreshPartsMatviews()` in `scripts/ingest-rebrickable.ts`.

### Functions

**`get_user_total_pieces(uuid)`** — Total piece count from owned sets via `user_sets` joined to `mv_set_parts`. Used in collection hero stats.

**`get_missing_parts(uuid, text)`** — Missing parts for a target set/MOC. Computes "effective parts" (parts from owned sets assumed complete + individually tracked inventory), then returns rows where owned < required. Returns part_num, color_id, part_name, color_name, img_url, required_qty, owned_qty, missing_qty.

## Scaling Profile

Reference data point: a user with 80 sets has ~50K unique part/color rows in `user_parts_inventory`.

### What scales with users

| Object                      | Rows per user (typical) | At 1K users | At 10K users |
| --------------------------- | ----------------------- | ----------- | ------------ |
| `user_parts_inventory`      | ~50K (heavy collector)  | ~50M        | ~500M        |
| `user_set_parts` (upstream) | ~50K                    | ~50M        | ~500M        |

All queries against these tables filter by `user_id` and hit the composite PK index, so each user's workload is isolated regardless of total table size.

### What doesn't scale with users

| Object                   | Size                                     | Notes                          |
| ------------------------ | ---------------------------------------- | ------------------------------ |
| `mv_set_parts`           | ~1.5M rows                               | Fixed; grows only with catalog |
| `mv_set_non_spare_count` | ~20K rows                                | One per set in catalog         |
| `get_user_total_pieces`  | Joins ~80 user_sets rows to mv_set_parts | Bounded by sets owned          |
| `get_missing_parts`      | Scoped to one set's parts                | Bounded by target set size     |

### Per-row trigger cost

`sync_user_parts_inventory` fires once per `user_set_parts` row change. Each invocation runs a single indexed `SUM()` then an upsert/delete — microseconds per call.

During bulk sync (e.g., cloud sync writing 500 parts for a set in one transaction), this means 500 trigger calls. Still fast (<1s) because each hits the PK index on a handful of rows, but worth keeping in mind for future batch operations.

## What to Watch

### Table bloat on `user_parts_inventory`

Frequent upserts and deletes create dead tuples. Postgres autovacuum handles this by default, but at high row counts the default thresholds may lag behind.

**When to act:** If `pg_stat_user_tables.n_dead_tup` for `user_parts_inventory` consistently exceeds ~10% of `n_live_tup`, tune autovacuum:

```sql
ALTER TABLE user_parts_inventory SET (
  autovacuum_vacuum_scale_factor = 0.05,  -- default 0.2
  autovacuum_analyze_scale_factor = 0.02  -- default 0.1
);
```

### Backfill query

The migration ends with a bulk INSERT…ON CONFLICT from `user_set_parts`. This is fine on a small dataset but will be slow if applied to a database with millions of existing rows. Once applied to production, consider removing it from the migration file (it's idempotent but unnecessarily expensive on future `db reset`).

### Matview refresh during ingestion

`REFRESH MATERIALIZED VIEW` takes a full lock and rebuilds from scratch. At current catalog size (~1.5M rows for `mv_set_parts`) this takes a few seconds. If the catalog grows significantly or ingestion runs more frequently, switch to `REFRESH MATERIALIZED VIEW CONCURRENTLY` (requires a unique index on `mv_set_parts` — would need to add one, e.g., on `(set_num, part_num, color_id)`).

### Index-only scans

At 500M+ rows in `user_parts_inventory`, ensure the visibility map stays current (tied to vacuuming above) so Postgres can use index-only scans instead of heap fetches.

### Potential future optimization: partitioning

If `user_parts_inventory` reaches hundreds of millions of rows and query latency degrades despite good indexing, hash-partition by `user_id`. This keeps each partition small and improves vacuum performance. Not needed until query plans show degradation.

## Future Use: MOC Support

These objects support the planned Custom MOC feature where users upload a parts list and see:

- What percentage of the MOC they can build from owned parts
- Which specific pieces are missing and in what quantities

See `docs/dev/CUSTOM_MOC_PLAN.md` for the full MOC feature plan.
