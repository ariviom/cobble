# Active Context

## Current Focus

- **Pre-Launch:** Stripe configuration, entitlements E2E testing, onboarding flow, marketing page review
- **BrickLink API Compliance** — Code complete. Contact `apisupport@bricklink.com` pre-launch.
- Keep MVP flows stable. Preserve anonymous/local-only experience; signed-in users sync to Supabase.
- **PostHog analytics live** — cookieless mode, US Cloud. Remaining events to instrument: set_opened, identify_used, export_created, search_party_started/joined, collection_created, account_created.

## Pre-Launch Remaining

See `docs/BACKLOG.md` for full checklist. Key areas:

1. **Stripe config + testing** — Dashboard setup, env vars, E2E test all flows (see `docs/dev/STRIPE_GATING_LAUNCH_CHECKLIST.md`)
2. **Onboarding** — First-set experience, feature discovery, tier awareness (not built)
3. **Marketing page** — Review landing page for launch readiness
4. **Entitlements testing** — Thorough end-to-end validation of all gates and quotas

## Recently Completed (Apr 2026)

- Admin dashboard (`/admin`) — users list + detail (reuses `PublicUserCollectionOverview`), feedback viewer with category tabs; gated by Supabase `auth.users.app_metadata.role='admin'` JWT claim. Service-role queries bypass RLS; APIs return 404 to non-admins (no leak). Extracted `fetchPublicCollectionPayload` helper so admin detail and `/collection/[handle]` share the same data assembly.
- Privacy policy rewrite (15 sections: GDPR/CCPA rights, data retention, breach notification, PostHog/Sentry disclosure, AI training prohibition)
- Terms of service rewrite (18 sections: subscriptions active, group sessions, dispute resolution, indemnification, Oregon governing law, beta references removed)
- Self-service account deletion (service → API → modal with type-to-confirm, auto-cancels Stripe, scrubs participant names)
- PostHog analytics integration (cookieless mode, pageview tracking, typed event constants)
- Group session cleanup cron (30-day purge for ended sessions)

## Previously Completed (Mar 2026)

- Delta sync overhaul (server-versioned, watermark-based, refresh-on-focus, cross-tab)
- Collection parts: missing view redesign with contained set cards
- SyncIndicator replaced with error-only toast
- Collection import/export (JSON backup, BrickScan CSV/XML, Rebrickable sets import)
- Docs cleanup: archived 31 completed spec/plan files, consolidated BACKLOG.md

## Active Decisions

- MVP fully usable without auth; Supabase accounts are additive
- **Data sources**: Rebrickable catalog for entity data; BrickLink API for pricing only
- **BrickLink pricing is free for all users** (BL ToS)
- **Two tiers at launch: Free + Plus.** Pro deferred. Schema supports Pro.
- **Plus includes**: unlimited tabs, identifies, lists, Search Party, sync, part rarity

## Notes

- **Target test sets**: 1788, 6781, 6989, 40597, 21322
- **Pricing**: USD + `country_code=US` default; currency/country preference is future work
- 573 tests passing (67 test files), clean tsc
