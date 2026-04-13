# Admin Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a read-only admin dashboard at `/admin` — gated by a Supabase `app_metadata.role = 'admin'` JWT claim — with a paginated/searchable users list, a per-user detail view that reuses the public collection renderer, and a feedback viewer filtered by category.

**Architecture:** Gate admin access in three layers: layout-level `requireAdmin()` for pages, the same helper in each `/api/admin/*` handler for APIs (404 on fail), and `getSupabaseServiceRoleClient()` for queries that must bypass RLS to read other users' data. List data comes from a new `admin_users_overview` SQL view that pre-aggregates counts and joins `auth.users` + `user_profiles` + latest `billing_subscriptions`. The user detail page extracts the collection-fetching logic currently inlined in `app/collection/[handle]/page.tsx` into a shared `fetchPublicCollectionPayload(userId, client)` helper so the admin page can call it with service role while the public page keeps using the anon client.

**Tech Stack:** TypeScript, React 18, Next.js 15 (App Router), Supabase (Postgres + auth + service role), Vitest + jsdom, Tailwind v4.

**Spec:** [docs/superpowers/specs/2026-04-13-admin-dashboard-design.md](../specs/2026-04-13-admin-dashboard-design.md)

---

## File Structure

**New files:**

- `app/lib/server/requireAdmin.ts` — Gating utility. Reads the Supabase session, checks `user.app_metadata.role === 'admin'`, throws `redirect('/')` otherwise. One exported function.
- `app/lib/server/__tests__/requireAdmin.test.ts` — Unit tests with mocked auth client.
- `supabase/migrations/<timestamp>_admin_users_overview.sql` — Creates `public.admin_users_overview` view (service-role SELECT grant only).
- `app/lib/services/adminUsers.ts` — Service-layer functions: `listAdminUsers({ q, page, pageSize })` and `getAdminUserDetail(userId)`. Queries the view + `auth.admin.getUserById()` + `billing_subscriptions`.
- `app/lib/services/__tests__/adminUsers.test.ts` — Unit tests for shape/filter/pagination.
- `app/lib/services/publicCollection.ts` — Extracted `fetchPublicCollectionPayload(userId, supabase)` that returns `{ allSets, allMinifigs, allParts, lists }`. Used by both the public page and admin detail.
- `app/lib/services/__tests__/publicCollection.test.ts` — Regression tests for the extraction.
- `app/lib/services/adminFeedback.ts` — `listAdminFeedback({ category, page, pageSize })`.
- `app/lib/services/__tests__/adminFeedback.test.ts` — Unit tests.
- `app/api/admin/users/route.ts` — `GET /api/admin/users?q=&page=&pageSize=`.
- `app/api/admin/users/__tests__/route.test.ts` — Auth + shape tests.
- `app/api/admin/users/[userId]/route.ts` — `GET /api/admin/users/[userId]`.
- `app/api/admin/users/[userId]/__tests__/route.test.ts` — Auth + shape tests.
- `app/api/admin/feedback/route.ts` — `GET /api/admin/feedback?category=&page=`.
- `app/api/admin/feedback/__tests__/route.test.ts` — Auth + filter tests.
- `app/admin/layout.tsx` — Calls `requireAdmin()`; renders `<AdminShell>`.
- `app/admin/page.tsx` — Redirects to `/admin/users`.
- `app/admin/users/page.tsx` — SSR list view; hydrates `<UsersListClient>`.
- `app/admin/users/UsersListClient.tsx` — Client component: search input, paginated table, navigates to detail.
- `app/admin/users/[userId]/page.tsx` — SSR detail view; renders `<AdminUserHero>` + `<PublicUserCollectionOverview>`.
- `app/admin/users/[userId]/AdminUserHero.tsx` — Admin-only header card (identity, subscription, counts).
- `app/admin/feedback/page.tsx` — SSR feedback view; hydrates `<FeedbackListClient>`.
- `app/admin/feedback/FeedbackListClient.tsx` — Category tabs + list.
- `app/components/admin/AdminShell.tsx` — Sidebar nav (Users, Feedback) + main region.

**Modified files:**

- `app/collection/[handle]/page.tsx` — Replace inline collection-fetching block (lines 259–556) with a call to `fetchPublicCollectionPayload()`.
- `supabase/types.ts` — Regenerated via `npm run generate-types` after the view migration lands (so the new view is typed).

**Unchanged:** `PublicUserCollectionOverview.tsx`, public set/minifig card components, all existing API routes.

---

## Task 1: Add `requireAdmin()` gating utility

**Files:**

- Create: `app/lib/server/requireAdmin.ts`
- Create: `app/lib/server/__tests__/requireAdmin.test.ts`

- [ ] **Step 1: Write the failing test**

Create `app/lib/server/__tests__/requireAdmin.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest';

const redirectMock = vi.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT:${url}`);
});

vi.mock('next/navigation', () => ({
  redirect: (url: string) => redirectMock(url),
}));

const getUserMock = vi.fn();

vi.mock('@/app/lib/supabaseAuthServerClient', () => ({
  getSupabaseAuthServerClient: async () => ({
    auth: { getUser: getUserMock },
  }),
}));

import { requireAdmin } from '@/app/lib/server/requireAdmin';

