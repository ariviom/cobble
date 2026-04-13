# Admin Dashboard — Design

**Date:** 2026-04-13
**Status:** Draft
**Owner:** Drew

## Summary

A read-only admin dashboard at `/admin`, gated by a Supabase `app_metadata.role = 'admin'` claim. Surfaces a paginated, searchable list of users with key metrics and a detail view that mirrors the public collection page. Scaffolded with side nav to accommodate a second surface (feedback viewer) now, and future admin tools later.

## Goals

- Give the owner a single place to see who's using the app and what they're doing
- Drill into any user's sets and tracked pieces, reusing the public collection renderer
- View and filter user feedback by category
- Ship without modifying RLS or the public schema

## Non-Goals

- No mutations (impersonation, ban, grant-Plus, refunds)
- No metrics/charts (signups over time, MAU, revenue)
- No audit logging (not needed for a read-only surface)
- No mobile-first polish — desktop-only is fine

## Admin Gating

### Identity

Admin status is stored as a JWT claim via `auth.users.app_metadata.role = 'admin'`, set manually in the Supabase dashboard (or via the service-role API). No schema change, no public-facing column.

### Utility

`app/lib/server/requireAdmin.ts`:

```ts
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
```

### Enforcement

Three layers:

1. **Layout** — `app/admin/layout.tsx` calls `requireAdmin()` at the top; unauthorized visitors are redirected before any admin markup renders.
2. **API routes** — every `app/api/admin/*` handler calls `requireAdmin()` first. Non-admins get a `404` (don't leak route existence — use `notFound()` equivalent or `new Response(null, { status: 404 })`).
3. **Queries** — admin endpoints use `getSupabaseServiceRoleClient()` to bypass RLS when reading other users' data. RLS stays strict; gating lives in the handler.

All admin modules import `server-only` to prevent client-bundle leaks.

## Routes & File Layout

```
app/admin/
  layout.tsx                  # requireAdmin() + <AdminShell>
  page.tsx                    # redirect → /admin/users
  users/
    page.tsx                  # list view (SSR)
    UsersListClient.tsx       # search + pagination client component
    [userId]/
      page.tsx                # detail view (SSR)
      AdminUserHero.tsx       # replaces collection hero with admin data
  feedback/
    page.tsx                  # feedback viewer (SSR)
    FeedbackListClient.tsx    # category tabs + list client component

app/api/admin/
  users/route.ts              # GET: search + paginate
  users/[userId]/route.ts     # GET: full detail payload (used by client-side refreshes if any)
  feedback/route.ts           # GET: list + filter by category

app/lib/server/
  requireAdmin.ts             # gating utility

app/lib/services/
  adminUsers.ts               # list/detail queries
  adminFeedback.ts            # feedback queries
  publicCollection.ts         # extracted helper (shared with /collection/[handle])

app/components/admin/
  AdminShell.tsx              # sidebar nav + main region
```

## Users List

### Data source

A SQL view `public.admin_users_overview` joining `auth.users` + `user_profiles` + aggregate counts + most-recent subscription row. Service-role `SELECT` only — no grant to `anon` or `authenticated`.

Columns:

| Column                | Source                                                                |
| --------------------- | --------------------------------------------------------------------- |
| `user_id`             | `auth.users.id`                                                       |
| `email`               | `auth.users.email`                                                    |
| `username`            | `user_profiles.username`                                              |
| `display_name`        | `user_profiles.display_name`                                          |
| `created_at`          | `auth.users.created_at`                                               |
| `last_sign_in_at`     | `auth.users.last_sign_in_at`                                          |
| `subscription_tier`   | latest `billing_subscriptions.tier` where status ≠ canceled (or null) |
| `subscription_status` | latest `billing_subscriptions.status`                                 |
| `owned_set_count`     | `count(*) from user_sets where status='owned' group by user_id`       |
| `tracked_set_count`   | `count(*) from user_sets where status='want' group by user_id`        |
| `list_count`          | `count(*) from user_lists where is_system=false group by user_id`     |

Migration name: `admin_users_overview`. Use `npx supabase migration new admin_users_overview`.

### API

`GET /api/admin/users?q=<username>&page=<n>`

- Default sort: `last_sign_in_at desc nulls last`
- Page size: 25 (tunable, well under the 50 ceiling)
- Search: case-insensitive prefix match on `username` (`.ilike('username', \`${q}%\`)`)
- Returns `{ rows: AdminUserRow[], total: number, page: number, pageSize: number }`

Initial page is hydrated by the SSR `users/page.tsx`; pagination and search re-fetch via this endpoint.

### UI

`UsersListClient.tsx` — search input + paginated table/card list. Layout echoes the search page (top search bar, results region). Each row shows identity, last login, tier badge, and the three counts. Clicking a row navigates to `/admin/users/{user_id}`.

## User Detail

### Data source

Two data paths:

1. **Collection payload** — extracted helper `fetchPublicCollectionPayload(userId, supabase)` in `app/lib/services/publicCollection.ts`. The existing logic in `app/collection/[handle]/page.tsx` (lines 267+) is moved here and becomes the single caller for both:
   - `/collection/[handle]` (uses `getSupabaseServerClient()`, relies on `public_*_view` visibility — only reads public data)
   - `/admin/users/[userId]` (uses `getSupabaseServiceRoleClient()`, bypasses privacy)

   The helper returns `{ allSets, allMinifigs, allParts, lists }`.

2. **Admin-only header data** — fetched alongside:
   - `auth.users` row (email, `created_at`, `last_sign_in_at`, `app_metadata`)
   - `user_profiles` row (display_name, username, avatar_url)
   - Most-recent `billing_subscriptions` row (tier, status, current_period_end, stripe_customer_id, stripe_subscription_id, trial_end)
   - Counts (owned sets, tracked sets, lists) — either re-query or read from the view

### UI

`app/admin/users/[userId]/page.tsx` renders:

```tsx
<AdminShell>
  <AdminUserHero
    user={authUser}
    profile={profile}
    subscription={subscription}
    counts={counts}
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
```

`AdminUserHero` replaces the public page's hero (`<h2>{username}</h2>`) with a card showing:

- Display name + username + email
- `created_at` / `last_sign_in_at`
- Subscription tier + status + renewal/trial details + Stripe IDs
- The three collection counts
- A "View public collection" link to `/collection/{handle}`

No search/identify buttons (those live in `UserCollectionOverview`, which we're not reusing).

## Feedback Viewer

### Data source

`user_feedback` table (already has a `category` column per migration `20260408034953_add_category_to_user_feedback.sql`). Join `user_profiles` on `user_id` for display_name/username when available.

### API

`GET /api/admin/feedback?category=<category>&page=<n>`

- Sort: `created_at desc`
- Page size: 50
- Category filter optional; when absent, return all

### UI

`app/admin/feedback/page.tsx` → `<FeedbackListClient>`:

- Tabs across the top — one per distinct `category` value plus an "All" tab
- List below: each item shows submitter (display_name + username link to `/admin/users/{user_id}`), category, timestamp, body
- No reply/close actions — read-only

Tab values are hard-coded from the submission form's `category` options (source: the feedback submission UI's category enum — read at implementation time) plus a leading "All" tab. Falling back to distinct values from query results risks empty tabs disappearing.

## Error Handling

| Scenario                             | Handling                                                                                |
| ------------------------------------ | --------------------------------------------------------------------------------------- |
| `requireAdmin()` on page → not admin | `redirect('/')`                                                                         |
| `requireAdmin()` on API → not admin  | `404 Not Found` (no body; don't leak route existence)                                   |
| View query fails                     | Next.js error boundary with a retry link                                                |
| `auth.users` row missing for user_id | Filter out, `logger.warn`                                                               |
| Detail fetch fails for one sub-query | Continue with empty arrays for that section (matches existing `[handle]` page behavior) |

## Testing

Vitest, jsdom, co-located `__tests__/` directories:

- `app/lib/server/__tests__/requireAdmin.test.ts` — anon redirects, non-admin redirects, admin passes through
- `app/lib/services/__tests__/adminUsers.test.ts` — list query shape, search filter applied, pagination range correct
- `app/lib/services/__tests__/publicCollection.test.ts` — extracted helper returns expected shape; regression-tests both `/collection/[handle]` and admin detail
- `app/api/admin/users/__tests__/route.test.ts` — 404 when not admin, 200 + payload when admin
- `app/api/admin/feedback/__tests__/route.test.ts` — 404 when not admin, category filter applied

No UI snapshot tests unless a specific interaction requires coverage.

## Rollout

1. Create migration `admin_users_overview` (view + service-role grants).
2. In Supabase dashboard → Auth → Users → edit your row's `app_metadata` to `{ "role": "admin" }`.
3. Ship the `/admin` route + API handlers.
4. Manual verification:
   - Signed in as admin → `/admin` loads, list populated, detail opens
   - Signed in as non-admin → `/admin` redirects to `/`
   - Signed out → `/admin` redirects to `/`
   - `curl /api/admin/users` with no session → 404
   - `curl /api/admin/users` with non-admin session → 404

## Open Questions

None — design is approved.

## Out of Scope (Explicit)

- Admin mutations (impersonation, ban, refund, grant-Plus, entitlement overrides UI)
- Metrics dashboards (signups, MAU, revenue, webhook error rates)
- Audit logging of admin views (revisit when mutations land)
- Admin-invitation flow (adding other admins is a manual dashboard edit)
- Email notifications for new feedback
