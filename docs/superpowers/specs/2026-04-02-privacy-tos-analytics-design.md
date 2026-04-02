# Privacy, TOS & Analytics Overhaul

**Date:** 2026-04-02
**Status:** Design
**Operator:** Andrew Coffin, sole proprietor, Oregon, United States

---

## Overview

Rewrite the privacy policy and terms of service, add PostHog analytics, implement self-service account deletion, and add group session data cleanup. Code changes are built first so policies describe reality, not promises.

## Decisions Made

| Decision                        | Choice                                       | Rationale                                                      |
| ------------------------------- | -------------------------------------------- | -------------------------------------------------------------- |
| Analytics provider              | PostHog (US Cloud, cookieless mode)          | Privacy-friendly, generous free tier, no consent banner needed |
| Account deletion                | Self-service in Account Settings             | GDPR requirement, CASCADE DELETE handles cleanup               |
| Inactive account purge          | No auto-purge                                | Minimal storage cost, avoid surprising returning users         |
| Session cleanup                 | 30-day retention for ended sessions          | Aligns with free tier 2-sessions/month entitlement             |
| Participant scrub on deletion   | Display name → "Deleted User"                | Respects right to erasure while preserving session history     |
| DNT handling                    | Disclose non-response in privacy policy only | No legal enforcement, cookieless mode already limits tracking  |
| Legal entity                    | Sole proprietor (Andrew Coffin, OR)          | LLC deferred until post-beta paid launch                       |
| Governing law                   | State of Oregon, United States               | Operator's jurisdiction                                        |
| Beta references                 | Removed                                      | Open beta rolling into full release, no definitive exit date   |
| Stripe subscription on deletion | Auto-cancel via Stripe API                   | No manual step required from user                              |
| Plain-language summary          | Skipped                                      | Policies already readable                                      |

---

## 1. Account Deletion

### Backend

**Route handler:** `DELETE /api/account`

- Requires authenticated session
- Delegates to service layer

**Service:** `app/lib/services/accountService.ts`

- If user has an active Stripe subscription, cancel it immediately via Stripe API (`stripe.subscriptions.cancel` with `invoice_now: false, prorate: false`)
- If user is hosting any active Search Party sessions, end them (`is_active = false`, set `ended_at`)
- Scrub display name to "Deleted User" in `group_session_participants` where `user_id` matches
- Call Supabase Admin API `auth.admin.deleteUser(userId)`
- CASCADE DELETE handles: `user_profiles`, `user_preferences`, `user_recent_sets`, `user_sets`, `user_set_parts`, `user_parts_inventory`, `user_minifigs`, `user_lists`, `user_list_items`, `user_feedback`, `usage_counters`, `billing_customers`, `billing_subscriptions`
- `group_session_participants.user_id` is SET NULL (display name already scrubbed)
- `group_sessions` where user is host are CASCADE deleted (and their participants with them)

### Frontend

**Location:** Account Settings tab (`app/account/components/AccountTab.tsx`)

**Button:** Positioned at the bottom of the page, styled as a secondary button with danger/warning red color. Visually distinct from the logout button — not a primary danger button, but clearly a destructive action.

**Confirmation flow:** Uses the same inline-swap modal pattern from `CollectionsModalContent.tsx`:

1. User clicks "Delete Account"
2. Modal opens with warning: _"This will permanently delete your account and all associated data including your inventory, collections, and preferences. Active subscriptions will be automatically cancelled. This cannot be undone."_
3. Text input requiring the user to type "DELETE" to confirm
4. Cancel (ghost) + Delete Account (danger) buttons
5. Loading state during deletion
6. On success: sign out and redirect to landing page

### Edge Cases

- **Active Stripe subscription:** Cancelled automatically before deletion — no user action needed
- **Active Search Party host:** Sessions ended automatically before deletion
- **Request fails mid-deletion:** Service layer operations are ordered so partial failure is safe (Stripe cancel is idempotent, session cleanup is best-effort, user deletion is the final step)

---

## 2. Group Session Cleanup

### Ended Session Purge (cron)

**New pg_cron job:** `cleanup-ended-sessions`