describe('requireAdmin', () => {
  beforeEach(() => {
    redirectMock.mockClear();
    getUserMock.mockReset();
  });

  it('redirects to / when no user is signed in', async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });

    await expect(requireAdmin()).rejects.toThrow('NEXT_REDIRECT:/');
    expect(redirectMock).toHaveBeenCalledWith('/');
  });

  it('redirects to / when signed-in user is not an admin', async () => {
    getUserMock.mockResolvedValue({
      data: {
        user: {
          id: 'u1',
          email: 'user@example.com',
          app_metadata: { role: 'user' },
        },
      },
    });

    await expect(requireAdmin()).rejects.toThrow('NEXT_REDIRECT:/');
  });

  it('returns the user when role=admin', async () => {
    const user = {
      id: 'u1',
      email: 'admin@example.com',
      app_metadata: { role: 'admin' },
    };
    getUserMock.mockResolvedValue({ data: { user } });

    const result = await requireAdmin();

    expect(result).toEqual(user);
    expect(redirectMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run app/lib/server/__tests__/requireAdmin.test.ts`
Expected: FAIL — `Cannot find module '@/app/lib/server/requireAdmin'` or similar.

- [ ] **Step 3: Write minimal implementation**

Create `app/lib/server/requireAdmin.ts`:

```ts
import 'server-only';

import { redirect } from 'next/navigation';
import type { User } from '@supabase/supabase-js';

import { getSupabaseAuthServerClient } from '@/app/lib/supabaseAuthServerClient';

export async function requireAdmin(): Promise<User> {
  const supabase = await getSupabaseAuthServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.app_metadata?.role !== 'admin') {
    redirect('/');
  }

  return user;
}

export function isAdmin(user: User | null | undefined): boolean {
  return user?.app_metadata?.role === 'admin';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run app/lib/server/__tests__/requireAdmin.test.ts`
Expected: PASS (3/3).

- [ ] **Step 5: Commit**

```bash
git add app/lib/server/requireAdmin.ts app/lib/server/__tests__/requireAdmin.test.ts
git commit -m "add requireAdmin gating utility for /admin routes"
```

---

## Task 2: Create `admin_users_overview` SQL view migration

**Files:**

- Create: `supabase/migrations/<timestamp>_admin_users_overview.sql` (timestamp generated by CLI)
- Modify (generated): `supabase/types.ts`

- [ ] **Step 1: Generate migration file**

Run: `npx supabase migration new admin_users_overview`
Expected: creates an empty migration file under `supabase/migrations/` with a current timestamp.

- [ ] **Step 2: Write the migration SQL**

Edit the newly created file so it contains:

```sql
-- Admin-only overview of all users: joins auth.users + user_profiles + aggregated counts
-- + latest non-canceled billing_subscriptions row. Service-role SELECT only; no grants
-- to anon or authenticated.

create or replace view public.admin_users_overview as
with owned_counts as (
  select user_id, count(*)::int as owned_set_count
  from public.user_sets
  where status = 'owned'
  group by user_id
),
tracked_counts as (
  select user_id, count(*)::int as tracked_set_count
  from public.user_sets
  where status = 'want'
  group by user_id
),
list_counts as (
  select user_id, count(*)::int as list_count
  from public.user_lists
  where is_system = false
  group by user_id
),
latest_sub as (
  select distinct on (user_id)
    user_id,
    tier,
    status,
    current_period_end,
    cancel_at_period_end
  from public.billing_subscriptions
  where status <> 'canceled'
  order by user_id, created_at desc
)
select
  u.id as user_id,
  u.email,
  u.created_at,
  u.last_sign_in_at,
  p.username,
  p.display_name,
  coalesce(oc.owned_set_count, 0) as owned_set_count,
  coalesce(tc.tracked_set_count, 0) as tracked_set_count,
  coalesce(lc.list_count, 0) as list_count,
  s.tier as subscription_tier,
  s.status as subscription_status,
  s.current_period_end as subscription_period_end,
  s.cancel_at_period_end as subscription_cancel_at_period_end
from auth.users u
left join public.user_profiles p on p.user_id = u.id
left join owned_counts oc on oc.user_id = u.id
left join tracked_counts tc on tc.user_id = u.id
left join list_counts lc on lc.user_id = u.id
left join latest_sub s on s.user_id = u.id;

-- Revoke default grants; only service_role can select.
revoke all on public.admin_users_overview from public;
revoke all on public.admin_users_overview from anon;
revoke all on public.admin_users_overview from authenticated;
grant select on public.admin_users_overview to service_role;

comment on view public.admin_users_overview is
  'Admin dashboard: per-user identity + aggregated counts + latest subscription. '
  'Service role only — handler-level requireAdmin() gates access.';
```

- [ ] **Step 3: Apply migration locally**

Run: `npx supabase migration up`
Expected: "Applying migration" log with the new timestamp, no errors.

- [ ] **Step 4: Sanity-check the view**

Run:

```bash
npx supabase db remote commit --help >/dev/null 2>&1 # no-op; skip
psql "$(npx supabase status | awk '/DB URL/ {print $3}')" -c 'select count(*) from public.admin_users_overview;'
```

Or, simpler — open Supabase Studio locally and run `select * from public.admin_users_overview limit 5` as the service role. Expected: returns rows (or zero if no seed users).

If the `psql` path isn't available in the dev setup, skip — the service test in Task 3 will exercise the view.

- [ ] **Step 5: Regenerate TypeScript types**

Run: `npm run generate-types`
Expected: `supabase/types.ts` updates to include `admin_users_overview` under `Database['public']['Views']`.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/*_admin_users_overview.sql supabase/types.ts
git commit -m "add admin_users_overview view for admin dashboard"
```

---

## Task 3: Build `adminUsers` service — list query

**Files:**

- Create: `app/lib/services/adminUsers.ts`
- Create: `app/lib/services/__tests__/adminUsers.test.ts`

- [ ] **Step 1: Write the failing test**

Create `app/lib/services/__tests__/adminUsers.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest';

const rangeMock = vi.fn();
const ilikeMock = vi.fn(() => ({ range: rangeMock }));
const orderMock = vi.fn(() => ({ ilike: ilikeMock, range: rangeMock }));
const selectMock = vi.fn(() => ({ order: orderMock }));
const fromMock = vi.fn(() => ({ select: selectMock }));

vi.mock('@/app/lib/supabaseServiceRoleClient', () => ({
  getSupabaseServiceRoleClient: () => ({ from: fromMock }),
}));

import { listAdminUsers } from '@/app/lib/services/adminUsers';

describe('listAdminUsers', () => {
  beforeEach(() => {
    fromMock.mockClear();
    selectMock.mockClear();
    orderMock.mockClear();
    ilikeMock.mockClear();
    rangeMock.mockReset();
  });

  it('queries admin_users_overview with default sort and pagination', async () => {
    rangeMock.mockResolvedValue({
      data: [
        {
          user_id: 'u1',
          email: 'a@example.com',
          username: 'alice',
          display_name: 'Alice',
          created_at: '2026-01-01T00:00:00Z',
          last_sign_in_at: '2026-04-10T00:00:00Z',
          owned_set_count: 3,
          tracked_set_count: 1,
          list_count: 2,
          subscription_tier: 'plus',
          subscription_status: 'active',
          subscription_period_end: null,
          subscription_cancel_at_period_end: false,
        },
      ],
      count: 42,
      error: null,
    });

    const result = await listAdminUsers({ page: 0, pageSize: 25 });

    expect(fromMock).toHaveBeenCalledWith('admin_users_overview');
    expect(selectMock).toHaveBeenCalledWith('*', { count: 'exact' });
    expect(orderMock).toHaveBeenCalledWith('last_sign_in_at', {
      ascending: false,
      nullsFirst: false,
    });
    expect(rangeMock).toHaveBeenCalledWith(0, 24);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].username).toBe('alice');
    expect(result.total).toBe(42);
  });

  it('applies an ilike filter when q is provided', async () => {
    rangeMock.mockResolvedValue({ data: [], count: 0, error: null });

    await listAdminUsers({ q: 'bob', page: 1, pageSize: 25 });

    expect(ilikeMock).toHaveBeenCalledWith('username', 'bob%');
    expect(rangeMock).toHaveBeenCalledWith(25, 49);
  });

  it('returns empty result on error', async () => {
    rangeMock.mockResolvedValue({
      data: null,
      count: null,
      error: { message: 'boom' },
    });

    const result = await listAdminUsers({ page: 0, pageSize: 25 });

    expect(result).toEqual({ rows: [], total: 0, page: 0, pageSize: 25 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run app/lib/services/__tests__/adminUsers.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `app/lib/services/adminUsers.ts`:

```ts
import 'server-only';

import type { Tables } from '@/supabase/types';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabaseServiceRoleClient';
import { logger } from '@/lib/metrics';

export type AdminUserRow = {
  user_id: string;
  email: string | null;
  username: string | null;
  display_name: string | null;
  created_at: string | null;
  last_sign_in_at: string | null;
  owned_set_count: number;
  tracked_set_count: number;
  list_count: number;
  subscription_tier: string | null;
  subscription_status: string | null;
  subscription_period_end: string | null;
  subscription_cancel_at_period_end: boolean | null;
};

export type ListAdminUsersArgs = {
  q?: string;
  page: number;
  pageSize: number;
};

export type ListAdminUsersResult = {
  rows: AdminUserRow[];
  total: number;
  page: number;
  pageSize: number;
};

export async function listAdminUsers({
  q,
  page,
  pageSize,
}: ListAdminUsersArgs): Promise<ListAdminUsersResult> {
  const supabase = getSupabaseServiceRoleClient();
  const from = page * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('admin_users_overview')
    .select('*', { count: 'exact' })
    .order('last_sign_in_at', { ascending: false, nullsFirst: false });

  if (q && q.trim()) {
    const safe = q.trim().replace(/[%_]/g, '\\$&');
    query = query.ilike('username', `${safe}%`);
  }

  const { data, count, error } = await query.range(from, to);

  if (error) {
    logger.warn('adminUsers.list_failed', { message: error.message });
    return { rows: [], total: 0, page, pageSize };
  }

  return {
    rows: (data ?? []) as AdminUserRow[],
    total: count ?? 0,
    page,
    pageSize,
  };
}

// Re-export Tables for future use by detail function in Task 5.
export type BillingSubscriptionRow = Tables<'billing_subscriptions'>;
```

> If `logger` is not already a warn-capable API in this repo, fall back to `console.warn`. Check `@/lib/metrics` first — the grep in Task 0 showed `logger` is used extensively.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run app/lib/services/__tests__/adminUsers.test.ts`
Expected: PASS (3/3).

- [ ] **Step 5: Commit**

```bash
git add app/lib/services/adminUsers.ts app/lib/services/__tests__/adminUsers.test.ts
git commit -m "add adminUsers.listAdminUsers service"
```

---

## Task 4: Expose `GET /api/admin/users`

**Files:**

- Create: `app/api/admin/users/route.ts`
- Create: `app/api/admin/users/__tests__/route.test.ts`

- [ ] **Step 1: Write the failing test**

Create `app/api/admin/users/__tests__/route.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const redirectMock = vi.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT:${url}`);
});

