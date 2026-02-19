# Project Backlog

**Last Updated:** February 15, 2026
**Purpose:** Consolidated list of all outstanding and planned work

---

## Pre-Launch Checklist

Required before accepting paid users. Groups are ordered by priority; see [dependency map](#dependency--parallelization-map) at the bottom.

### Group A: BrickLink API Compliance (highest priority — live ToS violation)

- [x] Remove `pricing.full_cached` entitlement check from `/api/prices/bricklink/route.ts`
- [x] Remove `pricing.full_cached` entitlement check from `/api/prices/bricklink-set/route.ts`
- [x] Migration to delete stale feature flag seeds (`pricing.full_cached`, `bricklink.byo_key`, `mocs.custom`)
- [x] Add BrickLink attribution notice to UI where pricing is displayed
- [ ] Contact `apisupport@bricklink.com` (commercial use, BYO key, quota)
- [ ] Post-launch: API call volume monitoring + alerting at 80% of 5k/day

### Group B: Feature Gating (blocks billing UI)

- [ ] SSR entitlements preload in root layout
- [ ] Client `useFeatureFlag` hook
- [ ] Reusable API guard helper for tier-restricted endpoints
- [ ] Tab limit enforcement (free: 3, Plus: unlimited) — currently hardcoded `MAX_TABS = 10` in `open-tabs.ts`
- [ ] List limit (free: 3, Plus: unlimited)
- [ ] Export limit (free: 1/month, Plus: unlimited)
- [ ] Search Party limit (free: 2/month, Plus: unlimited) — verify quota route blocks creation
- [ ] Gate rarity badges/filter behind `rarity.enabled` flag (Plus tier)
- [ ] Usage counters wiring (service exists at `usageCounters.ts`, needs connection to more features)

**Pricing philosophy:** Expose surface area on free tier so users can try everything; gate on volume. Sync is a value-add, not a prerequisite — free users can manually export/import collection data.

**BrickLink pricing is free for all users** — on-demand API calls with 6hr server cache. BrickLink API ToS prohibits gating their free-to-members data behind a paywall.

**Feature flags to enforce** (seeds exist in `feature_flags` table):

| Flag                     | Min Tier | Free Limit   |
| ------------------------ | -------- | ------------ |
| `tabs.unlimited`         | Plus     | 3 open tabs  |
| `identify.unlimited`     | Plus     | 5-10/month   |
| `exports.unlimited`      | Plus     | 1/month      |
| `sync.enabled`           | Plus     | -            |
| `lists.unlimited`        | Plus     | 3 lists      |
| `search_party.unlimited` | Plus     | 2 runs/month |
| `search_party.advanced`  | Plus     | -            |
| `rarity.enabled`         | Plus     | -            |

See `docs/billing/stripe-subscriptions.md` for full spec.

### Group C: Stripe Billing UI (depends on Group B)

- [ ] Account/Billing page: current tier, status, renewal date, cancel_at_period_end
- [ ] Upgrade/Manage CTAs on pricing page
- [ ] Inline upsells on gated features
- [ ] Dunning: past_due/unpaid handling with in-app banner

### Group D: Part Rarity (independent — can parallel B/C) ✅

- [x] New precomputed `rb_part_rarity` + `rb_minifig_rarity` tables
- [x] `materializePartRarity()` in ingestion script (+ `--rarity-only` flag)
- [x] Rarity indicators (badges) in set inventory views
- [x] Sort/filter/group by rarity in inventory controls
- [x] Removed `/exclusive-pieces` standalone page + route

### Group E: Collection Import/Export (independent — can parallel B/C)

- [ ] JSON export of collection data (sets, owned quantities, lists)
- [ ] Import from Brick Party JSON export
- [ ] Import from BrickScan format
- [ ] Free tier (manual workaround for cross-device sync)

### Group F: UI Polish & Testing (finishing touches)

- [ ] Sets tab bar: Chrome-like styling, fix overscroll, spacing
- [ ] UI review: remove outdated design patterns, evaluate LEGO app alignment
- [ ] Loader animation: standardize placement across loading states
- [ ] Minifig/set detail modal UI review (from set inventory)
- [ ] Thorough testing: entitlements, gating, Stripe webhooks, usage counters, pricing
- [ ] Address launch audit hardening items from [`docs/LAUNCH_AUDIT_REPORT_2026-02-17.md`](LAUNCH_AUDIT_REPORT_2026-02-17.md)

### Dependency / Parallelization Map

```
A (BL compliance) ──────────────────────────────────> done
B1-B3 (gating infra) ─┬─> B4-B9 (individual gates) ─> C (billing UI) ─> C4 (dunning)
                       │
D (rarity) ────────────┤   (independent, can parallel)
                       │
E (import/export) ─────┘   (independent, can parallel)
                                                        F (polish & testing) ─> LAUNCH
```

---

## Post-Launch Work

Larger features and improvements for after launch.

### Derived Pricing System

**Plan:** [`docs/dev/DERIVED_PRICING_PLAN.md`](dev/DERIVED_PRICING_PLAN.md)

Replace real-time-only BL API pricing with a three-layer system (BL cache → observations → derived averages) that stays within BL ToS and the 5K daily API limit. Derived prices are independently-computed averages served indefinitely; raw BL data still respects the 6-hour TTL.

- [ ] Supabase migration: `bl_price_cache`, `bl_price_observations`, `bl_derived_prices` tables + RLS
- [ ] Price cache service (`priceCache.ts`): DB read/write for all three layers
- [ ] Derived pricing service (`derivedPricing.ts`): observation recording, threshold check, average computation
- [ ] Integrate DB layers into `blGetPartPriceGuide()` and `fetchBricklinkPrices()`
- [ ] Update `pricingSource` in API responses (`derived`, `stale` values)
- [ ] Batch crawl script (`daily-prices.ts`) for proactive observation seeding
- [ ] Admin introspection endpoint (`/api/prices/derived-stats`)
- [ ] Monitor API budget decline as derived coverage grows

### Identify Page Improvements

**UX Improvements:**

| Task                                | Effort | Notes                                  |
| ----------------------------------- | ------ | -------------------------------------- |
| Search history with part thumbnails | Medium | Store part images, not uploaded photos |
| Back button returns to results      | Medium | State preservation or URL-based        |

**Backend Improvements:**

- [ ] Extract sub-pipelines into smaller pure helpers
- [ ] Add per-request budget to cap external calls
- [ ] Cache "identify → sets" resolutions in Supabase keyed by normalized part/color identifiers

### Sets Page & Navigation

**Problem:** Wayfinding is confusing when viewing a set that isn't in your collection. Nothing is highlighted in the nav. Need a proper `/sets` landing page separate from `/collection`.

**Deliverables:**

- [ ] New `/sets` landing page with:
  - Recently viewed sets (limit 4, using set cards with controls)
  - Partially complete sets (sets with some pieces owned but not all)
- [ ] Clear nav distinction between Sets (viewer) and Collection (user's owned/wishlisted)
- [ ] Design for mobile (5 buttons) and desktop

### Scripts & Data Ingestion

| Task                    | Effort | Notes                                      |
| ----------------------- | ------ | ------------------------------------------ |
| Ingestion script review | Low    | Documentation/audit of rebrickable scripts |

---

## Backlog

Technical debt and improvements to pull from when ready.

### Error Handling & UX

- [ ] Hardening of error states and retries for search/inventory requests
- [ ] Surface normalized `AppError` codes in UI instead of generic messages
- [ ] Centralize non-blocking error toasts for Supabase flows (collection create/toggle, set status)

### Security Hardening

- [ ] BrickLink API key security review - check allowed origins

### Accessibility

- [ ] Modal accessibility: focus trap, focus restoration, inert background, `aria-labelledby/describedby`
- [ ] Filter/picker accessibility: proper roles, key handling, ARIA labels
- [ ] Complex controls (inventory filters, color pickers, identify chips) - revisit

### Rate Limiting & Protection

- [ ] Defensive rate limiting for Identify and pricing endpoints (per-IP and/or per-user limits)

### Logging & Observability

- [ ] Structured logging and basic metrics (per-route latency/error rates, cache hit/miss, external API throttling)

### Multi-Device Sync

- [ ] Pull-on-login for multi-device sync (fetch user data from Supabase on new device)
- [ ] Recently viewed sync (store in Supabase)

### Collection Page Enhancements

| Task                          | Effort | Notes                 |
| ----------------------------- | ------ | --------------------- |
| Search/filter on collection   | Medium | Text search + filters |
| Combine parts lists           | High   | Multi-select + export |
| Part list export for all sets | Medium | Extend export modal   |

### Architecture Refinement

- [ ] Refactor Supabase-owned state into lower-level owned-persistence service + higher-level migration coordinator hook

### Testing

- [ ] Tests for CSV export generators (Rebrickable + BrickLink) and Rebrickable client retry/backoff behavior
- [ ] Expand automated tests around Identify and pricing flows (mocked RB/BL/Brickognize)
- [ ] Add end-to-end validation for CSV exports against Rebrickable/BrickLink import rules

---

## Bugs

| Bug                              | Description                                                                                                                                           |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| ~~BrickLink piece linking 404s~~ | ~~Fixed (Plan 08+10): On-demand validation in part detail modal auto-corrects bad mappings. Identify pipeline now uses correct BL IDs from catalog.~~ |

---

## Future Exploration

Deferred features requiring research or significant scope.

- Price history (addressed by derived pricing plan — observation log provides historical data; derived averages are independently computed and not subject to BL's 6hr display rule)
- Marketplace scanner / store finder — **Researched Feb 2026:**
  - Rebrickable's store finder uses a **privileged BrickLink partnership API** (not public) for cross-store inventory search
  - The public BrickLink API has no endpoint to search other stores' inventories — only price guides (which we already use) and own-store management
  - BrickOwl has an **Affiliate API** (`GET /v1/affiliate/item_lots`) that returns cross-store inventory for opted-in stores, but requires affiliate partnership approval
  - **Feasible alternatives:**
    - Deep-link to BrickLink Easy Buy with pre-populated wanted list (high value, low effort)
    - Deep-link to BrickOwl with exported wanted list
    - Apply for BrickOwl Affiliate API for in-app store matching
  - **Not feasible:** Replicating Rebrickable's full store-matching optimization without a BrickLink partnership
- **Custom MOC Uploads** — **Plan:** [`docs/dev/CUSTOM_MOC_PLAN.md`](dev/CUSTOM_MOC_PLAN.md)
  - Upload CSV/XML inventory, view alongside sets, track owned, merge on re-upload
  - Third "MOCs" segment on collection page, full list integration
  - Phase 1 (~3-4d): RB CSV + collection UI + tab + owned tracking
  - Phase 2 (~3-4d): BL XML import, smart merge, sync
  - Phase 3: Supabase Storage for images, Stud.io format, merge review UI
- **Pro tier features** (deferred until features warrant a third tier):
  - Instructions uploads/linking
  - BYO BrickLink API key (pending BrickLink response on whether this is ToS-compliant as a paid feature)
  - Multi-set analysis (combined missing list across collection, "next best set" recommendations)
- Yearly pricing surfaced in UI
- Multi-currency/localized pricing
- Advanced tax/localization
- Stripe analytics/observability

---

## Completed (Reference)

Major completed initiatives - see `docs/dev/archive/` for detailed plans:

- **Search Party Join UX** (Feb 2026) - Improved join modal instructions and join page
- **Service Role Privilege Audit** (Feb 2026) - Audited 15 files using `getSupabaseServiceRoleClient`, reduced footprint where possible
- **Set Ownership & Collection UI Overhaul** (Feb 2026) - Schema migration (`owned: boolean` + Wishlist as system list), database unique indexes, collection page ownership controls, UI polish
- **BrickLink Minifig Migration to RB Catalog** (Feb 2026, Plans 11-12) - All minifig data (metadata, subparts, set membership) now from RB catalog tables (`rb_minifigs`, `rb_minifig_parts`). BL API retained only for pricing. Dead BL code/tables/scripts removed
- **Auth onAuthStateChange** (Feb 2026) - Implemented in `auth-provider.tsx`; hooks react to in-session login/logout
- **RB↔BL ID Mapping Complete** (Feb 2026) - Bricklinkable ingest: 48,537 parts with explicit `rb_parts.bl_part_id`, 16,229 minifigs with `rb_minifigs.bl_minifig_id` (98.1%). Remaining parts have identical IDs (same-by-default). Dead code cleanup: removed `mapToBrickLink()`, `/api/parts/bricklink`, `/api/colors/mapping`
- **Identify Pipeline & Dual Links** (Feb 2026) - Identify pipeline uses correct BL IDs from catalog; all UI shows dual BrickLink + Rebrickable links
- **Export Fixes & BL Validation** (Feb 2026) - BL export synchronous/identity-only; RB export minifig toggle; on-demand BL validation self-heals to `rb_parts.bl_part_id`
- **Set Ownership Schema Overhaul** (Jan 2026) - `owned: boolean` + Wishlist as system list, fixed unique indexes
- **Minifig Cascade Fix** (Dec 2025) - Toggling parent cascades to subparts correctly
- **Shared Minifig Parts Fix** (Dec 2025) - Multiple minifigs sharing subparts aggregate quantities correctly
- **Cache Architecture** (Dec 2025) - Targeted fixes applied, strategy documented in `memory/system-patterns.md`
- **Codebase Review Issues** (Dec 2025) - Error handling, logging, test coverage improvements
- **Stripe Foundation** (Dec 2025) - Schema, webhooks, checkout/portal routes, beta override. See `docs/billing/stripe-subscriptions.md`

---

## Related Documentation

- `docs/dev/CUSTOM_MOC_PLAN.md` - Custom MOC upload difficulty analysis and phased plan
- `docs/dev/DERIVED_PRICING_PLAN.md` - Derived pricing system (BL ToS compliance + API budget)
- `docs/dev/CURRENT_IMPROVEMENT_PLAN.md` - Service role audit details
- `docs/billing/stripe-subscriptions.md` - Full Stripe implementation spec
- `memory/system-patterns.md` - Caching strategy and architecture patterns
- `docs/dev/archive/` - Completed plans for historical reference
