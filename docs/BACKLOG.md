# Project Backlog

**Last Updated:** March 15, 2026
**Purpose:** Consolidated list of all outstanding and planned work

---

## Pre-Launch Checklist

### 1. Stripe Configuration & E2E Testing (critical path)

Stripe code is implemented. Remaining work is configuration and manual testing.

See `docs/dev/STRIPE_GATING_LAUNCH_CHECKLIST.md` for detailed steps.

**Stripe Dashboard:**

- [ ] Verify price IDs match env vars (test mode vs live mode)
- [ ] Configure Billing Portal (cancellation, payment updates, invoice history, return URL)
- [ ] Verify webhook endpoint receives all required events
- [ ] Enable Stripe Tax

**Hosting Environment (currently Netlify):**

- [ ] Set live Stripe keys (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`)
- [ ] Set live price IDs (`STRIPE_PRICE_PLUS_MONTHLY`, optional `STRIPE_PRICE_PLUS_YEARLY`)
- [ ] Set checkout/portal URLs for production domain
- [ ] Apply feature flag migration to production DB (`supabase db push`)
- [ ] Verify RLS on `billing_subscriptions`

**E2E Testing (Stripe test mode):**

- [ ] Free user: verify all limits (3 tabs, 5 lists, 5 identifies/day, 2 SP/month, no sync push)
- [ ] Checkout: Start trial → verify subscription created → Plus features unlocked
- [ ] Trial-to-active transition
- [ ] Payment failure: `past_due` → DunningBanner → resolve → banner clears
- [ ] Cancellation: `cancel_at_period_end` → period end → downgrade to free
- [ ] Resubscribe: no repeat trial, CTA says "Get Plus" not "Start trial"
- [ ] Account billing tab: verify all states (free, trialing, active, past_due, canceled)

### 2. BrickLink API Compliance

- [ ] Contact `apisupport@bricklink.com` (commercial use, BYO key, quota)
- [ ] Post-launch: API call volume monitoring + alerting at 80% of 5k/day

### 3. Onboarding

- [ ] First-set experience for new users
- [ ] Feature discovery (introduce key features)
- [ ] Tier awareness (free limits, Plus benefits)

### 4. Marketing Page Updates

Landing page exists (`/app/components/landing/LandingPage.tsx`). Evaluate needed updates:

- [ ] Review hero, feature cards, and pricing section for launch readiness
- [ ] Ensure pricing section reflects final Free/Plus tiers

### 5. Loose Parts & Import/Export

Backend supports loose parts (stored in backup export, Rebrickable import can include them). Missing UX for in-app management:

- [ ] In-app UI to manually add/remove loose parts (part search → add to collection)
- [ ] Loose parts visible/manageable in collection view
- [ ] BrickScan CSV dedup: multiple rows for same part+color not aggregated (low priority)

### 6. Remaining UI/Testing

- [ ] Thorough entitlements testing: all gates, quota enforcement, usage counters
- [ ] Upgrade modal messaging review
- [ ] Post-launch webhook monitoring (`billing_webhook_events` error rows)

---

## Post-Launch Work

### SEO & Discoverability

Make set/minifig/part pages discoverable via search engines.

- [ ] `app/sitemap.ts` — dynamic sitemap from catalog tables
- [ ] `app/robots.ts` — sitemap reference, block auth/account/billing paths
- [ ] `metadataBase` in root layout for canonical URLs
- [ ] JSON-LD structured data on set detail pages (`Product` schema)
- [ ] JSON-LD `BreadcrumbList` schema on set/minifig pages
- [ ] Enhanced metadata: theme, year, piece count in titles/descriptions
- [ ] Open Graph / Twitter card meta with set images
- [ ] Evaluate indexable part pages (`/parts/[partNum]`)

### Derived Pricing System

**Plan:** [`docs/dev/DERIVED_PRICING_PLAN.md`](dev/DERIVED_PRICING_PLAN.md)

Replace real-time-only BL API pricing with a three-layer system (BL cache → observations → derived averages).

- [ ] Supabase migration: `bl_price_cache`, `bl_price_observations`, `bl_derived_prices` tables + RLS
- [ ] Price cache service, derived pricing service
- [ ] Integrate DB layers into `blGetPartPriceGuide()` and `fetchBricklinkPrices()`
- [ ] Batch crawl script (`daily-prices.ts`)
- [ ] Admin introspection endpoint (`/api/prices/derived-stats`)

### Identify Page Improvements

| Task                                  | Effort | Notes                                                  |
| ------------------------------------- | ------ | ------------------------------------------------------ |
| Filter identified parts by owned sets | Medium | Filter "found in sets" to only show sets the user owns |
| Search history with part thumbnails   | Medium | Store part images, not uploaded photos                 |
| Back button returns to results        | Medium | State preservation or URL-based                        |

**Backend:**

- [ ] Extract sub-pipelines into smaller pure helpers
- [ ] Add per-request budget to cap external calls
- [ ] Cache "identify → sets" resolutions in Supabase

### Migrate to Vercel

Currently hosted on Netlify. Vercel is a better fit for Next.js (native App Router support, edge middleware, ISR).

- [ ] Migrate hosting from Netlify to Vercel
- [ ] Update env vars, domain DNS, webhook URLs

### Architecture Cleanup

- [x] Identify pipeline refactor: three-stage pipeline with typed budget (done)
- [ ] Normalize color system: DB-backed color mapping exists (`colorMapping.ts`) but identify hot path still calls Rebrickable API via `getColors()` — need to wire `enrichment.ts`, `part.ts` handler, and `/api/colors` to use DB-backed maps

---

## Backlog

Technical debt and improvements to pull from when ready.

### View Preferences

- [ ] Persist last-used inventory view mode (grid, small, etc.) and restore on new set open

### Error Handling & UX

- [ ] Hardening of error states and retries for search/inventory requests
- [ ] Surface normalized `AppError` codes in UI instead of generic messages

### Security

- [ ] BrickLink API key security review - check allowed origins

### Accessibility

- [ ] Modal accessibility: focus trap, focus restoration, inert background, `aria-labelledby/describedby`
- [ ] Filter/picker accessibility: proper roles, key handling, ARIA labels
- [ ] Complex controls (inventory filters, color pickers, identify chips)

### Rate Limiting & Protection

- [ ] Defensive rate limiting for Identify and pricing endpoints

### Logging & Observability

- [ ] Structured logging and basic metrics (per-route latency/error rates, cache hit/miss)

### Multi-Device Sync

- [ ] Recently viewed sync (store in Supabase)
- [ ] Batch pull optimization for many open tabs

### Collection Page

| Task                          | Effort | Notes                 |
| ----------------------------- | ------ | --------------------- |
| Combine parts lists           | High   | Multi-select + export |
| Part list export for all sets | Medium | Extend export modal   |

### Testing

- [ ] Tests for CSV export generators and Rebrickable client retry/backoff
- [ ] Expand automated tests around Identify and pricing flows
- [ ] Add end-to-end validation for CSV exports against marketplace import rules

---

## Future Exploration

Deferred features requiring research or significant scope.

### Expo Native App (iOS & Android)

**Plan:** [`docs/dev/EXPO_APP_PLAN.md`](dev/EXPO_APP_PLAN.md)

Monorepo (Turborepo + pnpm) with ~60% shared code. Mobile calls same API routes over HTTP.

### Custom MOC Uploads

**Plan:** [`docs/dev/CUSTOM_MOC_PLAN.md`](dev/CUSTOM_MOC_PLAN.md)

Upload CSV/XML inventory, view alongside sets, track owned, merge on re-upload.

### Other Future Work

- Price history (via derived pricing observation log)
- Marketplace scanner: deep-link to BrickLink Easy Buy / BrickOwl with wanted list
- **Pro tier** (deferred until features warrant a third tier): BYO BrickLink key, custom MOCs, bulk tools
- Yearly pricing in UI
- Multi-currency / localized pricing

---

## Completed (Reference)

Major completed work — see `docs/dev/archive/` for detailed plans.

**Core Platform:**

- Search, inventory, owned tracking, CSV exports (Rebrickable + BrickLink), pricing
- Identify pipeline (Brickognize → RB → BL fallback, minifig heuristic, sets-via-subparts)
- Search Party (host/join, real-time sync, heartbeat, session resume)
- Multi-tab set viewer (Chrome-like tabs, unmount inactive, prefetch)
- Part rarity system (precomputed tables, badges, sort/filter/group)

**Data & Sync:**

- RB catalog as unified source of truth; BL API for pricing only
- RB↔BL ID mapping (bricklinkable ingest: 48K parts, 16K minifigs)
- Delta sync (server-versioned, watermark-based, refresh-on-focus, cross-tab)
- Collection import/export (JSON backup, BrickScan CSV/XML, Rebrickable sets)

**Billing & Gating:**

- Stripe foundation (schema, webhooks, checkout/portal routes)
- SSR entitlements preload, `useEntitlements` hook, `hasFeature()`/`assertFeature()` guards
- All feature gates: tabs (3), lists (5), identifies (5/day), Search Party (2/month), rarity, sync
- Billing UI: account page, upgrade CTAs, pricing page, inline upsells, dunning banners
- Usage counters wiring

**UI:**

- Marketing landing page (hero, features, pricing, CTAs)
- Sets landing page (recently viewed, partially complete, search parties)
- Collection page with search/filter controls
- Collection parts: missing view with contained set cards
- Set detail modal, inventory item modal
- Tab bar: Chrome-like styling, overscroll fix
- SyncIndicator replaced with error-only toast

**Infrastructure:**

- Auth (Google via Supabase), Sentry error tracking
- BL API: OAuth 1.0, circuit breaker, 5K/day quota tracking with graceful degradation
- Owned data microtask batching (prevents loss on refresh)
- 556 tests (66 files), clean tsc

---

## Related Documentation

- `docs/dev/DERIVED_PRICING_PLAN.md` - Derived pricing system
- `docs/dev/CUSTOM_MOC_PLAN.md` - Custom MOC upload plan
- `docs/dev/EXPO_APP_PLAN.md` - Expo native app plan
- `docs/dev/COST_OPTIMIZATION_PLAN.md` - Post-launch cost reduction
- `docs/dev/STRIPE_GATING_LAUNCH_CHECKLIST.md` - Stripe pre-launch config steps
- `docs/billing/stripe-subscriptions.md` - Full Stripe implementation spec
- `docs/dev/archive/` - Completed plans for historical reference