vi.mock('next/navigation', () => ({
  redirect: (url: string) => redirectMock(url),
}));

const getUserMock = vi.fn();
vi.mock('@/app/lib/supabaseAuthServerClient', () => ({
  getSupabaseAuthServerClient: async () => ({
    auth: { getUser: getUserMock },
  }),
}));

const listAdminUsersMock = vi.fn();
vi.mock('@/app/lib/services/adminUsers', () => ({
  listAdminUsers: listAdminUsersMock,
}));

import { GET } from '@/app/api/admin/users/route';

function makeReq(url: string) {
  return new NextRequest(new URL(url, 'http://localhost'));
}

describe('GET /api/admin/users', () => {
  beforeEach(() => {
    redirectMock.mockClear();
    getUserMock.mockReset();
    listAdminUsersMock.mockReset();
  });

  it('returns 404 when caller is not admin', async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });

    const res = await GET(makeReq('http://localhost/api/admin/users'));

    expect(res.status).toBe(404);
    expect(listAdminUsersMock).not.toHaveBeenCalled();
  });

  it('returns rows when caller is admin', async () => {
    getUserMock.mockResolvedValue({
      data: {
        user: { id: 'a1', app_metadata: { role: 'admin' } },
      },
    });
    listAdminUsersMock.mockResolvedValue({
      rows: [{ user_id: 'u1', username: 'alice' }],
      total: 1,
      page: 0,
      pageSize: 25,
    });

    const res = await GET(
      makeReq('http://localhost/api/admin/users?q=ali&page=0&pageSize=25')
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(1);
    expect(body.rows[0].username).toBe('alice');
    expect(listAdminUsersMock).toHaveBeenCalledWith({
      q: 'ali',
      page: 0,
      pageSize: 25,
    });
  });

  it('clamps pageSize to 50', async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: 'a1', app_metadata: { role: 'admin' } } },
    });
    listAdminUsersMock.mockResolvedValue({
      rows: [],
      total: 0,
      page: 0,
      pageSize: 50,
    });

    await GET(makeReq('http://localhost/api/admin/users?pageSize=500'));

    expect(listAdminUsersMock).toHaveBeenCalledWith(
      expect.objectContaining({ pageSize: 50 })
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run app/api/admin/users/__tests__/route.test.ts`
Expected: FAIL — route not found.

- [ ] **Step 3: Write minimal implementation**

Create `app/api/admin/users/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';

import { isAdmin } from '@/app/lib/server/requireAdmin';
import { getSupabaseAuthServerClient } from '@/app/lib/supabaseAuthServerClient';
import { listAdminUsers } from '@/app/lib/services/adminUsers';

const MAX_PAGE_SIZE = 50;
const DEFAULT_PAGE_SIZE = 25;

export async function GET(req: NextRequest) {
  const supabase = await getSupabaseAuthServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!isAdmin(user)) {
    return new NextResponse(null, { status: 404 });
  }

  const url = new URL(req.url);
  const q = url.searchParams.get('q') ?? undefined;
  const pageRaw = Number(url.searchParams.get('page') ?? '0');
  const sizeRaw = Number(url.searchParams.get('pageSize') ?? DEFAULT_PAGE_SIZE);

  const page =
    Number.isFinite(pageRaw) && pageRaw >= 0 ? Math.floor(pageRaw) : 0;
  const pageSize = Number.isFinite(sizeRaw)
    ? Math.min(Math.max(1, Math.floor(sizeRaw)), MAX_PAGE_SIZE)
    : DEFAULT_PAGE_SIZE;

  const result = await listAdminUsers({ q, page, pageSize });
  return NextResponse.json(result);
}
```

Note: we don't call `requireAdmin()` here because APIs must 404, not redirect. `isAdmin(user)` is the right helper.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run app/api/admin/users/__tests__/route.test.ts`
Expected: PASS (3/3).

- [ ] **Step 5: Commit**

```bash
git add app/api/admin/users/route.ts app/api/admin/users/__tests__/route.test.ts
git commit -m "add GET /api/admin/users"
```

---

## Task 5: Extract `fetchPublicCollectionPayload` helper

**Files:**

- Create: `app/lib/services/publicCollection.ts`
- Create: `app/lib/services/__tests__/publicCollection.test.ts`
- Modify: `app/collection/[handle]/page.tsx`

- [ ] **Step 1: Read existing logic**

Read `app/collection/[handle]/page.tsx` lines 259–557. This is the block that:

1. Queries `public_user_sets_view`, `public_user_lists_view`, `public_user_list_items_view`, `public_user_minifigs_view`
2. Builds lists membership + owned/wishlist set nums
3. Fetches `rb_sets`, `rb_minifigs`, `rb_minifig_images`, `rb_colors`, `rb_parts` for metadata
4. Queries `user_parts_inventory` for public parts
5. Returns arrays: `allSets`, `allMinifigs`, `allPublicParts`, `publicLists`

This is what we're extracting into a single helper.

- [ ] **Step 2: Write the failing test**

Create `app/lib/services/__tests__/publicCollection.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';

import { fetchPublicCollectionPayload } from '@/app/lib/services/publicCollection';

// Integration-flavored unit test: verifies the shape of the returned payload
// given a mocked Supabase client. This test exists primarily to pin the
// contract so both /collection/[handle] and /admin/users/[userId] stay in sync.

function makeClient(overrides: Record<string, unknown> = {}) {
  const defaultResult = { data: [], error: null };
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    in: vi.fn(() => chain),
    order: vi.fn(() => chain),
    then: (resolve: (v: typeof defaultResult) => void) =>
      Promise.resolve(overrides.result ?? defaultResult).then(resolve),
  };
  return { from: vi.fn(() => chain) };
}

describe('fetchPublicCollectionPayload', () => {
  it('returns arrays even when the user has no data', async () => {
    const supabase = makeClient();
    const catalogClient = makeClient();

    const result = await fetchPublicCollectionPayload('u1', {
      supabase: supabase as never,
      catalogClient: catalogClient as never,
    });

    expect(result).toEqual({
      allSets: [],
      allMinifigs: [],
      allParts: [],
      lists: [],
    });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- --run app/lib/services/__tests__/publicCollection.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement the helper by moving existing logic**

Create `app/lib/services/publicCollection.ts`. Copy the full block from `app/collection/[handle]/page.tsx` lines 259–556 (the section starting with the four `Promise.all` queries through the end of the `allPublicParts` mapping). Wrap it in a function with this signature:

```ts
import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/supabase/types';

import { getCatalogReadClient } from '@/app/lib/db/catalogAccess';
import { getSupabaseServerClient } from '@/app/lib/supabaseServerClient';

export type PublicSetSummary = {
  set_num: string;
  name: string;
  year: number | null;
  image_url: string | null;
  num_parts: number | null;
  theme_id: number | null;
  owned: boolean;
};

export type PublicMinifigSummary = {
  fig_num: string;
  name: string | null;
  num_parts: number | null;
  status: 'owned' | 'want' | null;
  image_url: string | null;
  bl_id: string | null;
  year: number | null;
  categoryId: number | null;
  categoryName: string | null;
};

export type PublicPartSummary = {
  partNum: string;
  colorId: number;
  quantity: number;
  partName: string;
  colorName: string;
  imageUrl: string | null;
  parentCategory: string | null;
};

export type PublicListSummary = {
  id: string;
  name: string;
  setNums: string[];
  minifigIds: string[];
};

export type PublicCollectionPayload = {
  allSets: PublicSetSummary[];
  allMinifigs: PublicMinifigSummary[];
  allParts: PublicPartSummary[];
  lists: PublicListSummary[];
};

export type FetchPublicCollectionOptions = {
  /** Client used to read the `public_*_view` tables + `user_parts_inventory`. */
  supabase?: SupabaseClient<Database>;
  /** Client used for catalog (`rb_*`) reads. */
  catalogClient?: SupabaseClient<Database>;
};

