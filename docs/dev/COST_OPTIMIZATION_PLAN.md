# Cost Optimization Plan

Status: In progress (Feb 2026)

## Completed

### Cache headers on catalog API routes

Added `public` Cache-Control headers to reduce redundant serverless function invocations:

- `/api/themes`, `/api/colors`: `max-age=3600, stale-while-revalidate=86400` (catalog data, changes rarely)
- `/api/search`: `max-age=60, stale-while-revalidate=300` (catalog-only, not user-specific)

### Retention cleanup (pg_cron)

Migration `20260226050000` schedules nightly cleanup at 03:00 UTC:

- `bl_price_observations`: rows older than 180 days (the observation window used by derived pricing)
- `usage_counters`: expired daily/monthly windows (only current window is ever queried)
- `billing_webhook_events`: processed events older than 30 days (Stripe retries for ~3 days; 30d is generous for audit)
- `system_counters`: windows older than 7 days

### BrickLink daily quota persistence

Migration `20260226050001` creates `system_counters` table + atomic RPC functions. `bricklink.ts` now reads/increments the counter in Supabase instead of in-process memory, so the 5K/day limit is enforced across all serverless instances and survives cold starts. Falls back to in-process counter if DB is unreachable.

---

## Deferred / Not Actionable

### Middleware `getUser()` duplication — NOT FIXABLE

**Problem:** `middleware.ts` calls `supabase.auth.getUser()` on every non-static request to refresh session cookies. Then `layout.tsx` calls it again to get the user for rendering. This adds ~100ms latency per request.

**Why it can't be fixed:** Next.js middleware runs in a separate Edge execution context from Server Components. There is no shared memory or request-scoped store between them. The only bridge is HTTP headers, but forwarding auth state via headers is an antipattern — it bypasses JWT verification. If middleware is ever misconfigured or bypassed, a forged header would grant access.

This is the [official Supabase SSR pattern](https://supabase.com/docs/guides/auth/server-side/nextjs). The middleware call refreshes cookies; the layout call is the real auth check. Accept the latency cost.

### Supabase compute addon

**When:** At ~5,000 MAU with pricing enabled.

**Why:** The default Pro plan compute is a shared CPU with 1 GB RAM. The inventory endpoint fires 6-10 parallel Supabase queries per set view (parts, colors, rarity batches, minifigs). Under concurrent load from thousands of users, the shared CPU will throttle and query latency will spike.

**Options:**
| Addon | CPU | RAM | Cost |
|---|---|---|---|
| Small | 2-core dedicated | 2 GB | $20/mo |
| Medium | 2-core dedicated | 4 GB | $60/mo |
| Large | 4-core dedicated | 8 GB | $120/mo |

Start with Small ($20/mo) at 5K MAU. Monitor `pg_stat_activity` and query latency in Sentry to determine when to upgrade further.

### Sync interval backoff — NOT NEEDED

**Original concern:** SyncWorker fires every 30s even when idle, wasting request credits.

**Investigation result:** The sync loop already has proper change detection. `performSync()` reads the IndexedDB `syncQueue` and returns immediately with zero network requests if the queue is empty. Only when the user actively marks pieces are sync requests made. No changes needed.

### Image optimization at scale

**When:** At ~10K+ MAU with heavy search usage.

**Problem:** `/_next/image` optimization requests are serverless function invocations on Netlify. Search results with 100 set cards trigger 100 image optimization requests on first view per unique image variant.

**Mitigation already in place:** PWA service worker uses `CacheFirst` strategy with 30-day TTL for Rebrickable, BrickLink, and Google Storage images. Repeat visits serve from browser cache.

**Future options if needed:**

- Use a dedicated image CDN (Cloudflare Images, imgix) instead of Next.js image optimization
- Pregenerate common thumbnail sizes during catalog ingestion
- Add `loading="lazy"` to below-fold images (may already be handled by Next.js `<Image>`)

### Netlify plan upgrade

**When:** Deploy frequency becomes the bottleneck (15 credits per deploy, 300 credits on Free plan = 20 deploys/month max).

**Path:**

- Free ($0/mo, 300 credits) → likely sufficient through ~500 MAU
- Personal ($9/mo, 1,000 credits) → sufficient through ~5,000 MAU
- Pro ($20/mo, 3,000 credits) → sufficient through ~20,000+ MAU

Deploy frequency (not traffic) will force the upgrade first. At 2+ deploys/day, the Free plan is already tight.
