# Can Build Feature Design

## Overview

A new view in the `/collection` page that answers: "Given all the parts I own across my sets, what other sets could I build?" Users set a minimum coverage threshold, piece count range, and optional theme filter to discover buildable sets. A detail modal shows gap-closer recommendations — catalog sets whose parts would most improve coverage on a target set.

Plus-only feature. Requires server-side sync (already enabled for Plus users).

## Data Layer

### user_parts_inventory (existing table, not yet populated)

Aggregated cross-set parts inventory. PK: `(user_id, part_num, color_id)`.

| Column     | Type        | Notes                                 |
| ---------- | ----------- | ------------------------------------- |
| user_id    | UUID        | FK → auth.users                       |
| part_num   | TEXT        | FK → rb_parts                         |
| color_id   | INTEGER     | FK → rb_colors                        |
| quantity   | INTEGER     | Sum of owned_quantity across all sets |
| updated_at | TIMESTAMPTZ | Last recalculated                     |

### Postgres Trigger

A trigger on `user_set_parts` (INSERT/UPDATE/DELETE) recalculates the affected `(user_id, part_num, color_id)` row in `user_parts_inventory`:

```sql
CREATE OR REPLACE FUNCTION sync_user_parts_inventory()
RETURNS TRIGGER AS $$
DECLARE
  v_user_id UUID;
  v_part_num TEXT;
  v_color_id INTEGER;
  v_total INTEGER;
BEGIN
  v_user_id  := COALESCE(NEW.user_id, OLD.user_id);
  v_part_num := COALESCE(NEW.part_num, OLD.part_num);
  v_color_id := COALESCE(NEW.color_id, OLD.color_id);

  SELECT COALESCE(SUM(owned_quantity), 0) INTO v_total
  FROM user_set_parts
  WHERE user_id = v_user_id
    AND part_num = v_part_num
    AND color_id = v_color_id;

  IF v_total > 0 THEN
    INSERT INTO user_parts_inventory (user_id, part_num, color_id, quantity, updated_at)
    VALUES (v_user_id, v_part_num, v_color_id, v_total, now())
    ON CONFLICT (user_id, part_num, color_id)
    DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = now();
  ELSE
    DELETE FROM user_parts_inventory
    WHERE user_id = v_user_id
      AND part_num = v_part_num
      AND color_id = v_color_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_user_parts_inventory
  AFTER INSERT OR UPDATE OR DELETE ON user_set_parts
  FOR EACH ROW
  EXECUTE FUNCTION sync_user_parts_inventory();
```

No client-side mirror of `user_parts_inventory` is needed — it is a server-side derived table accessed only via API.

### Index Considerations

- `user_parts_inventory(user_id, part_num, color_id)` — already the PK
- `rb_inventory_parts(part_num, color_id)` — already indexed
- `rb_sets(num_parts)` — add B-tree index for the range filter
- `rb_themes(name)` — for ILIKE theme search (consider pg_trgm GIN index if slow)

## API Endpoints

### GET /api/can-build

Auth required. Plus-gated via `assertFeature(entitlements, 'can_build.enabled', 'Can Build')`.

**Query params:**

| Param           | Type    | Default | Description                         |
| --------------- | ------- | ------- | ----------------------------------- |
| minParts        | number  | 50      | Minimum piece count                 |
| maxParts        | number  | 500     | Maximum piece count                 |
| minCoverage     | number  | 80      | Minimum coverage % (0-100)          |
| theme           | string? | null    | Theme name text search (ILIKE)      |
| excludeMinifigs | boolean | false   | Exclude minifig parts from coverage |
| page            | number  | 1       | Pagination page                     |
| limit           | number  | 20      | Results per page                    |

**Response:**

```typescript
{
  sets: Array<{
    setNum: string;
    name: string;
    year: number | null;
    imageUrl: string | null;
    numParts: number;
    themeId: number | null;
    themeName: string | null;
    coveragePct: number; // e.g. 87.5
  }>;
  total: number;
  totalPieces: number; // user's aggregated piece count for the header
}
```

**Core SQL:**