export async function fetchPublicCollectionPayload(
  userId: string,
  options: FetchPublicCollectionOptions = {}
): Promise<PublicCollectionPayload> {
  const supabase = options.supabase ?? getSupabaseServerClient();
  const catalogClient = options.catalogClient ?? getCatalogReadClient();

  // ==== BEGIN moved logic from app/collection/[handle]/page.tsx ====
  // (copy the block verbatim — the four Promise.all queries through allPublicParts)
  // Rename the locally scoped `publicProfile.user_id` references to `userId`.
  // Replace references to the outer `supabase` variable (from getSupabaseServerClient)
  // with the local `supabase` arg. Replace `getCatalogReadClient()` calls with
  // the local `catalogClient` arg.
  // ==== END moved logic ====

  return {
    allSets,
    allMinifigs,
    allParts: allPublicParts,
    lists: publicLists,
  };
}
```

The engineer executing this task: **open `app/collection/[handle]/page.tsx` and cut lines 259–556** (the block between `const supabase = getSupabaseServerClient();` and the `return (`). Paste it inside the helper. Rename `publicProfile.user_id` → `userId`. Rename inner `allPublicParts` → still `allPublicParts` (used in return). Keep the `categoryNameById` map and all sub-queries.

- [ ] **Step 5: Update the caller**

Modify `app/collection/[handle]/page.tsx` so the public branch uses the helper:

```ts
// Near the top imports:
import {
  fetchPublicCollectionPayload,
  type PublicSetSummary,
  type PublicMinifigSummary,
  type PublicPartSummary,
  type PublicList,
} from '@/app/lib/services/publicCollection';

// Inside the page, replace the big block (lines 259–556) with:
const payload = await fetchPublicCollectionPayload(publicProfile.user_id);

const allSets = payload.allSets;
const allMinifigs = payload.allMinifigs;
const allPublicParts = payload.allParts;
const publicLists = payload.lists;
```

Delete the now-duplicated local type aliases (`PublicSetSummary` etc. defined at lines 48–86) — import them from the helper instead.

- [ ] **Step 6: Run tests**

Run: `npm test -- --run app/lib/services/__tests__/publicCollection.test.ts`
Expected: PASS.

Run full suite: `npm test -- --run`
Expected: All tests pass (should match the pre-change count).

Run type check: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Manual verification**

Start the dev server (if not already running) and visit a known public collection URL (e.g., your own handle). The page should render identically — same sets, minifigs, parts, lists. No console errors.

- [ ] **Step 8: Commit**

```bash
git add app/lib/services/publicCollection.ts app/lib/services/__tests__/publicCollection.test.ts app/collection/\[handle\]/page.tsx
git commit -m "extract fetchPublicCollectionPayload for reuse by admin dashboard"
```

---

## Task 6: Build `adminUsers.getAdminUserDetail()`

**Files:**

- Modify: `app/lib/services/adminUsers.ts`
- Modify: `app/lib/services/__tests__/adminUsers.test.ts`

- [ ] **Step 1: Add failing detail test**

Append to `app/lib/services/__tests__/adminUsers.test.ts`:

```ts
describe('getAdminUserDetail', () => {
  const getUserByIdMock = vi.fn();
  const subMaybeSingleMock = vi.fn();
  const overviewSingleMock = vi.fn();

  beforeEach(() => {
    getUserByIdMock.mockReset();
    subMaybeSingleMock.mockReset();
    overviewSingleMock.mockReset();

    const billingQuery = {
      select: vi.fn(() => billingQuery),
      eq: vi.fn(() => billingQuery),
      order: vi.fn(() => billingQuery),
      limit: vi.fn(() => billingQuery),
      maybeSingle: subMaybeSingleMock,
    };
    const overviewQuery = {
      select: vi.fn(() => overviewQuery),
      eq: vi.fn(() => overviewQuery),
      maybeSingle: overviewSingleMock,
    };
    const profileQuery = {
      select: vi.fn(() => profileQuery),
      eq: vi.fn(() => profileQuery),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    };

    fromMock.mockImplementation((table: string) => {
      if (table === 'billing_subscriptions') return billingQuery;
      if (table === 'admin_users_overview') return overviewQuery;
      if (table === 'user_profiles') return profileQuery;
      throw new Error(`Unexpected table: ${table}`);
    });

    (
      globalThis as unknown as { __getUserByIdMock: typeof getUserByIdMock }
    ).__getUserByIdMock = getUserByIdMock;
  });

  it('returns auth + profile + subscription + overview', async () => {
    getUserByIdMock.mockResolvedValue({
      data: {
        user: {
          id: 'u1',
          email: 'u@example.com',
          created_at: '2026-01-01',
          last_sign_in_at: '2026-04-10',
          app_metadata: { role: 'user' },
        },
      },
      error: null,
    });
    subMaybeSingleMock.mockResolvedValue({
      data: {
        user_id: 'u1',
        tier: 'plus',
        status: 'active',
        stripe_subscription_id: 'sub_1',
        stripe_price_id: 'price_1',
        current_period_end: '2026-05-01',
        cancel_at_period_end: false,
      },
      error: null,
    });
    overviewSingleMock.mockResolvedValue({
      data: {
        user_id: 'u1',
        username: 'ursula',
        display_name: 'Ursula',
        owned_set_count: 5,
        tracked_set_count: 2,
        list_count: 1,
      },
      error: null,
    });

    const { getAdminUserDetail } = await import(
      '@/app/lib/services/adminUsers'
    );
    const detail = await getAdminUserDetail('u1');

    expect(detail?.authUser.email).toBe('u@example.com');
    expect(detail?.subscription?.tier).toBe('plus');
    expect(detail?.overview?.username).toBe('ursula');
    expect(detail?.overview?.owned_set_count).toBe(5);
  });

  it('returns null when the auth user does not exist', async () => {
    getUserByIdMock.mockResolvedValue({
      data: { user: null },
      error: { message: 'not found' },
    });

    const { getAdminUserDetail } = await import(
      '@/app/lib/services/adminUsers'
    );
    const detail = await getAdminUserDetail('missing');

    expect(detail).toBeNull();
  });
});
```

At the top of the file, extend the mock to expose `auth.admin.getUserById`:

```ts
vi.mock('@/app/lib/supabaseServiceRoleClient', () => ({
  getSupabaseServiceRoleClient: () => ({
    from: fromMock,
    auth: {
      admin: {
        getUserById: (id: string) =>
          (
            globalThis as unknown as {
              __getUserByIdMock: (id: string) => unknown;
            }
          ).__getUserByIdMock(id),
      },
    },
  }),
}));
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- --run app/lib/services/__tests__/adminUsers.test.ts`
Expected: FAIL on the new `getAdminUserDetail` describe.

- [ ] **Step 3: Implement `getAdminUserDetail`**

Append to `app/lib/services/adminUsers.ts`:

```ts
import type { User } from '@supabase/supabase-js';

export type AdminUserDetail = {
  authUser: User;
  overview: AdminUserRow | null;
  subscription: BillingSubscriptionRow | null;
};

export async function getAdminUserDetail(
  userId: string
): Promise<AdminUserDetail | null> {
  const supabase = getSupabaseServiceRoleClient();

  const { data: authData, error: authError } =
    await supabase.auth.admin.getUserById(userId);

  if (authError || !authData?.user) {
    logger.warn('adminUsers.detail_auth_missing', { userId });
    return null;
  }

  const [{ data: overviewRow }, { data: subRow }] = await Promise.all([
    supabase
      .from('admin_users_overview')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle(),
    supabase
      .from('billing_subscriptions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  return {
    authUser: authData.user,
    overview: (overviewRow as AdminUserRow | null) ?? null,
    subscription: (subRow as BillingSubscriptionRow | null) ?? null,
  };
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -- --run app/lib/services/__tests__/adminUsers.test.ts`
Expected: PASS (all cases — list + detail).

- [ ] **Step 5: Commit**

```bash
git add app/lib/services/adminUsers.ts app/lib/services/__tests__/adminUsers.test.ts
git commit -m "add adminUsers.getAdminUserDetail"
```

---

## Task 7: Expose `GET /api/admin/users/[userId]`

**Files:**

- Create: `app/api/admin/users/[userId]/route.ts`
- Create: `app/api/admin/users/[userId]/__tests__/route.test.ts`

- [ ] **Step 1: Write the failing test**

Create `app/api/admin/users/[userId]/__tests__/route.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const getUserMock = vi.fn();
vi.mock('@/app/lib/supabaseAuthServerClient', () => ({
  getSupabaseAuthServerClient: async () => ({
    auth: { getUser: getUserMock },
  }),
}));

const getDetailMock = vi.fn();
vi.mock('@/app/lib/services/adminUsers', () => ({
  getAdminUserDetail: getDetailMock,
}));

import { GET } from '@/app/api/admin/users/[userId]/route';

function makeReq() {
  return new NextRequest(new URL('http://localhost/api/admin/users/u1'));
}

describe('GET /api/admin/users/[userId]', () => {
  beforeEach(() => {
    getUserMock.mockReset();
    getDetailMock.mockReset();
  });

  it('returns 404 when not admin', async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const res = await GET(makeReq(), {
      params: Promise.resolve({ userId: 'u1' }),
    });
    expect(res.status).toBe(404);
    expect(getDetailMock).not.toHaveBeenCalled();
  });

  it('returns 404 when detail is null', async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: 'a1', app_metadata: { role: 'admin' } } },
    });
    getDetailMock.mockResolvedValue(null);

    const res = await GET(makeReq(), {
      params: Promise.resolve({ userId: 'u1' }),
    });
    expect(res.status).toBe(404);
  });

  it('returns detail when admin + target exists', async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: 'a1', app_metadata: { role: 'admin' } } },
    });
    getDetailMock.mockResolvedValue({
      authUser: { id: 'u1', email: 'u@example.com' },
      overview: { username: 'ursula' },
      subscription: null,
    });

    const res = await GET(makeReq(), {
      params: Promise.resolve({ userId: 'u1' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.overview.username).toBe('ursula');
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm test -- --run app/api/admin/users/\[userId\]/__tests__/route.test.ts`
Expected: FAIL — route not found.

- [ ] **Step 3: Implement the route**

Create `app/api/admin/users/[userId]/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';

import { isAdmin } from '@/app/lib/server/requireAdmin';
import { getSupabaseAuthServerClient } from '@/app/lib/supabaseAuthServerClient';
import { getAdminUserDetail } from '@/app/lib/services/adminUsers';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const supabase = await getSupabaseAuthServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!isAdmin(user)) {
    return new NextResponse(null, { status: 404 });
  }

  const { userId } = await params;
  const detail = await getAdminUserDetail(userId);

  if (!detail) {
    return new NextResponse(null, { status: 404 });
  }

  return NextResponse.json(detail);
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -- --run app/api/admin/users/\[userId\]/__tests__/route.test.ts`
Expected: PASS (3/3).

- [ ] **Step 5: Commit**

```bash
git add app/api/admin/users/\[userId\]/route.ts app/api/admin/users/\[userId\]/__tests__/route.test.ts
git commit -m "add GET /api/admin/users/[userId]"
```

---

## Task 8: Build `AdminShell` and `/admin` layout + index redirect

**Files:**

- Create: `app/components/admin/AdminShell.tsx`
- Create: `app/admin/layout.tsx`
- Create: `app/admin/page.tsx`

- [ ] **Step 1: Build `AdminShell`**

Create `app/components/admin/AdminShell.tsx`:

```tsx
import Link from 'next/link';
import type { ReactNode } from 'react';

type NavItem = { label: string; href: string };

const NAV: NavItem[] = [
  { label: 'Users', href: '/admin/users' },
  { label: 'Feedback', href: '/admin/feedback' },
];

export function AdminShell({
  children,
  activeKey,
}: {
  children: ReactNode;
  activeKey: 'users' | 'feedback';
}) {
  return (
    <div className="mx-auto flex w-full max-w-7xl gap-6 px-4 py-8">
      <aside className="w-48 shrink-0">
        <h1 className="mb-4 text-sm font-semibold tracking-wide text-foreground-muted uppercase">
          Admin
        </h1>
        <nav className="flex flex-col gap-1">
          {NAV.map(item => {
            const isActive = item.href.endsWith(activeKey);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={[
                  'rounded-md px-3 py-2 text-sm transition-colors',
                  isActive
                    ? 'bg-card-muted font-medium text-foreground'
                    : 'text-foreground-muted hover:bg-card-muted hover:text-foreground',
                ].join(' ')}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
```

- [ ] **Step 2: Create the layout**

Create `app/admin/layout.tsx`:

```tsx
import type { ReactNode } from 'react';

import { PageLayout } from '@/app/components/layout/PageLayout';
import { requireAdmin } from '@/app/lib/server/requireAdmin';

export const metadata = {
  title: 'Admin | Brick Party',
};

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireAdmin();
  return <PageLayout>{children}</PageLayout>;
}
```

- [ ] **Step 3: Create the index redirect**

Create `app/admin/page.tsx`:

```tsx
import { redirect } from 'next/navigation';

export default function AdminIndexPage() {
  redirect('/admin/users');
}
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Manual verification**

In a browser signed in as a non-admin, visit `/admin`. Expected: redirected to `/`.

(Admin verification happens after Task 9 when there's an actual page to render.)

- [ ] **Step 6: Commit**

```bash
git add app/components/admin/AdminShell.tsx app/admin/layout.tsx app/admin/page.tsx
git commit -m "add /admin layout with requireAdmin gate and nav shell"
```

---

## Task 9: Build `/admin/users` list page

**Files:**

- Create: `app/admin/users/page.tsx`
- Create: `app/admin/users/UsersListClient.tsx`

- [ ] **Step 1: Build the SSR page**

Create `app/admin/users/page.tsx`:

```tsx
import { AdminShell } from '@/app/components/admin/AdminShell';
import { listAdminUsers } from '@/app/lib/services/adminUsers';

import { UsersListClient } from './UsersListClient';

type SearchParams = Record<string, string | string[] | undefined>;

function pickString(params: SearchParams, key: string): string | undefined {
  const raw = params[key];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value && value.length > 0 ? value : undefined;
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const resolved = searchParams ? await searchParams : {};
  const q = pickString(resolved, 'q');
  const pageRaw = Number(pickString(resolved, 'page') ?? '0');
  const page =
    Number.isFinite(pageRaw) && pageRaw >= 0 ? Math.floor(pageRaw) : 0;
  const pageSize = 25;

  const initial = await listAdminUsers({ q, page, pageSize });

  return (
    <AdminShell activeKey="users">
      <UsersListClient initialData={initial} initialQuery={q ?? ''} />
    </AdminShell>
  );
}
```

- [ ] **Step 2: Build the client list component**

Create `app/admin/users/UsersListClient.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, useTransition } from 'react';

import type {
  AdminUserRow,
  ListAdminUsersResult,
} from '@/app/lib/services/adminUsers';

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function UsersListClient({
  initialData,
  initialQuery,
}: {
  initialData: ListAdminUsersResult;
  initialQuery: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [data, setData] = useState(initialData);
  const [isPending, startTransition] = useTransition();
  const [debounced, setDebounced] = useState(initialQuery);

  useEffect(() => {
    const handle = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(handle);
  }, [query]);

  useEffect(() => {
    if (debounced === initialQuery) return;
    const controller = new AbortController();
    const url = new URL('/api/admin/users', window.location.origin);
    if (debounced) url.searchParams.set('q', debounced);
    url.searchParams.set('page', '0');
    url.searchParams.set('pageSize', String(initialData.pageSize));

    fetch(url.toString(), { signal: controller.signal })
      .then(res =>
        res.ok ? res.json() : Promise.reject(new Error(String(res.status)))
      )
      .then((next: ListAdminUsersResult) => setData(next))
      .catch(() => {
        // Search failure — keep existing results rather than wiping the UI.
      });

    return () => controller.abort();
  }, [debounced, initialData.pageSize, initialQuery]);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(data.total / data.pageSize)),
    [data.total, data.pageSize]
  );

  function changePage(newPage: number) {
    startTransition(() => {
      const url = new URL(window.location.href);
      url.searchParams.set('page', String(newPage));
      if (debounced) url.searchParams.set('q', debounced);
      else url.searchParams.delete('q');
      router.push(url.pathname + url.search);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-xl font-semibold">Users ({data.total})</h2>
        <input
          type="search"
          placeholder="Search by username…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          className="w-64 rounded-md border border-subtle bg-background px-3 py-2 text-sm"
        />
      </div>

      <div className="overflow-x-auto rounded-lg border border-subtle">
        <table className="w-full text-sm">
          <thead className="bg-card-muted text-left text-xs tracking-wide text-foreground-muted uppercase">
            <tr>
              <th className="px-3 py-2">User</th>
              <th className="px-3 py-2">Last login</th>
              <th className="px-3 py-2">Tier</th>
              <th className="px-3 py-2 text-right">Owned</th>
              <th className="px-3 py-2 text-right">Tracked</th>
              <th className="px-3 py-2 text-right">Lists</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-3 py-8 text-center text-foreground-muted"
                >
                  {query ? 'No users match that search.' : 'No users yet.'}
                </td>
              </tr>
            ) : (
              data.rows.map((row: AdminUserRow) => (
                <tr
                  key={row.user_id}
                  className="border-t border-subtle hover:bg-card-muted"
                >
                  <td className="px-3 py-2">
                    <Link
                      href={`/admin/users/${row.user_id}`}
                      className="flex flex-col"
                    >
                      <span className="font-medium">
                        {row.display_name ||
                          row.username ||
                          row.email ||
                          row.user_id}
                      </span>
                      <span className="text-xs text-foreground-muted">
                        {row.username ? `@${row.username}` : row.email}
                      </span>
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    {formatDate(row.last_sign_in_at)}
                  </td>
                  <td className="px-3 py-2">
                    {row.subscription_tier ? (
                      <span className="rounded-full bg-card-muted px-2 py-0.5 text-xs">
                        {row.subscription_tier} ·{' '}
                        {row.subscription_status ?? '—'}
                      </span>
                    ) : (
                      <span className="text-foreground-muted">free</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {row.owned_set_count}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {row.tracked_set_count}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {row.list_count}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm">
        <span className="text-foreground-muted">
          Page {data.page + 1} of {totalPages}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={data.page === 0 || isPending}
            onClick={() => changePage(data.page - 1)}
            className="rounded-md border border-subtle px-3 py-1 text-sm disabled:opacity-50"
          >
            Previous
          </button>
          <button
            type="button"
            disabled={data.page + 1 >= totalPages || isPending}
            onClick={() => changePage(data.page + 1)}
            className="rounded-md border border-subtle px-3 py-1 text-sm disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual verification**

1. Set `app_metadata` on your user to `{ "role": "admin" }` via Supabase dashboard (Auth → Users → your row → App Metadata).
2. Sign out and back in (JWT needs to refresh to pick up the new claim).
3. Visit `/admin/users`. Expected: list renders with your user (and any others). Clicking a row should 404 for now (detail page not built until Task 10).
4. Type a partial username in the search box — list should filter within ~250ms.
5. Visit `/admin` — should redirect to `/admin/users`.
6. In another browser signed in as a non-admin, visit `/admin/users` — should redirect to `/`.

- [ ] **Step 5: Commit**

```bash
git add app/admin/users/page.tsx app/admin/users/UsersListClient.tsx
git commit -m "add /admin/users list page with search and pagination"
```

---

## Task 10: Build `/admin/users/[userId]` detail page

**Files:**

- Create: `app/admin/users/[userId]/page.tsx`
- Create: `app/admin/users/[userId]/AdminUserHero.tsx`

- [ ] **Step 1: Build the hero component**

Create `app/admin/users/[userId]/AdminUserHero.tsx`:

```tsx
import Link from 'next/link';
import type { User } from '@supabase/supabase-js';

import { buildUserHandle } from '@/app/lib/users';
import type {
  AdminUserRow,
  BillingSubscriptionRow,
} from '@/app/lib/services/adminUsers';

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString();
}

export function AdminUserHero({
  authUser,
  overview,
  subscription,
}: {
  authUser: User;
  overview: AdminUserRow | null;
  subscription: BillingSubscriptionRow | null;
}) {
  const displayName =
    overview?.display_name ||
    overview?.username ||
    authUser.email ||
    authUser.id;
  const handle = buildUserHandle({
    user_id: authUser.id,
    username: overview?.username ?? null,
  });

  return (
    <section className="mb-6 rounded-lg border border-subtle bg-card p-6">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div className="flex flex-col gap-1">
          <h2 className="text-2xl font-semibold">{displayName}</h2>
          <div className="flex flex-wrap items-center gap-3 text-sm text-foreground-muted">
            {overview?.username && <span>@{overview.username}</span>}
            {authUser.email && <span>{authUser.email}</span>}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs text-foreground-muted">
            <span>Joined {formatDate(authUser.created_at)}</span>
            <span>Last login {formatDate(authUser.last_sign_in_at)}</span>
          </div>
        </div>

        <Link
          href={`/collection/${handle}`}
          className="rounded-md border border-subtle px-3 py-1.5 text-sm hover:bg-card-muted"
        >
          View public collection ↗
        </Link>
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Owned sets" value={overview?.owned_set_count ?? 0} />
        <Stat label="Tracked sets" value={overview?.tracked_set_count ?? 0} />
        <Stat label="Lists" value={overview?.list_count ?? 0} />
        <Stat
          label="Tier"
          value={
            subscription?.tier
              ? `${subscription.tier} · ${subscription.status}`
              : 'free'
          }
        />
      </dl>

      {subscription && (
        <dl className="mt-4 grid grid-cols-2 gap-4 border-t border-subtle pt-4 text-xs sm:grid-cols-3">
          <KV
            label="Stripe customer"
            value={subscription.stripe_subscription_id ?? '—'}
          />
          <KV
            label="Period ends"
            value={formatDate(subscription.current_period_end)}
          />
          <KV
            label="Cancels at period end"
            value={subscription.cancel_at_period_end ? 'yes' : 'no'}
          />
        </dl>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-xs tracking-wide text-foreground-muted uppercase">
        {label}
      </dt>
      <dd className="text-xl font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-foreground-muted">{label}</dt>
      <dd className="font-mono">{value}</dd>
    </div>
  );
}
```

- [ ] **Step 2: Build the page**

Create `app/admin/users/[userId]/page.tsx`:

```tsx
import { notFound } from 'next/navigation';

import { AdminShell } from '@/app/components/admin/AdminShell';
import { PublicUserCollectionOverview } from '@/app/components/user/PublicUserCollectionOverview';
import { getAdminUserDetail } from '@/app/lib/services/adminUsers';
import { fetchPublicCollectionPayload } from '@/app/lib/services/publicCollection';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabaseServiceRoleClient';
import { fetchThemes } from '@/app/lib/services/themes';

import { AdminUserHero } from './AdminUserHero';

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  const detail = await getAdminUserDetail(userId);

  if (!detail) {
    notFound();
  }

  const serviceClient = getSupabaseServiceRoleClient();
  const [payload, themes] = await Promise.all([
    fetchPublicCollectionPayload(userId, {
      supabase: serviceClient,
      catalogClient: serviceClient,
    }),
    fetchThemes().catch(() => []),
  ]);

  return (
    <AdminShell activeKey="users">
      <AdminUserHero
        authUser={detail.authUser}
        overview={detail.overview}
        subscription={detail.subscription}
      />
      <PublicUserCollectionOverview
        allSets={payload.allSets}
        allMinifigs={payload.allMinifigs}
        allParts={payload.allParts}
        lists={payload.lists}
        initialThemes={themes}
        initialView="all"
        initialType="sets"
      />
    </AdminShell>
  );
}
```

Note: the service role client also has SELECT access to the `public_*_view` tables used by `fetchPublicCollectionPayload` — service role bypasses RLS, so privacy flags on `user_profiles` don't block the read. This is intentional for admin.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors. If `PublicUserCollectionOverview`'s prop types differ from the new helper's exported types, adjust the helper's types to match (check `app/components/user/PublicUserCollectionOverview.tsx` top of file).

- [ ] **Step 4: Manual verification**

1. Signed in as admin, visit `/admin/users` and click a user.
2. Expected: detail page loads with `AdminUserHero` showing name/email/counts, plus the full public-collection grid (sets/minifigs/parts tabs, filters).
3. "View public collection" link navigates to `/collection/<handle>`.
4. Try a user with no data — empty grid renders without errors.
5. Visit `/admin/users/not-a-real-uuid` — 404.

- [ ] **Step 5: Commit**

```bash
git add app/admin/users/\[userId\]/page.tsx app/admin/users/\[userId\]/AdminUserHero.tsx
git commit -m "add /admin/users/[userId] detail page with hero + collection reuse"
```

---

## Task 11: Build `adminFeedback` service + `/api/admin/feedback`

**Files:**

- Create: `app/lib/services/adminFeedback.ts`
- Create: `app/lib/services/__tests__/adminFeedback.test.ts`
- Create: `app/api/admin/feedback/route.ts`
- Create: `app/api/admin/feedback/__tests__/route.test.ts`

- [ ] **Step 1: Write the service test**

Create `app/lib/services/__tests__/adminFeedback.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest';

const rangeMock = vi.fn();
const eqMock = vi.fn(() => ({ range: rangeMock }));
const orderMock = vi.fn(() => ({ eq: eqMock, range: rangeMock }));
const selectMock = vi.fn(() => ({ order: orderMock }));
const fromMock = vi.fn(() => ({ select: selectMock }));

vi.mock('@/app/lib/supabaseServiceRoleClient', () => ({
  getSupabaseServiceRoleClient: () => ({ from: fromMock }),
}));

import { listAdminFeedback } from '@/app/lib/services/adminFeedback';

describe('listAdminFeedback', () => {
  beforeEach(() => {
    fromMock.mockClear();
    selectMock.mockClear();
    orderMock.mockClear();
    eqMock.mockClear();
    rangeMock.mockReset();
  });

  it('queries user_feedback ordered by created_at desc', async () => {
    rangeMock.mockResolvedValue({ data: [], count: 0, error: null });

    await listAdminFeedback({ page: 0, pageSize: 50 });

    expect(fromMock).toHaveBeenCalledWith('user_feedback');
    expect(orderMock).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(rangeMock).toHaveBeenCalledWith(0, 49);
    expect(eqMock).not.toHaveBeenCalled();
  });

  it('applies a category filter', async () => {
    rangeMock.mockResolvedValue({ data: [], count: 0, error: null });

    await listAdminFeedback({ category: 'bug', page: 0, pageSize: 50 });

    expect(eqMock).toHaveBeenCalledWith('category', 'bug');
  });

  it('rejects invalid categories', async () => {
    await expect(
      listAdminFeedback({
        category: 'not_a_category' as never,
        page: 0,
        pageSize: 50,
      })
    ).resolves.toEqual({
      rows: [],
      total: 0,
      page: 0,
      pageSize: 50,
    });
    expect(eqMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm test -- --run app/lib/services/__tests__/adminFeedback.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the service**

Create `app/lib/services/adminFeedback.ts`:

```ts
import 'server-only';

import type { Tables } from '@/supabase/types';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabaseServiceRoleClient';
import { logger } from '@/lib/metrics';

export const FEEDBACK_CATEGORIES = [
  'bug',
  'feature_request',
  'question',
  'general',
] as const;

export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];

export type AdminFeedbackRow = Tables<'user_feedback'>;

export type ListAdminFeedbackArgs = {
  category?: FeedbackCategory;
  page: number;
  pageSize: number;
};

export type ListAdminFeedbackResult = {
  rows: AdminFeedbackRow[];
  total: number;
  page: number;
  pageSize: number;
};

export function isFeedbackCategory(value: unknown): value is FeedbackCategory {
  return (
    typeof value === 'string' &&
    (FEEDBACK_CATEGORIES as readonly string[]).includes(value)
  );
}

export async function listAdminFeedback({
  category,
  page,
  pageSize,
}: ListAdminFeedbackArgs): Promise<ListAdminFeedbackResult> {
  if (category && !isFeedbackCategory(category)) {
    return { rows: [], total: 0, page, pageSize };
  }

  const supabase = getSupabaseServiceRoleClient();
  const from = page * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('user_feedback')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false });

  if (category) {
    query = query.eq('category', category);
  }

  const { data, count, error } = await query.range(from, to);

  if (error) {
    logger.warn('adminFeedback.list_failed', { message: error.message });
    return { rows: [], total: 0, page, pageSize };
  }

  return {
    rows: (data ?? []) as AdminFeedbackRow[],
    total: count ?? 0,
    page,
    pageSize,
  };
}
```

- [ ] **Step 4: Run service tests**

Run: `npm test -- --run app/lib/services/__tests__/adminFeedback.test.ts`
Expected: PASS (3/3).

- [ ] **Step 5: Write the route test**

Create `app/api/admin/feedback/__tests__/route.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const getUserMock = vi.fn();
vi.mock('@/app/lib/supabaseAuthServerClient', () => ({
  getSupabaseAuthServerClient: async () => ({
    auth: { getUser: getUserMock },
  }),
}));

const listMock = vi.fn();
vi.mock('@/app/lib/services/adminFeedback', async () => {
  const real = await vi.importActual<
    typeof import('@/app/lib/services/adminFeedback')
  >('@/app/lib/services/adminFeedback');
  return { ...real, listAdminFeedback: listMock };
});

import { GET } from '@/app/api/admin/feedback/route';

function makeReq(search = '') {
  return new NextRequest(
    new URL(`http://localhost/api/admin/feedback${search}`)
  );
}

describe('GET /api/admin/feedback', () => {
  beforeEach(() => {
    getUserMock.mockReset();
    listMock.mockReset();
  });

  it('returns 404 when caller is not admin', async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const res = await GET(makeReq());
    expect(res.status).toBe(404);
    expect(listMock).not.toHaveBeenCalled();
  });

  it('passes a valid category through', async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: 'a1', app_metadata: { role: 'admin' } } },
    });
    listMock.mockResolvedValue({ rows: [], total: 0, page: 0, pageSize: 50 });

    await GET(makeReq('?category=bug'));

    expect(listMock).toHaveBeenCalledWith({
      category: 'bug',
      page: 0,
      pageSize: 50,
    });
  });

  it('drops invalid categories', async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: 'a1', app_metadata: { role: 'admin' } } },
    });
    listMock.mockResolvedValue({ rows: [], total: 0, page: 0, pageSize: 50 });

    await GET(makeReq('?category=xxx'));

    expect(listMock).toHaveBeenCalledWith({
      category: undefined,
      page: 0,
      pageSize: 50,
    });
  });
});
```

- [ ] **Step 6: Implement the route**

Create `app/api/admin/feedback/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';