- Schedule: Daily at 03:00 UTC (alongside existing cleanup jobs)
- SQL: `DELETE FROM group_sessions WHERE is_active = false AND ended_at < now() - interval '30 days'`
- CASCADE on the table handles deleting associated `group_session_participants` records

### Migration

Single Supabase migration covering:

- The new cron job

Note: Participant display name scrubbing on account deletion is handled in the service layer (not a database trigger), since it needs to run before the CASCADE and coordinates with other pre-deletion steps.

---

## 3. PostHog Integration

### Setup

**Package:** `posthog-js`

**Environment variable:** `NEXT_PUBLIC_POSTHOG_KEY`

**Configuration:**

```typescript
{
  api_host: 'https://us.i.posthog.com',
  persistence: 'memory',           // cookieless mode
  capture_pageview: false,          // manual via router events
  capture_pageleave: true,
  loaded: (posthog) => {
    if (process.env.NODE_ENV === 'development') posthog.debug();
  }
}
```

### File Structure

- `app/components/analytics/PostHogProvider.tsx` — client-only provider wrapping the app
- `app/lib/analytics/events.ts` — typed event name constants and helper functions

### Provider Integration

- Dynamic import in root layout with `ssr: false`
- Pageview capture via Next.js `usePathname()` + `useSearchParams()` in a `PostHogPageview` component

### Events (initial set)

| Event                  | Trigger Location                |
| ---------------------- | ------------------------------- |
| `set_opened`           | Set tab opened                  |
| `identify_used`        | Identify feature submission     |
| `export_created`       | CSV/XML export generated        |
| `search_party_started` | Host creates session            |
| `search_party_joined`  | Participant joins session       |
| `collection_created`   | New list created                |
| `account_created`      | Post-signup                     |
| `account_deleted`      | Pre-deletion (in service layer) |

### What is NOT tracked

- No user identification (anonymous only)
- No session replay
- No PII in event properties (no emails, no inventory details)
- No server-side tracking (client SDK only)

---

## 4. Privacy Policy Rewrite

Full rewrite of `app/privacy/page.tsx`. Key changes from current version:

### Structural Changes

- Add operator identification (Andrew Coffin, sole proprietor, Oregon)
- Add effective date alongside last-updated date
- Uncomment Stripe/payment sections
- Add five new sections: Data Retention, Breach Notification, International Transfers, Do Not Track, AI Training

### Section-by-Section

**1. Introduction**

- Name operator: "Brick Party is operated by Andrew Coffin, a sole proprietor based in Oregon, United States."

**2. Information We Collect**

- Account Information: "email address, display name, and authentication provider identifier" (not vague "basic profile information")
- Specify Google OAuth scopes: openid, profile, email
- Inventory Data: unchanged
- Identify Feature: unchanged
- Usage Information: add PostHog disclosure — anonymous cookieless analytics, page views, feature usage, basic device info (browser type, screen size), no persistent identifiers
- Payment Information (uncomment): Stripe collects payment info, we store only subscription tier/status metadata

**3. How We Use Your Information**

- Uncomment Stripe bullet
- Add: "Analyze anonymous usage patterns via PostHog to improve the application"
- Rest unchanged

**4. Data Storage and Security**

- Unchanged

**5. Third-Party Services**

- Add: PostHog (anonymous product analytics)
- Add: Sentry (error monitoring and reporting)
- Uncomment: Stripe (subscription management and payment processing)
- Keep: Supabase, Rebrickable, BrickLink, Brickognize

**6. Your Data Rights**

GDPR rights (EU users):

- Access your personal data
- Rectify inaccurate data
- Erase your data (right to be forgotten)
- Restrict processing
- Data portability
- Object to processing
- Withdraw consent
- Lodge a complaint with your local supervisory authority

CCPA rights (California residents):

- Right to know what personal information is collected
- Right to delete personal information
- Right to opt-out of sale of personal information ("We do not sell personal information")
- Right to non-discrimination for exercising privacy rights

All users:

- Self-service account deletion in account settings
- Data export in account settings
- Contact us for any other rights request

**7. Cookies and Tracking**

- Essential cookies for authentication and session management
- IndexedDB for local catalog cache and inventory storage
- PostHog operates in cookieless mode (memory-only, no persistent identifiers)
- No third-party advertising cookies