```sql
WITH user_parts AS (
  SELECT part_num, color_id, quantity
  FROM user_parts_inventory
  WHERE user_id = :userId
),
candidate_sets AS (
  SELECT s.set_num, s.name, s.year, s.image_url, s.num_parts,
         s.theme_id, t.name AS theme_name
  FROM rb_sets s
  LEFT JOIN rb_themes t ON s.theme_id = t.id
  WHERE s.num_parts BETWEEN :minParts AND :maxParts
    AND (:theme IS NULL OR t.name ILIKE '%' || :theme || '%')
),
set_coverage AS (
  SELECT
    cs.set_num,
    COUNT(*) AS total_entries,
    COUNT(CASE WHEN COALESCE(up.quantity, 0) >= ip.quantity THEN 1 END)
      AS satisfied_entries
  FROM candidate_sets cs
  JOIN rb_inventories inv ON inv.set_num = cs.set_num
  JOIN rb_inventory_parts ip ON ip.inventory_id = inv.id
    AND ip.is_spare = false
  LEFT JOIN user_parts up
    ON up.part_num = ip.part_num AND up.color_id = ip.color_id
  GROUP BY cs.set_num
)
SELECT cs.*,
  ROUND(100.0 * sc.satisfied_entries
    / NULLIF(sc.total_entries, 0), 1) AS coverage_pct
FROM set_coverage sc
JOIN candidate_sets cs ON cs.set_num = sc.set_num
WHERE 100.0 * sc.satisfied_entries
  / NULLIF(sc.total_entries, 0) >= :minCoverage
ORDER BY coverage_pct DESC, cs.num_parts DESC
LIMIT :limit OFFSET :offset;
```

Note: Minifig filtering needs validation during implementation — `is_spare` may not be the correct discriminator. May need to exclude entries whose `part_num` appears in `rb_inventory_minifigs` instead.

### GET /api/can-build/[setNum]/gap

Auth required. Plus-gated. Loaded on demand when user opens detail modal.

**Response:**

```typescript
{
  targetSetNum: string;
  missingPartsCount: number;
  totalPartsCount: number;
  gaps: Array<{
    setNum: string;
    name: string;
    imageUrl: string | null;
    numParts: number;
    coverageGainPct: number; // e.g. 17.3
  }>; // top 3
}
```

**Core SQL:**

```sql
WITH target_inventory AS (
  SELECT ip.part_num, ip.color_id, ip.quantity AS required,
    COALESCE(up.quantity, 0) AS owned
  FROM rb_inventories inv
  JOIN rb_inventory_parts ip ON ip.inventory_id = inv.id
  LEFT JOIN user_parts_inventory up
    ON up.part_num = ip.part_num
    AND up.color_id = ip.color_id
    AND up.user_id = :userId
  WHERE inv.set_num = :targetSetNum
    AND COALESCE(up.quantity, 0) < ip.quantity
),
catalog_overlap AS (
  SELECT inv.set_num,
    COUNT(DISTINCT (ti.part_num, ti.color_id)) AS overlap_count
  FROM target_inventory ti
  JOIN rb_inventory_parts ip
    ON ip.part_num = ti.part_num AND ip.color_id = ti.color_id
  JOIN rb_inventories inv ON inv.id = ip.inventory_id
  WHERE inv.set_num != :targetSetNum
  GROUP BY inv.set_num
)
SELECT co.set_num, s.name, s.image_url, s.num_parts,
  ROUND(100.0 * co.overlap_count
    / NULLIF((SELECT COUNT(*) FROM target_inventory), 0), 1)
    AS coverage_gain_pct
FROM catalog_overlap co
JOIN rb_sets s ON s.set_num = co.set_num
ORDER BY co.overlap_count DESC
LIMIT 3;
```

## Service Layer

### app/lib/services/canBuild.ts

Two service functions (no HTTP types):

- `findBuildableSets(userId, filters)` — executes the Can Build query, returns typed results
- `findGapClosers(userId, targetSetNum)` — executes the gap closer query for a target set

Both use `getCatalogReadClient()` for catalog tables and `getSupabaseAuthServerClient()` for user data (or a service-role client for the `user_parts_inventory` read).

### Total Pieces Count

A simple query for the hero subheader:

```sql
SELECT COALESCE(SUM(quantity), 0) AS total_pieces
FROM user_parts_inventory
WHERE user_id = :userId;
```

Returned alongside the main results in the `/api/can-build` response.

## UI Design

### Collection Type Dropdown

Extends `CollectionType` from `'sets' | 'minifigs'` to `'sets' | 'minifigs' | 'can-build'`.

The "Can Build" option appears for all users. Selecting it without Plus shows an upsell prompt.

### Page Layout (when type=can-build)

