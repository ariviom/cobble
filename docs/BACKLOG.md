# Project Backlog

**Last Updated:** January 25, 2026
**Purpose:** Consolidated list of all outstanding and planned work

---

## In Progress

### Set Ownership & Collection UI Overhaul

**Status:** Complete

- [x] Schema migration: `owned: boolean` + Wishlist as system list
- [x] Database unique indexes fixed for upserts
- [x] Collection page shows ownership controls on cards
- [x] **UI polish for ownership controls** - button sizing, layout, mobile toast feedback

### Loader Animation

**Status:** Implemented, needs integration review

- [x] New themed loader animation created
- [ ] Review and standardize placement across loading states

---

## Quick Wins

Small tasks that can be completed quickly.

| Task                                           | Notes                                                                                                                              |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Search Party join UX                           | Better join modal instructions (where to enter code) + update join page                                                            |
| ~~Search Party button missing in setTopBar~~   | ~~Fixed: Always pass searchParty prop, show loading state when clientId not ready~~                                                |
| ~~Login redirect to home page~~                | ~~Fixed: Changed all auth redirects from /account to /~~                                                                           |
| ~~Button contrast on matching backgrounds~~    | ~~Fixed: Created ThemedPageHeader component and useContrastingHeaderColor hook; updated home, search, identify pages~~             |
| ~~Nav transition double-highlight~~            | ~~Fixed: Changed hover/active states to use subtle overlay instead of white background~~                                           |
| ~~Bottom sheet overlap with tab bar~~          | ~~Fixed: Changed bottom-0 to bottom-[var(--spacing-nav-height)] on mobile~~                                                        |
| ~~Disable color filters when pieces excluded~~ | ~~Fixed: Added availableColors computed from display/category filters, disabled/grayed unavailable color options~~                 |
| ~~Page titles~~                                | ~~Fixed: Added metadata to search, identify, account, collection pages; added generateMetadata for dynamic set/collection titles~~ |

---

## Chunks of Work

Larger features, in priority order.

### 1. Identify Page Improvements

**UX Improvements:**

| Task                                | Effort | Notes                                                       |
| ----------------------------------- | ------ | ----------------------------------------------------------- |
| ~~Auto-search on photo confirm~~    | Low    | ~~Done: auto-search on upload (f33c7a0)~~                   |
| ~~Text link for mobile upload~~     | Low    | ~~Done: gallery picker (f33c7a0)~~                          |
| ~~Better loading states~~           | Low    | ~~Done: loading phases with labeled BrickLoader (f33c7a0)~~ |
| Search history with part thumbnails | Medium | Store part images, not uploaded photos                      |
| Back button returns to results      | Medium | State preservation or URL-based                             |

**Backend Improvements:**

- [ ] Extract sub-pipelines into smaller pure helpers
- [ ] Add per-request budget to cap external calls
- [x] ~~Improve UX with clearer sub-states~~ — Done: three loading phases (identifying/finding-sets/updating) (f33c7a0)
- [x] ~~Consider debouncing rapid candidate/color changes~~ — Done: 300ms debounce on color changes (f33c7a0)
- [ ] Cache "identify → sets" resolutions in Supabase keyed by normalized part/color identifiers

### 2. Sets Page & Navigation

**Problem:** Wayfinding is confusing when viewing a set that isn't in your collection. Nothing is highlighted in the nav. Need a proper `/sets` landing page separate from `/collection`.

**Deliverables:**

- [ ] New `/sets` landing page with:
  - Recently viewed sets (limit 4, using set cards with controls)
  - Partially complete sets (sets with some pieces owned but not all)