import { isAdmin } from '@/app/lib/server/requireAdmin';
import { getSupabaseAuthServerClient } from '@/app/lib/supabaseAuthServerClient';
import {
  isFeedbackCategory,
  listAdminFeedback,
} from '@/app/lib/services/adminFeedback';

const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 50;

export async function GET(req: NextRequest) {
  const supabase = await getSupabaseAuthServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!isAdmin(user)) {
    return new NextResponse(null, { status: 404 });
  }

  const url = new URL(req.url);
  const rawCategory = url.searchParams.get('category');
  const category = isFeedbackCategory(rawCategory) ? rawCategory : undefined;

  const pageRaw = Number(url.searchParams.get('page') ?? '0');
  const sizeRaw = Number(url.searchParams.get('pageSize') ?? DEFAULT_PAGE_SIZE);
  const page =
    Number.isFinite(pageRaw) && pageRaw >= 0 ? Math.floor(pageRaw) : 0;
  const pageSize = Number.isFinite(sizeRaw)
    ? Math.min(Math.max(1, Math.floor(sizeRaw)), MAX_PAGE_SIZE)
    : DEFAULT_PAGE_SIZE;

  const result = await listAdminFeedback({ category, page, pageSize });
  return NextResponse.json(result);
}
```

- [ ] **Step 7: Run route tests**

Run: `npm test -- --run app/api/admin/feedback/__tests__/route.test.ts`
Expected: PASS (3/3).

- [ ] **Step 8: Commit**

```bash
git add app/lib/services/adminFeedback.ts app/lib/services/__tests__/adminFeedback.test.ts app/api/admin/feedback/route.ts app/api/admin/feedback/__tests__/route.test.ts
git commit -m "add adminFeedback service and GET /api/admin/feedback"
```

---

## Task 12: Build `/admin/feedback` page with category tabs

**Files:**

- Create: `app/admin/feedback/page.tsx`
- Create: `app/admin/feedback/FeedbackListClient.tsx`

- [ ] **Step 1: Build the SSR page**

Create `app/admin/feedback/page.tsx`:

```tsx
import { AdminShell } from '@/app/components/admin/AdminShell';
import {
  isFeedbackCategory,
  listAdminFeedback,
  type FeedbackCategory,
} from '@/app/lib/services/adminFeedback';