```
┌─────────────────────────────────────────┐
│           Can Build              (h1)   │
│  Based on your owned sets, you          │
│  have 2,847 pieces.             (sub)   │
├─────────────────────────────────────────┤
│ Filter Panel                            │
│ [===|-------|===] 50 - 500 pieces       │
│ [=======|------] ≥ 80% coverage         │
│ ☐ Include minifigures                   │
│ [ Theme search...              ]        │
├─────────────────────────────────────────┤
│ ControlBar: [Theme ▾] [Year ▾] [Asc ▾] │
├─────────────────────────────────────────┤
│ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐       │
│ │ 97% │ │ 92% │ │ 87% │ │ 85% │       │
│ │Set A│ │Set B│ │Set C│ │Set D│       │
│ └─────┘ └─────┘ └─────┘ └─────┘       │
└─────────────────────────────────────────┘
```

### Hero Section

- "Can Build" as a large h1 heading
- Subheader: "Based on your owned sets, you have X pieces." where X is the aggregated total from `user_parts_inventory`

### Filter Panel

Below the hero, above the results. Can Build-specific controls:

- **Dual range slider** — piece count range (min/max), default 50–500
- **Coverage threshold slider** — single handle, 50%–100%, default 80%
- **Minifig toggle** — checkbox to include/exclude minifig parts
- **Theme text input** — debounced (300ms), ILIKE search against `rb_themes.name`

### ControlBar (reused)

Standard `ControlBar` with dropdowns for sorting/grouping results:

- Sort fields: Coverage (default, DESC), Theme, Year, Pieces
- Order direction: Ascending / Descending

### Result Cards

Reuse `SetDisplayCard` pattern with an added coverage percentage badge on each card. Grid layout consistent with existing sets view.

### Detail Modal

Opened on card click. Shows:

- Target set image, name, year, piece count
- Coverage breakdown: "You have 75 of 87 unique parts (86%)"
- Missing parts count
- **Gap Closer section**: loading spinner → top 3 catalog sets that fill the most missing parts
  - Each shows: set image, name, piece count, "+X%" coverage gain badge
  - Each links to that set's inventory page

### Empty States

| Condition             | Message                                                                                                   |
| --------------------- | --------------------------------------------------------------------------------------------------------- |
| No owned parts synced | "Start tracking owned parts on your sets to see what you can build."                                      |
| No results at filters | "No sets match your criteria. Try lowering the coverage threshold or expanding the piece count range."    |
| Theme filter miss     | Notice: "No sets found within [theme] matching your filter criteria." Then show unfiltered results below. |

### URL State

All filter params serialized to query string for shareability:

```
?type=can-build&minParts=50&maxParts=500&coverage=80&theme=technic&minifigs=false
```

## Feature Gating

- New feature flag: `can_build.enabled`, `min_tier: 'plus'`
- API: `assertFeature(entitlements, 'can_build.enabled', 'Can Build')` on both endpoints
- Client: "Can Build" option visible to all users; selecting without Plus shows upsell
- Data dependency: `user_parts_inventory` only populated for users with sync enabled (Plus), so the data naturally won't exist for free users

## Cache Strategy

- **Can Build results**: TanStack Query, `staleTime: 30s`, keyed on all filter params
- **Gap closer results**: TanStack Query, `staleTime: 5min`, keyed on `targetSetNum`
- **Total pieces count**: returned alongside main results, no separate query

## Migration Checklist

1. Create migration: trigger function + trigger on `user_set_parts`
2. Create migration: index on `rb_sets(num_parts)`
3. Create migration: feature flag row for `can_build.enabled`
4. Backfill `user_parts_inventory` for existing users (one-time script or migration)

## Files to Create/Modify

### New Files

- `supabase/migrations/XXXXXXXX_can_build_trigger.sql` — trigger + indexes + feature flag
- `app/lib/services/canBuild.ts` — service functions
- `app/api/can-build/route.ts` — main query endpoint
- `app/api/can-build/[setNum]/gap/route.ts` — gap closer endpoint
- `app/components/can-build/CanBuildView.tsx` — main view component
- `app/components/can-build/CanBuildFilters.tsx` — filter panel (sliders, toggle, theme input)
- `app/components/can-build/CanBuildControlBar.tsx` — reused ControlBar for result sorting
- `app/components/can-build/CanBuildDetailModal.tsx` — detail modal with gap closers
- `app/components/ui/DualRangeSlider.tsx` — reusable dual-handle range slider
- `app/hooks/useCanBuild.ts` — TanStack Query hook for Can Build results
- `app/hooks/useGapClosers.ts` — TanStack Query hook for gap closer results

### Modified Files

- `app/components/home/CollectionControlBar.tsx` — add 'can-build' to CollectionType + type dropdown
- `app/components/home/UserCollectionOverview.tsx` — render CanBuildView when type=can-build
- `app/collection/[handle]/page.tsx` — pass can-build as valid initialType