- [ ] Clear nav distinction between Sets (viewer) and Collection (user's owned/wishlisted)
- [ ] Design for mobile (5 buttons) and desktop

### 3. Implementation Review

- [ ] Review and confirm BrickLink minifig migration implementation
  - BrickLink is now exclusive source for minifig IDs/metadata/parts
  - Verify data integrity and edge cases

### 4. Scripts & Data Ingestion

| Task                                      | Effort | Notes                                      |
| ----------------------------------------- | ------ | ------------------------------------------ |
| Ingestion script review                   | Low    | Documentation/audit of rebrickable scripts |
| Ingest all minifigs and parts to database | High   | Full catalog coverage                      |
| Set exclusive parts cache                 | Medium | New table + script for rarity indicators   |

---

## Bugs

| Bug                              | Description                                                                                                                            |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| ~~BrickLink piece linking 404s~~ | ~~Fixed (Plan 08): On-demand validation in part detail modal auto-corrects bad mappings, negative caching prevents repeated lookups.~~ |

---

## Pre-Public Launch

Required before accepting paid users, but not blocking personal usage.

### Stripe UI/UX Enforcement

- [ ] Account/Billing page showing tier/status/renewal/cancel_at_period_end
- [ ] Upgrade/Manage CTAs on pricing page
- [ ] Inline upsells on gated features (e.g., "Upgrade to Plus for unlimited identifies")

### Feature Gating

- [ ] SSR entitlements preload to avoid flicker
- [ ] API guards for tier-restricted endpoints
- [ ] Client `useFeatureFlag` hook consuming preloaded entitlements
- [ ] Usage counters table and enforcement logic

**Feature flags to enforce** (seeds exist in `feature_flags` table):

| Flag                     | Min Tier | Free Limit   |
| ------------------------ | -------- | ------------ |
| `identify.unlimited`     | Plus     | TBD          |
| `lists.unlimited`        | Plus     | 3 lists      |
| `search_party.unlimited` | Plus     | 2 runs/month |
| `search_party.advanced`  | Plus     | -            |
| `bricklink.byo_key`      | Pro      | -            |
| `mocs.custom`            | Pro      | -            |

See `docs/billing/stripe-subscriptions.md` for full spec.

### Stripe Post-Foundation

- [ ] Dunning/notifications: past_due/unpaid handling, email or in-app banners

---

## Backlog

Technical debt and improvements to pull from when ready.

### Error Handling & UX

- [ ] Hardening of error states and retries for search/inventory requests
- [ ] Surface normalized `AppError` codes in UI instead of generic messages
- [ ] Centralize non-blocking error toasts for Supabase flows (collection create/toggle, set status)

### Security Hardening

- [ ] Service Role Privilege Audit - audit 15 files using `getSupabaseServiceRoleClient`
  - Reduce footprint where anon/auth client would work
  - Document reasoning for remaining service role usages
  - See `docs/dev/CURRENT_IMPROVEMENT_PLAN.md` for details
- [ ] BrickLink API key security review - check allowed origins

### Auth & Session

- [ ] Subscribe to Supabase `auth.onAuthStateChange` so hooks react to in-session login/logout

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

## Future Exploration

Deferred features requiring research or significant scope.

- Price history (requires persistent storage, API quota planning)
- Marketplace scanner / store finder — **Researched Feb 2026:**
  - Rebrickable's store finder uses a **privileged BrickLink partnership API** (not public) for cross-store inventory search
  - The public BrickLink API has no endpoint to search other stores' inventories — only price guides (which we already use) and own-store management
  - BrickOwl has an **Affiliate API** (`GET /v1/affiliate/item_lots`) that returns cross-store inventory for opted-in stores, but requires affiliate partnership approval
  - **Feasible alternatives:**
    - Deep-link to BrickLink Easy Buy with pre-populated wanted list (high value, low effort)
    - Deep-link to BrickOwl with exported wanted list
    - Apply for BrickOwl Affiliate API for in-app store matching
  - **Not feasible:** Replicating Rebrickable's full store-matching optimization without a BrickLink partnership
- BYO BrickLink API key (Pro tier feature)
- Custom MoC import (requires storage bucket setup)
- Set instructions viewer (research external linking options)
- Part rarity/exclusive indicators (display set-exclusive parts)
- Yearly pricing surfaced in UI
- Multi-currency/localized pricing
- Advanced tax/localization
- Stripe analytics/observability

---

## Completed (Reference)

Major completed initiatives - see `docs/dev/archive/` for detailed plans:

- **Same-by-Default BL Part ID Mapping** (Feb 2026) - `blPartId` defaults to `rbPartId`; `enrichPartExternalIds()` populates `rb_parts.external_ids` from Rebrickable API (~80% of parts have different BL IDs); same-by-default covers remaining ~20%
- **Export Fixes & BL Validation** (Feb 2026) - BL export no longer makes per-part API calls; RB export minifig toggle; on-demand BL link validation with self-healing; negative caching in `part_id_mappings`
- **Set Ownership Schema Overhaul** (Jan 2026) - `owned: boolean` + Wishlist as system list, fixed unique indexes
- **BrickLink Minifig Migration** (Dec 2025) - BL is now exclusive source for minifig IDs/metadata/parts
- **Minifig Cascade Fix** (Dec 2025) - Toggling parent cascades to subparts correctly
- **Shared Minifig Parts Fix** (Dec 2025) - Multiple minifigs sharing subparts aggregate quantities correctly
- **Cache Architecture** (Dec 2025) - Targeted fixes applied, strategy documented in `memory/system-patterns.md`
- **Codebase Review Issues** (Dec 2025) - Error handling, logging, test coverage improvements
- **Stripe Foundation** (Dec 2025) - Schema, webhooks, checkout/portal routes, beta override. See `docs/billing/stripe-subscriptions.md`

---

## Related Documentation

- `docs/dev/CURRENT_IMPROVEMENT_PLAN.md` - Service role audit details
- `docs/billing/stripe-subscriptions.md` - Full Stripe implementation spec
- `memory/system-patterns.md` - Caching strategy and architecture patterns
- `docs/dev/archive/` - Completed plans for historical reference