import { FeedbackListClient } from './FeedbackListClient';

type SearchParams = Record<string, string | string[] | undefined>;

function pickString(params: SearchParams, key: string): string | undefined {
  const raw = params[key];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value && value.length > 0 ? value : undefined;
}

export default async function AdminFeedbackPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const resolved = searchParams ? await searchParams : {};
  const categoryParam = pickString(resolved, 'category');
  const category: FeedbackCategory | undefined = isFeedbackCategory(
    categoryParam
  )
    ? categoryParam
    : undefined;

  const initial = await listAdminFeedback({
    category,
    page: 0,
    pageSize: 50,
  });

  return (
    <AdminShell activeKey="feedback">
      <FeedbackListClient
        initialData={initial}
        initialCategory={category ?? null}
      />
    </AdminShell>
  );
}
```

- [ ] **Step 2: Build the client component**

Create `app/admin/feedback/FeedbackListClient.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';

import {
  FEEDBACK_CATEGORIES,
  type FeedbackCategory,
  type ListAdminFeedbackResult,
} from '@/app/lib/services/adminFeedback';

const TABS: Array<{ label: string; value: FeedbackCategory | null }> = [
  { label: 'All', value: null },
  { label: 'Bugs', value: 'bug' },
  { label: 'Feature requests', value: 'feature_request' },
  { label: 'Questions', value: 'question' },
  { label: 'General', value: 'general' },
];

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString();
}