**8. Data Retention**

- Account data: retained until user deletes account, no auto-purge
- Group session data: ended sessions deleted after 30 days
- Pricing observations: deleted after 180 days
- Usage counters: deleted when expired
- Webhook events: deleted after 30 days
- Anonymous users: data stored only in browser, never server-side

**9. Data Breach Notification**

- Affected users notified via email within 72 hours of discovering a breach

**10. International Data Transfers**

- Supabase and PostHog hosted in the United States
- Data may be transferred to and stored in the US

**11. Do Not Track**

- "We do not currently respond to Do Not Track browser signals. Our analytics operate in cookieless mode and do not persistently track users across sessions."

**12. AI Training**

- "We do not use your personal data or inventory data to train machine learning or artificial intelligence models."

**13. Children's Privacy**

- Unchanged (under 13, COPPA)

**14. Changes to This Policy**

- Unchanged

**15. Contact Us**

- Feedback form in account settings

**Footer:** LEGO trademark disclaimer (unchanged)

---

## 5. Terms of Service Rewrite

Full rewrite of `app/terms/page.tsx`. Key changes from current version:

### Structural Changes

- Add operator identification
- Set governing law to Oregon
- Remove all beta references
- Remove Beta Service section entirely
- Uncomment Subscriptions and Payments section (minus beta access bullet)
- Add effective date
- Add four new sections: Group Sessions, Dispute Resolution, Indemnification, Minimum Age

### Section-by-Section

**1. Acceptance of Terms** — unchanged

**2. Description of Service**

- Remove "currently provided in a beta phase"
- Keep "We reserve the right to modify, suspend, or discontinue any aspect of the Service at any time."

**3. Subscriptions and Payments** (uncomment)

- Billing via Stripe, recurring authorization
- Cancel anytime via account settings or billing portal, access continues through billing period
- Non-refundable except as required by law
- Remove the "Beta Access" bullet

**4. User Accounts** — unchanged

**5. Acceptable Use** (additions)

- Add: "Use data obtained from the Service to train machine learning or artificial intelligence models"
- Add: "Use the Service if you are under 13 years of age"

**6. Rate Limits and Quotas** — unchanged

**7. Third-Party Services** (addition)

- Add: "Export features generate files compatible with Rebrickable and BrickLink formats. Your use of those files on third-party platforms is subject to those platforms' terms of service."

**8. Group Sessions (Search Party)** (new)

- When hosting, participants can see the set inventory and mark pieces found
- Participant display names are visible to all session members
- Session data (participants, pieces found) retained for 30 days after session ends, then permanently deleted
- If a participant deletes their account, their display name is replaced with "Deleted User" in session history

**9. Intellectual Property** — unchanged

**10. User Data** (revised)

- Retain ownership language
- Self-service account deletion available in account settings
- Deletion permanently removes all account data (inventory, collections, preferences)
- Active subscriptions automatically cancelled upon deletion

**11. Disclaimer of Warranties** — unchanged

**12. Limitation of Liability** — unchanged

**13. Indemnification** (new)

- Users agree to indemnify and hold harmless Brick Party and its operator from claims, damages, or expenses arising from violation of Terms or misuse of the Service

**14. Termination** — unchanged

**15. Dispute Resolution** (new)

- Parties will attempt informal resolution for 30 days before legal action
- Legal proceedings in courts located in the State of Oregon

**16. Governing Law**

- "State of Oregon, United States" (replaces vague "jurisdiction in which Brick Party operates")

**17. Changes to Terms** — unchanged

**18. Contact** — unchanged

**Footer:** LEGO trademark disclaimer (unchanged)

---

## Implementation Order

Code-first, then policies:

1. **Account deletion** — migration (if needed), service, route handler, UI
2. **Group session cleanup** — migration (cron job), service layer scrubbing
3. **PostHog integration** — package, provider, events, instrumentation
4. **Privacy policy rewrite** — full page rewrite reflecting all changes
5. **Terms of service rewrite** — full page rewrite reflecting all changes
6. **Backlog/memory updates** — update BACKLOG.md and active-context.md
