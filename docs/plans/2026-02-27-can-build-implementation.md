# Can Build Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a "Can Build" view to the collection page that shows which sets a user could build from their owned parts, with coverage thresholds, filters, and gap-closer recommendations.

**Architecture:** Server-side SQL computes coverage percentages by joining the user's aggregated parts inventory against catalog set inventories. A Postgres trigger keeps `user_parts_inventory` in sync with `user_set_parts`. Two API endpoints serve the main query and on-demand gap-closer recommendations. TanStack Query handles client-side caching.

**Tech Stack:** Next.js Route Handlers, Supabase Postgres (triggers, RPC), TanStack Query, Tailwind CSS v4, Zustand (collection type state)

**Design doc:** `docs/plans/2026-02-27-can-build-design.md`

---

## Task 1: Database Migration — Trigger, Indexes, Feature Flag

**Files:**

- Create: `supabase/migrations/XXXXXXXX_can_build_setup.sql`

**Context:** The `user_parts_inventory` table already exists (PK: `user_id, part_num, color_id`) with RLS policies, but nothing populates it. The `user_set_parts` table is where per-set owned quantities are synced. We need a trigger to automatically aggregate into `user_parts_inventory` on every change to `user_set_parts`.

**Step 1: Generate migration file**

```bash
npx supabase migration new can_build_setup
```

**Step 2: Write the migration SQL**

The migration file at `supabase/migrations/XXXXXXXX_can_build_setup.sql` should contain:

```sql
-- 1. Trigger function: recalculate user_parts_inventory on user_set_parts changes
-- SECURITY DEFINER is required because user_parts_inventory has RLS enabled
-- and the trigger fires in the context of the modifying session.
create or replace function public.sync_user_parts_inventory()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_part_num text;
  v_color_id integer;
  v_total integer;
begin
  v_user_id  := coalesce(new.user_id, old.user_id);
  v_part_num := coalesce(new.part_num, old.part_num);
  v_color_id := coalesce(new.color_id, old.color_id);

  select coalesce(sum(owned_quantity), 0) into v_total
  from user_set_parts
  where user_id = v_user_id
    and part_num = v_part_num
    and color_id = v_color_id;

  if v_total > 0 then
    insert into user_parts_inventory (user_id, part_num, color_id, quantity, updated_at)
    values (v_user_id, v_part_num, v_color_id, v_total, now())
    on conflict (user_id, part_num, color_id)
    do update set quantity = excluded.quantity, updated_at = now();
  else
    delete from user_parts_inventory
    where user_id = v_user_id
      and part_num = v_part_num
      and color_id = v_color_id;
  end if;

  return coalesce(new, old);
end;
$$;

-- 2. Attach trigger to user_set_parts
create trigger trg_sync_user_parts_inventory
  after insert or update or delete on public.user_set_parts
  for each row
  execute function public.sync_user_parts_inventory();

-- 3. Index on rb_sets(num_parts) for the piece count range filter
create index if not exists rb_sets_num_parts_idx
  on public.rb_sets (num_parts);

-- 4. Backfill user_parts_inventory from existing user_set_parts data
insert into user_parts_inventory (user_id, part_num, color_id, quantity, updated_at)
select user_id, part_num, color_id, sum(owned_quantity), now()
from user_set_parts
where owned_quantity > 0
group by user_id, part_num, color_id
on conflict (user_id, part_num, color_id)
do update set quantity = excluded.quantity, updated_at = now();

-- 5. Feature flag for Can Build
insert into public.feature_flags (key, description, min_tier, rollout_pct, is_enabled)
values ('can_build.enabled', 'Can Build: discover buildable sets from owned parts', 'plus', 100, true)
on conflict (key) do update
set description = excluded.description,
    min_tier = excluded.min_tier,
    rollout_pct = excluded.rollout_pct,
    is_enabled = excluded.is_enabled;
```

**Step 3: Apply migration locally**

```bash
npx supabase migration up
```

Expected: Migration applies successfully.

**Step 4: Verify trigger works**

Open Supabase Studio SQL editor or run via `psql`:

```sql
-- Check trigger exists
select tgname from pg_trigger where tgname = 'trg_sync_user_parts_inventory';
-- Should return 1 row

-- Check feature flag
select * from feature_flags where key = 'can_build.enabled';
-- Should return 1 row with min_tier='plus'
```

**Step 5: Commit**

```bash
git add supabase/migrations/*_can_build_setup.sql
git commit -m "Add trigger, index, and feature flag for Can Build"
```

---

## Task 2: Service Layer — canBuild.ts

**Files:**

- Create: `app/lib/services/canBuild.ts`
- Create: `app/lib/services/__tests__/canBuild.test.ts`