export function FeedbackListClient({
  initialData,
  initialCategory,
}: {
  initialData: ListAdminFeedbackResult;
  initialCategory: FeedbackCategory | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function selectTab(value: FeedbackCategory | null) {
    startTransition(() => {
      const params = new URLSearchParams(searchParams?.toString() ?? '');
      if (value) params.set('category', value);
      else params.delete('category');
      const qs = params.toString();
      router.push(`/admin/feedback${qs ? `?${qs}` : ''}`);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold">Feedback ({initialData.total})</h2>

      <nav className="flex flex-wrap gap-1 border-b border-subtle">
        {TABS.map(tab => {
          const active = (initialCategory ?? null) === tab.value;
          return (
            <button
              key={tab.value ?? 'all'}
              type="button"
              disabled={isPending}
              onClick={() => selectTab(tab.value)}
              className={[
                '-mb-px border-b-2 px-3 py-2 text-sm transition-colors',
                active
                  ? 'border-foreground font-medium text-foreground'
                  : 'border-transparent text-foreground-muted hover:text-foreground',
              ].join(' ')}
            >
              {tab.label}
            </button>
          );
        })}
      </nav>

      {initialData.rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-foreground-muted">
          No feedback in this category.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {initialData.rows.map(row => (
            <li
              key={row.id}
              className="rounded-lg border border-subtle bg-card p-4"
            >
              <header className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-foreground-muted">
                <div className="flex items-center gap-2">
                  <Link
                    href={`/admin/users/${row.user_id}`}
                    className="font-medium text-foreground hover:underline"
                  >
                    {row.name || row.email}
                  </Link>
                  <span>·</span>
                  <span>{row.email}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-card-muted px-2 py-0.5">
                    {row.category}
                  </span>
                  <span>{formatDate(row.created_at)}</span>
                </div>
              </header>
              <p className="text-sm whitespace-pre-wrap">{row.message}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Ensure FEEDBACK_CATEGORIES is referenced so tree-shaking doesn't drop it.
void FEEDBACK_CATEGORIES;
```

> The trailing `void FEEDBACK_CATEGORIES` is only there if the import flags unused — remove if ESLint allows unused re-exports in this project. Check after tsc.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

If `FEEDBACK_CATEGORIES` import is unused, simply remove the import. Tabs hard-code their values to match the DB check constraint.

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: clean (or fix whatever it reports).

- [ ] **Step 5: Manual verification**

1. Signed in as admin, visit `/admin/feedback`.
2. Submit a test feedback via the normal in-app feedback form (or insert a row via SQL) in each category.
3. Click each tab — list filters accordingly. "All" shows everything.
4. Click a submitter name — lands on their admin detail page.
5. Visit `/admin/feedback` signed out — redirects to `/`.

- [ ] **Step 6: Commit**

```bash
git add app/admin/feedback/page.tsx app/admin/feedback/FeedbackListClient.tsx
git commit -m "add /admin/feedback page with category tabs"
```

---

## Task 13: Final verification + rollout checklist

**Files:** (none new)

- [ ] **Step 1: Run the full test suite**

Run: `npm test -- --run`
Expected: all tests pass; count is up by the new admin tests (around 10–15 new).

- [ ] **Step 2: Type-check + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean.

- [ ] **Step 3: Manual smoke test (signed in as admin)**

- Visit `/admin` → redirected to `/admin/users`.
- List shows users sorted by last login desc. Search narrows by username.
- Click a user with data → detail page renders hero + collection grid. "View public collection" link works.
- Click a user with no data → detail page renders empty grid without errors.
- Visit `/admin/feedback` → tabs filter correctly, links to admin detail pages work.

- [ ] **Step 4: Manual smoke test (signed in as non-admin)**

- `/admin`, `/admin/users`, `/admin/users/<any>`, `/admin/feedback` → all redirect to `/`.
- `curl -i http://localhost:3000/api/admin/users` (no cookies) → `404`.
- `curl -i http://localhost:3000/api/admin/users/<any>` (no cookies) → `404`.
- `curl -i http://localhost:3000/api/admin/feedback` (no cookies) → `404`.

- [ ] **Step 5: Deploy checklist**

- [ ] Apply migration to production: `npx supabase db push`
- [ ] Verify `admin_users_overview` exists in production DB via Supabase Studio.
- [ ] Set your own user's `app_metadata.role = 'admin'` in the production Supabase dashboard.
- [ ] Sign out and back in to pick up the new JWT claim.
- [ ] Visit `/admin` on the production URL → verify same behavior as local.

- [ ] **Step 6: Update docs**

Update `memory/active-context.md` — add a "Recently Completed" bullet:

```markdown
- Admin dashboard (/admin) — users list + detail (reuses public collection), feedback viewer with category tabs, gated by Supabase app_metadata.role
```

Update `docs/BACKLOG.md` if any of the captured items are now done (none directly are, but worth checking).

- [ ] **Step 7: Final commit**

```bash
git add memory/active-context.md docs/BACKLOG.md
git commit -m "document admin dashboard completion"
```

---

## Self-Review Notes

**Spec coverage:**

- Admin gating → Task 1 + 8 (layout) + 4/7/11 (API 404s) ✓
- `admin_users_overview` view → Task 2 ✓
- Users list + API + UI → Tasks 3, 4, 9 ✓
- User detail + hero + collection reuse → Tasks 5, 6, 7, 10 ✓
- Feedback service + API + UI with category tabs → Tasks 11, 12 ✓
- Rollout checklist → Task 13 ✓

**Placeholders:** None. Every step has runnable code or exact commands.

**Type consistency:**

- `AdminUserRow` defined in Task 3, imported in Tasks 10 (hero), 9 (list client). ✓
- `BillingSubscriptionRow` exported from Task 3's service, consumed in Task 10. ✓
- `PublicCollectionPayload` defined in Task 5, consumed in Task 10. Field names `allSets/allMinifigs/allParts/lists` match what `PublicUserCollectionOverview` expects (`allSets/allMinifigs/allParts/lists`). ✓
- `isAdmin` exported from Task 1 alongside `requireAdmin`, used in Tasks 4, 7, 11. ✓
