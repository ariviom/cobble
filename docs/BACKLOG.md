# Project Backlog

**Last Updated:** January 15, 2026
**Purpose:** Consolidated list of all outstanding and planned work

---

## High Priority (Blocking Launch)

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
| Flag | Min Tier | Free Limit |
|------|----------|------------|
| `identify.unlimited` | Plus | TBD |
| `lists.unlimited` | Plus | 3 lists |
| `search_party.unlimited` | Plus | 2 runs/month |
| `search_party.advanced` | Plus | - |
| `bricklink.byo_key` | Pro | - |
| `mocs.custom` | Pro | - |

See `docs/billing/stripe-subscriptions.md` for full spec.

---

## Medium Priority (Post-Launch)

### Multi-Device Sync

- [ ] Pull-on-login for multi-device sync (fetch user data from Supabase on new device)

### Error Handling & UX

- [ ] Hardening of error states and retries for search/inventory requests
- [ ] Surface normalized `AppError` codes in UI instead of generic messages
- [ ] Centralize non-blocking error toasts for Supabase flows (collection create/toggle, set status)

### Security Hardening

- [ ] Service Role Privilege Audit - audit 15 files using `getSupabaseServiceRoleClient`
  - Reduce footprint where anon/auth client would work
  - Document reasoning for remaining service role usages
  - See `docs/dev/CURRENT_IMPROVEMENT_PLAN.md` for details

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

### Stripe Post-Foundation

- [ ] Dunning/notifications: past_due/unpaid handling, email or in-app banners

---

## Low Priority (Nice-to-Have)

### Identify Flow Improvements

- [ ] Extract sub-pipelines from Identify backend into smaller pure helpers
- [ ] Add per-request budget to cap external calls
- [ ] Improve Identify UX with clearer sub-states ("Identifying...", "Finding sets...", "Using BrickLink-only data")
- [ ] Consider debouncing rapid candidate/color changes
- [ ] Cache "identify -> sets" resolutions in Supabase keyed by normalized part/color identifiers

### Architecture Refinement

- [ ] Refactor Supabase-owned state into lower-level owned-persistence service + higher-level migration coordinator hook
- [ ] Add lightweight telemetry/logging for Supabase write failures

### Testing

- [ ] Tests for CSV export generators (Rebrickable + BrickLink) and Rebrickable client retry/backoff behavior
- [ ] Expand automated tests around Identify and pricing flows (mocked RB/BL/Brickognize)
- [ ] Add end-to-end validation for CSV exports against Rebrickable/BrickLink import rules

### Stripe Future

- [ ] Yearly pricing surfaced in UI when ready
- [ ] Multi-currency/localized pricing
- [ ] Advanced tax/localization: per-country price availability if compliance requires
- [ ] Analytics/observability: event logging, latency/failure metrics on webhook handler

---

## Completed (Reference)

Major completed initiatives - see `docs/dev/archive/` for detailed plans:

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