**Context:** Service functions follow the pattern in `app/lib/services/billing.ts`: `import 'server-only'` at top, pure types, async functions with optional dependency injection. Use `getSupabaseServiceRoleClient()` to bypass RLS for the complex join query (the user's data is scoped by `user_id` in the WHERE clause).

**Reference files:**

- `app/lib/services/billing.ts` — service pattern
- `app/lib/services/entitlements.ts` — `assertFeature` pattern
- `app/lib/services/usageCounters.ts` — RPC pattern
- `app/lib/services/__tests__/inventory.test.ts` — test mocking pattern

### Step 1: Write tests for canBuild service

Create `app/lib/services/__tests__/canBuild.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/metrics', () => ({
  logger: { debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Mock Supabase service role client
const mockRpcResponse = {
  data: null as unknown,
  error: null as { message: string } | null,
};
const mockRpc = vi.fn(() => Promise.resolve(mockRpcResponse));

vi.mock('@/app/lib/db/catalogAccess', () => ({
  getSupabaseServiceRoleClient: () => ({
    rpc: (...args: unknown[]) => mockRpc(...args),
  }),
}));

import {
  findBuildableSets,
  findGapClosers,
  type CanBuildFilters,
} from '../canBuild';

const TEST_USER_ID = 'user-123';

describe('findBuildableSets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRpcResponse.data = null;
    mockRpcResponse.error = null;
  });

  it('passes filter params to RPC and returns mapped results', async () => {
    mockRpcResponse.data = [
      {
        set_num: '75192-1',
        name: 'Millennium Falcon',
        year: 2017,
        image_url: 'https://example.com/75192.jpg',
        num_parts: 7541,
        theme_id: 171,
        theme_name: 'Star Wars',
        coverage_pct: 92.5,
        total_count: 100,
      },
    ];

    const filters: CanBuildFilters = {
      minParts: 100,
      maxParts: 10000,
      minCoverage: 80,
      theme: null,
      excludeMinifigs: false,
      page: 1,
      limit: 20,
    };

    const result = await findBuildableSets(TEST_USER_ID, filters);

    expect(mockRpc).toHaveBeenCalledWith(
      'find_buildable_sets',
      expect.objectContaining({
        p_user_id: TEST_USER_ID,
        p_min_parts: 100,
        p_max_parts: 10000,
        p_min_coverage: 80,
      })
    );
    expect(result.sets).toHaveLength(1);
    expect(result.sets[0]!.setNum).toBe('75192-1');
    expect(result.sets[0]!.coveragePct).toBe(92.5);
  });

  it('returns empty results when RPC returns null data', async () => {
    mockRpcResponse.data = null;

    const result = await findBuildableSets(TEST_USER_ID, {
      minParts: 50,
      maxParts: 500,
      minCoverage: 80,
      theme: null,
      excludeMinifigs: false,
      page: 1,
      limit: 20,
    });

    expect(result.sets).toEqual([]);
    expect(result.total).toBe(0);
  });

  it('throws on RPC error', async () => {
    mockRpcResponse.error = { message: 'db error' };

    await expect(
      findBuildableSets(TEST_USER_ID, {
        minParts: 50,
        maxParts: 500,
        minCoverage: 80,
        theme: null,
        excludeMinifigs: false,
        page: 1,
        limit: 20,
      })
    ).rejects.toThrow('db error');
  });
});

describe('findGapClosers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRpcResponse.data = null;
    mockRpcResponse.error = null;
  });

  it('returns top 3 gap closer sets', async () => {
    mockRpcResponse.data = [
      {
        set_num: '10300-1',
        name: 'DeLorean',
        image_url: null,
        num_parts: 1872,
        coverage_gain_pct: 17.3,
      },
      {
        set_num: '10294-1',
        name: 'Titanic',
        image_url: null,
        num_parts: 9090,
        coverage_gain_pct: 11.1,
      },
      {
        set_num: '10276-1',
        name: 'Colosseum',
        image_url: null,
        num_parts: 9036,
        coverage_gain_pct: 8.5,
      },
    ];

    const result = await findGapClosers(TEST_USER_ID, '75192-1');

    expect(mockRpc).toHaveBeenCalledWith(
      'find_gap_closers',
      expect.objectContaining({
        p_user_id: TEST_USER_ID,
        p_target_set_num: '75192-1',
      })
    );
    expect(result.gaps).toHaveLength(3);
    expect(result.gaps[0]!.coverageGainPct).toBe(17.3);
  });
});
```

### Step 2: Run tests to verify they fail

```bash
npm test -- --run app/lib/services/__tests__/canBuild.test.ts
```

Expected: FAIL — `canBuild` module does not exist yet.

### Step 3: Implement canBuild service

Create `app/lib/services/canBuild.ts`:

```typescript
import 'server-only';

import { getSupabaseServiceRoleClient } from '@/app/lib/db/catalogAccess';
import { logger } from '@/lib/metrics';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CanBuildFilters = {
  minParts: number;
  maxParts: number;
  minCoverage: number;
  theme: string | null;
  excludeMinifigs: boolean;
  page: number;
  limit: number;
};

export type CanBuildSet = {
  setNum: string;
  name: string;
  year: number | null;
  imageUrl: string | null;
  numParts: number;
  themeId: number | null;
  themeName: string | null;
  coveragePct: number;
};

export type CanBuildResult = {
  sets: CanBuildSet[];
  total: number;
  totalPieces: number;
};

export type GapCloserSet = {
  setNum: string;
  name: string;
  imageUrl: string | null;
  numParts: number;
  coverageGainPct: number;
};

export type GapCloserResult = {
  targetSetNum: string;
  missingPartsCount: number;
  totalPartsCount: number;
  gaps: GapCloserSet[];
};

// ---------------------------------------------------------------------------
// RPC row types (what Postgres returns)
// ---------------------------------------------------------------------------

type BuildableSetRow = {
  set_num: string;
  name: string;
  year: number | null;
  image_url: string | null;
  num_parts: number;
  theme_id: number | null;
  theme_name: string | null;
  coverage_pct: number;
  total_count: number;
};

type GapCloserRow = {
  set_num: string;
  name: string;
  image_url: string | null;
  num_parts: number;
  coverage_gain_pct: number;
  missing_count?: number;
  total_count?: number;
};

// ---------------------------------------------------------------------------
// Service functions
// ---------------------------------------------------------------------------

export async function findBuildableSets(
  userId: string,
  filters: CanBuildFilters
): Promise<CanBuildResult> {
  const supabase = getSupabaseServiceRoleClient();
  const offset = (filters.page - 1) * filters.limit;

  const { data, error } = await (
    supabase.rpc as (
      fn: string,
      args: Record<string, unknown>
    ) => Promise<{
      data: BuildableSetRow[] | null;
      error: { message: string } | null;
    }>
  )('find_buildable_sets', {
    p_user_id: userId,
    p_min_parts: filters.minParts,
    p_max_parts: filters.maxParts,
    p_min_coverage: filters.minCoverage,
    p_theme: filters.theme,
    p_exclude_minifigs: filters.excludeMinifigs,
    p_limit: filters.limit,
    p_offset: offset,
  });

  if (error) {
    logger.error('can_build.find_buildable_sets_failed', {
      userId,
      error: error.message,
    });
    throw new Error(error.message);
  }

  const rows = data ?? [];
  const total = rows.length > 0 ? (rows[0]!.total_count ?? 0) : 0;

  // Get total pieces count
  const { data: piecesData } = await (
    supabase.rpc as (
      fn: string,
      args: Record<string, unknown>
    ) => Promise<{ data: number | null; error: { message: string } | null }>
  )('get_user_total_pieces', { p_user_id: userId });

  return {
    sets: rows.map(row => ({
      setNum: row.set_num,
      name: row.name,
      year: row.year,
      imageUrl: row.image_url,
      numParts: row.num_parts,
      themeId: row.theme_id,
      themeName: row.theme_name,
      coveragePct: row.coverage_pct,
    })),
    total,
    totalPieces: typeof piecesData === 'number' ? piecesData : 0,
  };
}

export async function findGapClosers(
  userId: string,
  targetSetNum: string
): Promise<GapCloserResult> {
  const supabase = getSupabaseServiceRoleClient();

  const { data, error } = await (
    supabase.rpc as (
      fn: string,
      args: Record<string, unknown>
    ) => Promise<{
      data: GapCloserRow[] | null;
      error: { message: string } | null;
    }>
  )('find_gap_closers', {
    p_user_id: userId,
    p_target_set_num: targetSetNum,
  });

  if (error) {
    logger.error('can_build.find_gap_closers_failed', {
      userId,
      targetSetNum,
      error: error.message,
    });
    throw new Error(error.message);
  }

  const rows = data ?? [];
  const missingCount = rows.length > 0 ? (rows[0]!.missing_count ?? 0) : 0;
  const totalCount = rows.length > 0 ? (rows[0]!.total_count ?? 0) : 0;

  return {
    targetSetNum,
    missingPartsCount: missingCount,
    totalPartsCount: totalCount,
    gaps: rows.map(row => ({
      setNum: row.set_num,
      name: row.name,
      imageUrl: row.image_url,
      numParts: row.num_parts,
      coverageGainPct: row.coverage_gain_pct,
    })),
  };
}
```

### Step 4: Run tests to verify they pass

```bash
npm test -- --run app/lib/services/__tests__/canBuild.test.ts
```

Expected: PASS

### Step 5: Commit

```bash
git add app/lib/services/canBuild.ts app/lib/services/__tests__/canBuild.test.ts
git commit -m "Add canBuild service layer with tests"
```

---

## Task 3: Database Migration — RPC Functions

**Files:**

- Create: `supabase/migrations/XXXXXXXX_can_build_rpc.sql`

**Context:** Rather than constructing raw SQL in the service layer, we use Postgres RPC functions. This keeps complex SQL in the database, makes it testable via SQL, and avoids SQL injection concerns. The service layer calls these via `supabase.rpc()`.

**Step 1: Generate migration**

```bash
npx supabase migration new can_build_rpc
```

**Step 2: Write the RPC functions**

```sql
-- find_buildable_sets: main "Can Build" query
-- Returns sets the user can build, filtered by piece count, coverage, and optional theme.
-- Uses window function for total_count to support pagination without separate COUNT query.
create or replace function public.find_buildable_sets(
  p_user_id uuid,
  p_min_parts int,
  p_max_parts int,
  p_min_coverage numeric,
  p_theme text default null,
  p_exclude_minifigs boolean default false,
  p_limit int default 20,
  p_offset int default 0
)
returns table (
  set_num text,
  name text,
  year int,
  image_url text,
  num_parts int,
  theme_id int,
  theme_name text,
  coverage_pct numeric,
  total_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with user_parts as (
    select part_num, color_id, quantity
    from user_parts_inventory
    where user_id = p_user_id
  ),
  candidate_sets as (
    select s.set_num, s.name, s.year, s.image_url, s.num_parts,
           s.theme_id, t.name as theme_name
    from rb_sets s
    left join rb_themes t on s.theme_id = t.id
    where s.num_parts between p_min_parts and p_max_parts
      and (p_theme is null or t.name ilike '%' || p_theme || '%')
  ),
  set_coverage as (
    select
      cs.set_num,
      count(*) as total_entries,
      count(case when coalesce(up.quantity, 0) >= ip.quantity then 1 end)
        as satisfied_entries
    from candidate_sets cs
    join rb_inventories inv on inv.set_num = cs.set_num
    join rb_inventory_parts ip on ip.inventory_id = inv.id
      and ip.is_spare = false
    left join user_parts up
      on up.part_num = ip.part_num and up.color_id = ip.color_id
    group by cs.set_num
  ),
  filtered as (
    select cs.set_num, cs.name, cs.year, cs.image_url, cs.num_parts,
           cs.theme_id, cs.theme_name,
           round(100.0 * sc.satisfied_entries
             / nullif(sc.total_entries, 0), 1) as coverage_pct
    from set_coverage sc
    join candidate_sets cs on cs.set_num = sc.set_num
    where 100.0 * sc.satisfied_entries
      / nullif(sc.total_entries, 0) >= p_min_coverage
  )
  select f.set_num, f.name, f.year, f.image_url, f.num_parts,
         f.theme_id, f.theme_name, f.coverage_pct,
         count(*) over () as total_count
  from filtered f
  order by f.coverage_pct desc, f.num_parts desc
  limit p_limit offset p_offset;
$$;

-- get_user_total_pieces: returns total aggregated piece count for hero subheader
create or replace function public.get_user_total_pieces(
  p_user_id uuid
)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(quantity), 0)
  from user_parts_inventory
  where user_id = p_user_id;
$$;

-- find_gap_closers: for a target set, find catalog sets that fill the most missing parts
create or replace function public.find_gap_closers(
  p_user_id uuid,
  p_target_set_num text
)
returns table (
  set_num text,
  name text,
  image_url text,
  num_parts int,
  coverage_gain_pct numeric,
  missing_count bigint,
  total_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with target_total as (
    select count(*) as cnt
    from rb_inventories inv
    join rb_inventory_parts ip on ip.inventory_id = inv.id and ip.is_spare = false
    where inv.set_num = p_target_set_num
  ),
  target_missing as (
    select ip.part_num, ip.color_id
    from rb_inventories inv
    join rb_inventory_parts ip on ip.inventory_id = inv.id and ip.is_spare = false
    left join user_parts_inventory up
      on up.part_num = ip.part_num
      and up.color_id = ip.color_id
      and up.user_id = p_user_id
    where inv.set_num = p_target_set_num
      and coalesce(up.quantity, 0) < ip.quantity
  ),
  catalog_overlap as (
    select inv.set_num,
      count(distinct (tm.part_num, tm.color_id)) as overlap_count
    from target_missing tm
    join rb_inventory_parts ip
      on ip.part_num = tm.part_num and ip.color_id = tm.color_id
    join rb_inventories inv on inv.id = ip.inventory_id
    where inv.set_num != p_target_set_num
    group by inv.set_num
  )
  select co.set_num, s.name, s.image_url, s.num_parts,
    round(100.0 * co.overlap_count
      / nullif((select cnt from target_total), 0), 1) as coverage_gain_pct,
    (select count(*) from target_missing) as missing_count,
    (select cnt from target_total) as total_count
  from catalog_overlap co
  join rb_sets s on s.set_num = co.set_num
  order by co.overlap_count desc
  limit 3;
$$;
```

**Step 3: Apply migration**

```bash
npx supabase migration up
```

**Step 4: Verify RPC functions exist**

```sql
select proname from pg_proc where proname in (
  'find_buildable_sets', 'find_gap_closers', 'get_user_total_pieces'
);
-- Should return 3 rows
```

**Step 5: Commit**

```bash
git add supabase/migrations/*_can_build_rpc.sql
git commit -m "Add RPC functions for Can Build queries"
```

---

## Task 4: API Route — GET /api/can-build

**Files:**

- Create: `app/api/can-build/route.ts`

**Context:** Follows the pattern in `app/api/user-sets/route.ts`: auth check → entitlements check → service call → JSON response. Uses `getSupabaseAuthServerClient()` for auth, `getEntitlements()` + `assertFeature()` for gating.

**Reference files:**

- `app/api/user-sets/route.ts` — route handler pattern
- `app/lib/services/entitlements.ts:177-190` — `assertFeature` usage
- `app/lib/api/responses.ts` — `errorResponse` helper

### Step 1: Implement the route handler

Create `app/api/can-build/route.ts`:

```typescript
import { NextResponse, type NextRequest } from 'next/server';

import { errorResponse } from '@/app/lib/api/responses';
import {
  getEntitlements,
  assertFeature,
} from '@/app/lib/services/entitlements';
import {
  findBuildableSets,
  type CanBuildFilters,
} from '@/app/lib/services/canBuild';
import { getSupabaseAuthServerClient } from '@/app/lib/supabaseAuthServerClient';
import { logger } from '@/lib/metrics';

function parseIntParam(value: string | null, fallback: number): number {
  if (!value) return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : fallback;
}

function parseBoolParam(value: string | null, fallback: boolean): boolean {
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  return fallback;
}

export async function GET(req: NextRequest) {
  const supabase = await getSupabaseAuthServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return errorResponse('unauthorized');
  }

  try {
    const entitlements = await getEntitlements(user.id);
    assertFeature(entitlements, 'can_build.enabled', {
      featureDisplayName: 'Can Build',
    });
  } catch (err) {
    const typed = err as Error & { code?: string };
    if (typed.code === 'feature_unavailable') {
      return NextResponse.json(
        { error: 'feature_unavailable', reason: 'upgrade_required' },
        { status: 403 }
      );
    }
    throw err;
  }

  try {
    const params = req.nextUrl.searchParams;
    const filters: CanBuildFilters = {
      minParts: parseIntParam(params.get('minParts'), 50),
      maxParts: parseIntParam(params.get('maxParts'), 500),
      minCoverage: parseIntParam(params.get('minCoverage'), 80),
      theme: params.get('theme') || null,
      excludeMinifigs: parseBoolParam(params.get('excludeMinifigs'), false),
      page: parseIntParam(params.get('page'), 1),
      limit: Math.min(parseIntParam(params.get('limit'), 20), 100),
    };

    const result = await findBuildableSets(user.id, filters);

    return NextResponse.json(result, {
      headers: {
        'Cache-Control': 'private, max-age=30, stale-while-revalidate=60',
      },
    });
  } catch (err) {
    logger.error('can_build.route_failed', {
      userId: user.id,
      error: err instanceof Error ? err.message : String(err),
    });
    return errorResponse('unknown_error');
  }
}
```

### Step 2: Commit

```bash
git add app/api/can-build/route.ts
git commit -m "Add GET /api/can-build route handler"
```

---

## Task 5: API Route — GET /api/can-build/[setNum]/gap

**Files:**

- Create: `app/api/can-build/[setNum]/gap/route.ts`

### Step 1: Implement the gap closer route

Create `app/api/can-build/[setNum]/gap/route.ts`:

```typescript
import { NextResponse } from 'next/server';

import { errorResponse } from '@/app/lib/api/responses';
import {
  getEntitlements,
  assertFeature,
} from '@/app/lib/services/entitlements';
import { findGapClosers } from '@/app/lib/services/canBuild';
import { getSupabaseAuthServerClient } from '@/app/lib/supabaseAuthServerClient';
import { logger } from '@/lib/metrics';

type RouteContext = {
  params: Promise<{ setNum: string }>;
};

export async function GET(_req: Request, context: RouteContext) {
  const supabase = await getSupabaseAuthServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return errorResponse('unauthorized');
  }

  try {
    const entitlements = await getEntitlements(user.id);
    assertFeature(entitlements, 'can_build.enabled', {
      featureDisplayName: 'Can Build',
    });
  } catch (err) {
    const typed = err as Error & { code?: string };
    if (typed.code === 'feature_unavailable') {
      return NextResponse.json(
        { error: 'feature_unavailable', reason: 'upgrade_required' },
        { status: 403 }
      );
    }
    throw err;
  }

  try {
    const { setNum } = await context.params;
    if (!setNum) {
      return errorResponse('validation_failed', {
        message: 'Missing setNum parameter',
      });
    }

    const result = await findGapClosers(user.id, setNum);

    return NextResponse.json(result, {
      headers: {
        'Cache-Control': 'private, max-age=300, stale-while-revalidate=600',
      },
    });
  } catch (err) {
    logger.error('can_build.gap_route_failed', {
      userId: user.id,
      error: err instanceof Error ? err.message : String(err),
    });
    return errorResponse('unknown_error');
  }
}
```

### Step 2: Commit

```bash
git add app/api/can-build/[setNum]/gap/route.ts
git commit -m "Add GET /api/can-build/[setNum]/gap route handler"
```

---

## Task 6: TanStack Query Hooks

**Files:**

- Create: `app/hooks/useCanBuild.ts`
- Create: `app/hooks/useGapClosers.ts`

**Context:** Follow the pattern in `app/hooks/useInventory.ts`: fetch function with AbortSignal support, `useQuery` with appropriate `staleTime`/`gcTime`.

**Reference files:**

- `app/hooks/useInventory.ts` — query hook pattern
- `app/hooks/useThemeNames.ts` — simple hook pattern

### Step 1: Create useCanBuild hook

Create `app/hooks/useCanBuild.ts`:

```typescript
'use client';

import { useQuery } from '@tanstack/react-query';
import type {
  CanBuildFilters,
  CanBuildResult,
} from '@/app/lib/services/canBuild';

async function fetchCanBuild(
  filters: CanBuildFilters,
  signal?: AbortSignal
): Promise<CanBuildResult> {
  const params = new URLSearchParams({
    minParts: String(filters.minParts),
    maxParts: String(filters.maxParts),
    minCoverage: String(filters.minCoverage),
    excludeMinifigs: String(filters.excludeMinifigs),
    page: String(filters.page),
    limit: String(filters.limit),
  });
  if (filters.theme) {
    params.set('theme', filters.theme);
  }

  const res = await fetch(`/api/can-build?${params}`, { signal });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? 'can_build_failed');
  }

  return res.json() as Promise<CanBuildResult>;
}

export function useCanBuild(filters: CanBuildFilters, enabled = true) {
  return useQuery<CanBuildResult>({
    queryKey: ['can-build', filters],
    queryFn: ({ signal }) => fetchCanBuild(filters, signal),
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    enabled,
  });
}
```

### Step 2: Create useGapClosers hook

Create `app/hooks/useGapClosers.ts`:

```typescript
'use client';

import { useQuery } from '@tanstack/react-query';
import type { GapCloserResult } from '@/app/lib/services/canBuild';

async function fetchGapClosers(
  setNum: string,
  signal?: AbortSignal
): Promise<GapCloserResult> {
  const res = await fetch(`/api/can-build/${encodeURIComponent(setNum)}/gap`, {
    signal,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? 'gap_closers_failed');
  }

  return res.json() as Promise<GapCloserResult>;
}

export function useGapClosers(setNum: string | null) {
  return useQuery<GapCloserResult>({
    queryKey: ['gap-closers', setNum],
    queryFn: ({ signal }) => fetchGapClosers(setNum!, signal),
    staleTime: 5 * 60_000,
    gcTime: 15 * 60_000,
    enabled: !!setNum,
  });
}
```

### Step 3: Commit

```bash
git add app/hooks/useCanBuild.ts app/hooks/useGapClosers.ts
git commit -m "Add TanStack Query hooks for Can Build and gap closers"
```

---

## Task 7: UI — DualRangeSlider Component

**Files:**

- Create: `app/components/ui/DualRangeSlider.tsx`

**Context:** A reusable dual-handle range slider for the piece count filter. Pure CSS + controlled React component. No external dependencies.

**Reference files:**

- `app/components/ui/` — existing UI primitives pattern
- `app/globals.css` — theme variables

### Step 1: Implement DualRangeSlider

Create `app/components/ui/DualRangeSlider.tsx`. This should be a controlled component with `min`, `max`, `value: [number, number]`, `onChange`, `step`, and `label` props. Use two overlapping `<input type="range">` elements with custom Tailwind styling for the track and thumbs.

The component should:

- Accept `min`, `max`, `step`, `value: [number, number]`, `onChange: (value: [number, number]) => void`
- Prevent the handles from crossing each other
- Display the current range values as text (e.g., "50 - 500 pieces")
- Use theme-consistent colors (`bg-theme-primary` for the active track segment)

### Step 2: Commit

```bash
git add app/components/ui/DualRangeSlider.tsx
git commit -m "Add DualRangeSlider UI component"
```

---

## Task 8: UI — CanBuildFilters Component

**Files:**

- Create: `app/components/can-build/CanBuildFilters.tsx`

**Context:** The filter panel below the hero section. Contains the dual range slider (piece count), single slider (coverage threshold), minifig toggle, and theme text input.

### Step 1: Implement CanBuildFilters

Create `app/components/can-build/CanBuildFilters.tsx`. This is a controlled component that receives current filter values and callbacks:

```typescript
type CanBuildFiltersProps = {
  minParts: number;
  maxParts: number;
  onPieceRangeChange: (range: [number, number]) => void;
  minCoverage: number;
  onCoverageChange: (value: number) => void;
  excludeMinifigs: boolean;
  onExcludeMinifigsChange: (value: boolean) => void;
  theme: string;
  onThemeChange: (value: string) => void;
};
```

Layout:

- Row 1: DualRangeSlider for piece count (min: 1, max: 5000+, step: 10)
- Row 2: Single range input for coverage threshold (min: 50, max: 100, step: 5)
- Row 3: Checkbox toggle for "Include minifigures" + theme text input

Theme input should be debounced (300ms) — use a local state + `useEffect` with timeout.

### Step 2: Commit

```bash
git add app/components/can-build/CanBuildFilters.tsx
git commit -m "Add CanBuildFilters component"
```

---

## Task 9: UI — CanBuildControlBar Component

**Files:**

- Create: `app/components/can-build/CanBuildControlBar.tsx`

**Context:** Reuses the `ControlBar` + `DropdownTrigger`/`SingleSelectList` pattern from `CollectionControlBar.tsx`. Sort fields: Coverage (default), Theme, Year, Pieces. Plus order direction.

**Reference files:**

- `app/components/home/CollectionControlBar.tsx` — exact pattern to follow
- `app/components/ui/ControlBar.tsx` — base component
- `app/components/ui/GroupedDropdown.tsx` — dropdown primitives

### Step 1: Implement CanBuildControlBar

Create `app/components/can-build/CanBuildControlBar.tsx`. Follow the `CollectionControlBar` pattern exactly — same imports, same dropdown structure. Sort options:

```typescript
const sortOptions: DropdownOption[] = [
  { key: 'coverage', text: 'Coverage' },
  { key: 'theme', text: 'Theme' },
  { key: 'year', text: 'Year' },
  { key: 'pieces', text: 'Pieces' },
];
```

Props: `sortField`, `onSortFieldChange`, `sortDir`, `onSortDirChange`.

### Step 2: Commit

```bash
git add app/components/can-build/CanBuildControlBar.tsx
git commit -m "Add CanBuildControlBar component"
```

---

## Task 10: UI — CanBuildDetailModal Component

**Files:**

- Create: `app/components/can-build/CanBuildDetailModal.tsx`

**Context:** Modal shown when clicking a set card in Can Build results. Shows coverage breakdown and lazy-loads gap-closer recommendations via `useGapClosers`.

**Reference files:**

- `app/components/set/SetDetailModal.tsx` — existing modal pattern
- `app/hooks/useGapClosers.ts` — gap closer hook

### Step 1: Implement CanBuildDetailModal

Create `app/components/can-build/CanBuildDetailModal.tsx`. The modal receives the selected set's data as props:

```typescript
type CanBuildDetailModalProps = {
  isOpen: boolean;
  onClose: () => void;
  set: {
    setNum: string;
    name: string;
    year: number | null;
    imageUrl: string | null;
    numParts: number;
    themeName: string | null;
    coveragePct: number;
  } | null;
};
```

Content:

- Set image + name + year + piece count
- Coverage bar: "You have X% of the parts for this set"
- Gap closer section: calls `useGapClosers(set.setNum)` when modal opens
  - Loading: spinner
  - Results: up to 3 cards showing set name, piece count, "+X%" badge
  - Each gap closer links to `/sets/{setNum}`
- Link to full set inventory page

### Step 2: Commit

```bash
git add app/components/can-build/CanBuildDetailModal.tsx
git commit -m "Add CanBuildDetailModal with gap closers"
```

---

## Task 11: UI — CanBuildView (Main View)

**Files:**

- Create: `app/components/can-build/CanBuildView.tsx`

**Context:** The main view component rendered inside `UserCollectionOverview` when `collectionType === 'can-build'`. Orchestrates: hero section, filters, control bar, results grid, detail modal.

### Step 1: Implement CanBuildView

Create `app/components/can-build/CanBuildView.tsx`. This is a `'use client'` component that:

1. Manages filter state (`useState` for piece range, coverage, theme, excludeMinifigs)
2. Manages sort state (`useState` for sortField, sortDir)
3. Manages pagination (`useState` for page)
4. Calls `useCanBuild(filters)` to fetch results
5. Manages detail modal state (`useState<CanBuildSet | null>`)
6. Syncs filter state to URL search params (like `UserCollectionOverview` does)

Layout:

```
<section>
  {/* Hero */}
  <div className="mx-auto w-full max-w-7xl px-4 text-center">
    <h1>Can Build</h1>
    <p>Based on your owned sets, you have {totalPieces} pieces.</p>
  </div>

  {/* Filters */}
  <CanBuildFilters ... />

  {/* Control bar (only when results exist) */}
  {results.length > 0 && <CanBuildControlBar ... />}

  {/* Results grid */}
  <div className="grid grid-cols-1 gap-x-2 gap-y-4 xs:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
    {sortedResults.map(set => <SetCard ... onClick={() => openModal(set)} />)}
  </div>

  {/* Empty states */}
  ...

  {/* Detail modal */}
  <CanBuildDetailModal ... />
</section>
```

Client-side sorting: results come from the API sorted by coverage DESC. Additional sorting (by theme/year/pieces) is done client-side on the already-fetched page of results.

### Step 2: Commit

```bash
git add app/components/can-build/CanBuildView.tsx
git commit -m "Add CanBuildView main component"
```

---

## Task 12: Integration — Wire Into Collection Page

**Files:**

- Modify: `app/components/home/CollectionControlBar.tsx` — add `'can-build'` to `CollectionType` and type dropdown options
- Modify: `app/components/home/UserCollectionOverview.tsx` — render `CanBuildView` when `collectionType === 'can-build'`
- Modify: `app/collection/[handle]/page.tsx` — accept `'can-build'` in `extractInitialType`

### Step 1: Update CollectionControlBar types and options

In `app/components/home/CollectionControlBar.tsx`:

1. Change `CollectionType` to `'sets' | 'minifigs' | 'can-build'`
2. Add to `typeOptions`:
   ```typescript
   const typeOptions: DropdownOption[] = [
     { key: 'sets', text: 'Sets' },
     { key: 'minifigs', text: 'Minifigs' },
     { key: 'can-build', text: 'Can Build' },
   ];
   ```
3. When `collectionType === 'can-build'`, hide the collection-specific controls (list filter, theme filter, sort) since CanBuildView has its own controls.

### Step 2: Update UserCollectionOverview

In `app/components/home/UserCollectionOverview.tsx`:

1. Import `CanBuildView` (lazy: `const CanBuildView = dynamic(() => import(...), { ssr: false })`)
2. In the render section, add:
   ```typescript
   {collectionType === 'can-build' && <CanBuildView />}
   ```
3. Hide the existing sets/minifigs content when `collectionType === 'can-build'`.

### Step 3: Update page.tsx

In `app/collection/[handle]/page.tsx`, update `extractInitialType`:

```typescript
function extractInitialType(
  params: SearchParams
): 'sets' | 'minifigs' | 'can-build' {
  const raw = params.type;
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === 'minifigs') return 'minifigs';
  if (value === 'can-build') return 'can-build';
  return 'sets';
}
```

### Step 4: Commit

```bash
git add app/components/home/CollectionControlBar.tsx app/components/home/UserCollectionOverview.tsx app/collection/[handle]/page.tsx
git commit -m "Wire Can Build into collection page type dropdown"
```

---

## Task 13: Type-Check and Lint

**Step 1: Run type checker**

```bash
npx tsc --noEmit
```

Fix any type errors.

**Step 2: Run linter and formatter**

```bash
npm run format
npm run lint
```

Fix any issues.

**Step 3: Commit fixes**

```bash
git add -A
git commit -m "Fix type and lint errors for Can Build"
```

---

## Task 14: Manual Testing Checklist

Test the full flow end-to-end:

1. **Migration**: Verify `user_parts_inventory` is populated for a test user by checking via SQL
2. **Trigger**: Add/remove owned parts on a set, verify `user_parts_inventory` updates
3. **API**: Hit `/api/can-build?minParts=50&maxParts=500&minCoverage=50` and verify response shape
4. **API gap**: Hit `/api/can-build/{setNum}/gap` for a set from the results and verify gap closers
5. **Feature gate**: Verify a free-tier user gets 403 on the API endpoints
6. **UI**: Navigate to `/collection/{handle}?type=can-build` and verify:
   - Hero shows correct piece count
   - Filters work (piece range, coverage slider, theme input, minifig toggle)
   - Results grid shows set cards with coverage badges
   - Clicking a card opens detail modal with gap closers
   - Empty states display correctly
   - URL params update as filters change
7. **Edge cases**: Test with a user who has no owned parts, verify empty state message

---

## Summary

| Task | Description                                     | Files            | Est.   |
| ---- | ----------------------------------------------- | ---------------- | ------ |
| 1    | DB migration: trigger + index + flag + backfill | 1 migration      | Short  |
| 2    | Service layer + tests                           | 2 files          | Medium |
| 3    | DB migration: RPC functions                     | 1 migration      | Short  |
| 4    | API route: /api/can-build                       | 1 file           | Short  |
| 5    | API route: /api/can-build/[setNum]/gap          | 1 file           | Short  |
| 6    | TanStack Query hooks                            | 2 files          | Short  |
| 7    | DualRangeSlider component                       | 1 file           | Medium |
| 8    | CanBuildFilters component                       | 1 file           | Medium |
| 9    | CanBuildControlBar component                    | 1 file           | Short  |
| 10   | CanBuildDetailModal component                   | 1 file           | Medium |
| 11   | CanBuildView main component                     | 1 file           | Medium |
| 12   | Integration: wire into collection page          | 3 files modified | Short  |
| 13   | Type-check and lint                             | —                | Short  |
| 14   | Manual testing                                  | —                | Medium |
