# Privacy, TOS & Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add self-service account deletion, group session cleanup, PostHog analytics, and rewrite the privacy policy and terms of service.

**Architecture:** Account deletion is a service-layer operation called by a thin route handler, with UI in the Account Settings tab. PostHog runs client-side in cookieless mode via a provider in the root layout. Group session cleanup is a pg_cron job. Privacy/TOS are full page rewrites.

**Tech Stack:** Next.js 15, Supabase (auth admin API, pg_cron), Stripe SDK, PostHog JS, React 19

**Spec:** `docs/superpowers/specs/2026-04-02-privacy-tos-analytics-design.md`

---

## File Structure

**Create:**

- `app/lib/services/accountDeletion.ts` — account deletion orchestration (Stripe cancel, session cleanup, participant scrub, user delete)
- `app/api/account/delete/route.ts` — DELETE endpoint, thin HTTP layer
- `app/account/components/DeleteAccountModal.tsx` — confirmation modal with type-to-confirm
- `supabase/migrations/<timestamp>_cleanup_ended_group_sessions.sql` — cron job for 30-day session purge
- `app/components/providers/posthog-provider.tsx` — PostHog client provider
- `app/lib/analytics/events.ts` — typed event constants and capture helper
- `app/components/analytics/PostHogPageview.tsx` — pageview tracking via router

**Modify:**

- `app/account/components/AccountTab.tsx` — add delete account button and modal trigger
- `app/layout.tsx` — add PostHog provider
- `app/privacy/page.tsx` — full rewrite
- `app/terms/page.tsx` — full rewrite
- `package.json` — add `posthog-js` dependency

---

### Task 1: Account Deletion Service

**Files:**

- Create: `app/lib/services/accountDeletion.ts`

- [ ] **Step 1: Create the account deletion service**

```typescript
// app/lib/services/accountDeletion.ts
import 'server-only';

import { getStripeClient } from '@/app/lib/stripe/client';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabaseServiceRoleClient';
import { logger } from '@/lib/metrics';

export async function deleteUserAccount(userId: string): Promise<void> {
  const supabase = getSupabaseServiceRoleClient();
  const stripe = getStripeClient();

  // 1. Cancel any active Stripe subscriptions
  const { data: subscriptions } = await supabase
    .from('billing_subscriptions')
    .select('stripe_subscription_id, status')
    .eq('user_id', userId)
    .in('status', ['active', 'trialing', 'past_due']);

  if (subscriptions && subscriptions.length > 0) {
    for (const sub of subscriptions) {
      try {
        await stripe.subscriptions.cancel(sub.stripe_subscription_id, {
          invoice_now: false,
          prorate: false,
        });
        logger.info('account_deletion.subscription_cancelled', {
          userId,
          subscriptionId: sub.stripe_subscription_id,
        });
      } catch (err) {
        // Log but continue — subscription may already be cancelled in Stripe
        logger.error('account_deletion.subscription_cancel_failed', {
          userId,
          subscriptionId: sub.stripe_subscription_id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  // 2. End any active Search Party sessions hosted by this user
  const { error: sessionError } = await supabase
    .from('group_sessions')
    .update({ is_active: false, ended_at: new Date().toISOString() })
    .eq('host_user_id', userId)
    .eq('is_active', true);

  if (sessionError) {
    logger.error('account_deletion.session_end_failed', {
      userId,
      error: sessionError.message,
    });
  }

  // 3. Scrub display name in group session participants
  const { error: scrubError } = await supabase
    .from('group_session_participants')
    .update({ display_name: 'Deleted User' })
    .eq('user_id', userId);

  if (scrubError) {
    logger.error('account_deletion.participant_scrub_failed', {
      userId,
      error: scrubError.message,
    });
  }

  // 4. Delete the user from auth (CASCADE handles all dependent tables)
  const { error: deleteError } = await supabase.auth.admin.deleteUser(userId);

  if (deleteError) {
    logger.error('account_deletion.user_delete_failed', {
      userId,
      error: deleteError.message,
    });
    throw new Error('Failed to delete user account');
  }

  logger.info('account_deletion.completed', { userId });
}
```

- [ ] **Step 2: Verify the file compiles**

Run: `npx tsc --noEmit`
Expected: No errors related to `accountDeletion.ts`

- [ ] **Step 3: Commit**

```bash
git add app/lib/services/accountDeletion.ts
git commit -m "feat: add account deletion service"
```

---

### Task 2: Account Deletion API Route

**Files:**

- Create: `app/api/account/delete/route.ts`

- [ ] **Step 1: Create the route handler**

```typescript
// app/api/account/delete/route.ts
import 'server-only';

import { NextResponse, type NextRequest } from 'next/server';

import { withCsrfProtection } from '@/app/lib/middleware/csrf';
import { deleteUserAccount } from '@/app/lib/services/accountDeletion';
import { getSupabaseAuthServerClient } from '@/app/lib/supabaseAuthServerClient';
import { logger } from '@/lib/metrics';

export const DELETE = withCsrfProtection(async (_request: NextRequest) => {
  try {
    const supabase = await getSupabaseAuthServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: 'unauthorized', message: 'Not authenticated.' },
        { status: 401 }
      );
    }

    await deleteUserAccount(user.id);

    // Sign out the session after deletion
    await supabase.auth.signOut();

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error('api.account_delete.failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: 'deletion_failed', message: 'Failed to delete account.' },
      { status: 500 }
    );
  }
});
```

- [ ] **Step 2: Verify the file compiles**

Run: `npx tsc --noEmit`
Expected: No errors related to `delete/route.ts`

- [ ] **Step 3: Commit**

```bash
git add app/api/account/delete/route.ts
git commit -m "feat: add account deletion API route"
```

---

### Task 3: Delete Account Modal Component

**Files:**

- Create: `app/account/components/DeleteAccountModal.tsx`

- [ ] **Step 1: Create the delete account modal**

This follows the same inline-swap confirmation pattern from `CollectionsModalContent.tsx` (lines 131-167). The modal shows a warning, requires typing "DELETE" to confirm, and has Cancel/Delete buttons.

```tsx
// app/account/components/DeleteAccountModal.tsx
'use client';

import { Button } from '@/app/components/ui/Button';
import { Input } from '@/app/components/ui/Input';
import { Modal } from '@/app/components/ui/Modal';
import { Trash2 } from 'lucide-react';
import { useState } from 'react';

type DeleteAccountModalProps = {
  open: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
};

export function DeleteAccountModal({
  open,
  onClose,
  onConfirm,
}: DeleteAccountModalProps) {
  const [confirmText, setConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isConfirmed = confirmText.trim().toUpperCase() === 'DELETE';

  const handleDelete = async () => {
    if (!isConfirmed || isDeleting) return;
    setIsDeleting(true);
    setError(null);
    try {
      await onConfirm();
    } catch {
      setError('Failed to delete account. Please try again.');
      setIsDeleting(false);
    }
  };

  const handleClose = () => {
    if (isDeleting) return;
    setConfirmText('');
    setError(null);
    onClose();
  };

  return (
    <Modal open={open} title="Delete Account" onClose={handleClose}>
      <div className="flex flex-col gap-4">
        <div className="text-sm text-foreground-muted">
          <p>
            This will permanently delete your account and all associated data
            including your inventory, collections, and preferences. Active
            subscriptions will be automatically cancelled.
          </p>
          <p className="mt-3 font-semibold text-danger">
            This action cannot be undone.
          </p>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-bold tracking-wide text-foreground-muted uppercase">
            Type DELETE to confirm
          </label>
          <Input
            type="text"
            value={confirmText}
            onChange={e => setConfirmText(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') void handleDelete();
            }}
            placeholder="DELETE"
            size="sm"
            disabled={isDeleting}
          />
        </div>

        {error && (
          <p className="text-body-sm font-medium text-danger">{error}</p>
        )}

        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="md"
            className="flex-1"
            onClick={handleClose}
            disabled={isDeleting}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            size="md"
            className="flex-1 gap-1.5"
            onClick={() => void handleDelete()}
            disabled={!isConfirmed || isDeleting}
          >
            <Trash2 className="h-4 w-4" />
            {isDeleting ? 'Deleting…' : 'Delete Account'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 2: Verify the file compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add app/account/components/DeleteAccountModal.tsx
git commit -m "feat: add delete account confirmation modal"
```

---

### Task 4: Wire Delete Account into AccountTab

**Files:**

- Modify: `app/account/components/AccountTab.tsx`

- [ ] **Step 1: Add imports and state**

Add these imports at the top of `AccountTab.tsx`:

```typescript
import { DeleteAccountModal } from './DeleteAccountModal';
```

Add state inside the `AccountTab` component, after the existing logout state (line 63):

```typescript
// Delete account state
const [showDeleteModal, setShowDeleteModal] = useState(false);
```

- [ ] **Step 2: Add the delete handler**

Add this handler after `handleLogout` (after line 233):

```typescript
const handleDeleteAccount = async () => {
  const response = await fetch('/api/account/delete', {
    method: 'DELETE',
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error('Delete failed');
  }

  const supabase = getSupabaseBrowserClient();
  await supabase.auth.signOut({ scope: 'local' });
  clearThemePersistence();
  setUser(null);
  setProfile(null);
  router.push('/');
};
```

- [ ] **Step 3: Add the Delete Account card and modal**

Insert a new card section between the "Sign Out" card (ends at line 437 `)}`) and the "Legal links" div (line 439). Also add the modal:

```tsx
{
  /* Delete Account Section */
}
{
  isLoggedIn && (
    <Card>
      <CardHeader>
        <CardTitle>Delete account</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-body text-foreground-muted">
          Permanently delete your Brick Party account and all associated data.
          This action cannot be undone.
        </p>
        <div className="mt-4">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="border-danger/50 text-danger hover:bg-danger/5"
            onClick={() => setShowDeleteModal(true)}
          >
            Delete account
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

{
  /* Delete Account Modal */
}
{
  isLoggedIn && (
    <DeleteAccountModal
      open={showDeleteModal}
      onClose={() => setShowDeleteModal(false)}
      onConfirm={handleDeleteAccount}
    />
  );
}
```

- [ ] **Step 4: Verify the file compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Manually test**

1. Navigate to Account Settings
2. Verify the "Delete account" button appears below "Sign out", styled with red text and outline border — visually distinct from the "Log out" button
3. Click "Delete account" — modal should open
4. Verify "Delete Account" button in modal is disabled until "DELETE" is typed
5. Type "DELETE" and click — should delete account, sign out, redirect to `/`

- [ ] **Step 6: Commit**

```bash
git add app/account/components/AccountTab.tsx
git commit -m "feat: wire delete account button and modal into account settings"
```

---

### Task 5: Group Session Cleanup Migration

**Files:**

- Create: `supabase/migrations/<timestamp>_cleanup_ended_group_sessions.sql`

- [ ] **Step 1: Create the migration**

Run: `npx supabase migration new cleanup_ended_group_sessions`

This creates a timestamped file. Write the following SQL into it:

```sql
-- Delete ended group sessions older than 30 days.
-- CASCADE on group_sessions deletes associated participant records.
-- 30 days aligns with the free-tier Search Party entitlement (2/month).
select cron.schedule(
  'cleanup-ended-group-sessions',
  '0 3 * * *',   -- daily at 03:00 UTC
  $$DELETE FROM public.group_sessions
    WHERE is_active = false
      AND ended_at IS NOT NULL
      AND ended_at < now() - interval '30 days'$$
);
```

- [ ] **Step 2: Verify migration applies cleanly**

Run: `npx supabase db reset`
Expected: All migrations apply without error

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/*_cleanup_ended_group_sessions.sql
git commit -m "feat: add cron job to purge ended group sessions after 30 days"
```

---

### Task 6: Install PostHog

**Files:**

- Modify: `package.json`

- [ ] **Step 1: Install posthog-js**

Run: `npm install posthog-js`

- [ ] **Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add posthog-js dependency"
```

---

### Task 7: PostHog Provider and Pageview Tracking

**Files:**

- Create: `app/components/providers/posthog-provider.tsx`
- Create: `app/components/analytics/PostHogPageview.tsx`
- Create: `app/lib/analytics/events.ts`

- [ ] **Step 1: Create the events module**

```typescript
// app/lib/analytics/events.ts

/** Typed PostHog event names. Keep alphabetical. */
export const AnalyticsEvent = {
  ACCOUNT_CREATED: 'account_created',
  ACCOUNT_DELETED: 'account_deleted',
  COLLECTION_CREATED: 'collection_created',
  EXPORT_CREATED: 'export_created',
  IDENTIFY_USED: 'identify_used',
  SEARCH_PARTY_JOINED: 'search_party_joined',
  SEARCH_PARTY_STARTED: 'search_party_started',
  SET_OPENED: 'set_opened',
} as const;

export type AnalyticsEventName =
  (typeof AnalyticsEvent)[keyof typeof AnalyticsEvent];
```

- [ ] **Step 2: Create the pageview component**

```tsx
// app/components/analytics/PostHogPageview.tsx
'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { usePostHog } from 'posthog-js/react';
import { useEffect } from 'react';

export function PostHogPageview() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const posthog = usePostHog();

  useEffect(() => {
    if (pathname && posthog) {
      let url = window.origin + pathname;
      if (searchParams.toString()) {
        url = url + '?' + searchParams.toString();
      }
      posthog.capture('$pageview', { $current_url: url });
    }
  }, [pathname, searchParams, posthog]);

  return null;
}
```

- [ ] **Step 3: Create the PostHog provider**

```tsx
// app/components/providers/posthog-provider.tsx
'use client';

import posthog from 'posthog-js';
import { PostHogProvider as PHProvider } from 'posthog-js/react';
import { Suspense, useEffect, useState } from 'react';

import { PostHogPageview } from '@/app/components/analytics/PostHogPageview';

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const [isReady, setIsReady] = useState(false);
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;

  useEffect(() => {
    if (!key) return;

    posthog.init(key, {
      api_host: 'https://us.i.posthog.com',
      persistence: 'memory',
      capture_pageview: false,
      capture_pageleave: true,
      loaded: ph => {
        if (process.env.NODE_ENV === 'development') ph.debug();
      },
    });

    setIsReady(true);

    return () => {
      posthog.shutdown();
    };
  }, [key]);

  if (!key || !isReady) return <>{children}</>;

  return (
    <PHProvider client={posthog}>
      <Suspense fallback={null}>
        <PostHogPageview />
      </Suspense>
      {children}
    </PHProvider>
  );
}
```

- [ ] **Step 4: Verify the files compile**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add app/lib/analytics/events.ts app/components/analytics/PostHogPageview.tsx app/components/providers/posthog-provider.tsx
git commit -m "feat: add PostHog provider with cookieless mode and pageview tracking"
```

---

### Task 8: Wire PostHog Provider into Root Layout

**Files:**

- Modify: `app/layout.tsx`

- [ ] **Step 1: Add import**

Add this import at the top of `app/layout.tsx`:

```typescript
import { PostHogProvider } from '@/app/components/providers/posthog-provider';
```

- [ ] **Step 2: Wrap children with PostHogProvider**

In the `<body>` JSX, wrap the content inside `<AuthProvider>` with `<PostHogProvider>`. The PostHog provider should be inside `AuthProvider` but outside `EntitlementsProvider` so it can capture events from any level.

Change the body content (lines 212-232) from:

```tsx
<AuthProvider initialUser={initialUser} initialHandle={initialHandle}>
  <EntitlementsProvider initialEntitlements={initialEntitlements}>
    <SentryUserContext />
    <DunningBanner subscriptionStatus={subscriptionStatus} />
    <SyncProvider>
      <ThemeProvider
        initialTheme={initialTheme}
        initialThemeColor={dbThemeColor ?? undefined}
        isAuthenticated={!!initialUser}
      >
        <ReactQueryProvider>
          <ErrorBoundary>
            {children}
            <TourCard />
          </ErrorBoundary>
        </ReactQueryProvider>
      </ThemeProvider>
    </SyncProvider>
  </EntitlementsProvider>
</AuthProvider>
```

to:

```tsx
<AuthProvider initialUser={initialUser} initialHandle={initialHandle}>
  <PostHogProvider>
    <EntitlementsProvider initialEntitlements={initialEntitlements}>
      <SentryUserContext />
      <DunningBanner subscriptionStatus={subscriptionStatus} />
      <SyncProvider>
        <ThemeProvider
          initialTheme={initialTheme}
          initialThemeColor={dbThemeColor ?? undefined}
          isAuthenticated={!!initialUser}
        >
          <ReactQueryProvider>
            <ErrorBoundary>
              {children}
              <TourCard />
            </ErrorBoundary>
          </ReactQueryProvider>
        </ThemeProvider>
      </SyncProvider>
    </EntitlementsProvider>
  </PostHogProvider>
</AuthProvider>
```

- [ ] **Step 3: Verify the file compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Manually test**

1. Add `NEXT_PUBLIC_POSTHOG_KEY=phc_test` to `.env.local` (or your real key)
2. Open the app in the browser with DevTools open
3. In dev mode, PostHog debug mode should be active — look for `[PostHog]` logs in the console
4. Navigate between pages and verify `$pageview` events are logged

- [ ] **Step 5: Commit**

```bash
git add app/layout.tsx
git commit -m "feat: wire PostHog provider into root layout"
```

---

### Task 9: Instrument Analytics Events

**Files:**

- Multiple existing files (see step details)

This task adds `posthog.capture()` calls at the key touchpoints. Since PostHog is client-side and these hooks/components are all client components, we import `usePostHog` from `posthog-js/react` and call `capture()` inline.

- [ ] **Step 1: Create a thin capture helper for non-hook contexts**

Some event sites (like the account deletion service) are server-side where PostHog isn't available. For those, we'll capture the event on the client side before/after the API call. The `AnalyticsEvent` constants from `events.ts` are sufficient — no extra helper needed for client components since they use `usePostHog()` directly.

For client components, the pattern is:

```typescript
import { usePostHog } from 'posthog-js/react';
import { AnalyticsEvent } from '@/app/lib/analytics/events';

// Inside the component:
const posthog = usePostHog();

// At the event site:
posthog?.capture(AnalyticsEvent.SET_OPENED, { set_num: '6989-1' });
```

This step is documentation only — no code to write.

- [ ] **Step 2: Add `account_deleted` event to AccountTab**

In `app/account/components/AccountTab.tsx`, in the `handleDeleteAccount` function, capture the event before the API call:

```typescript
import { usePostHog } from 'posthog-js/react';
import { AnalyticsEvent } from '@/app/lib/analytics/events';
```

Inside the component:

```typescript
const posthog = usePostHog();
```

In `handleDeleteAccount`, before the fetch call:

```typescript
posthog?.capture(AnalyticsEvent.ACCOUNT_DELETED);
```

- [ ] **Step 3: Verify compilation**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add app/account/components/AccountTab.tsx
git commit -m "feat: instrument account_deleted analytics event"
```

**Note:** The remaining analytics events (`set_opened`, `identify_used`, `export_created`, `search_party_started`, `search_party_joined`, `collection_created`, `account_created`) should be instrumented in a follow-up task. They each require finding the right hook/component and adding a one-line `posthog?.capture()` call. The pattern is identical to what's shown above. This plan focuses on the infrastructure and the one event that's tied to the account deletion feature we're building.

---

### Task 10: Privacy Policy Rewrite

**Files:**

- Modify: `app/privacy/page.tsx`

- [ ] **Step 1: Rewrite the privacy policy page**

Replace the entire content of `app/privacy/page.tsx` with the updated policy. The full content is large, so here are the key structural changes — implement the complete page:

**Metadata:** Update description.

**Header:**

- "Last Updated: April 2, 2026"
- Add "Effective: April 2, 2026" on a second line

**Section 1 — Introduction:**

- Add: "Brick Party is operated by Andrew Coffin, a sole proprietor based in Oregon, United States."

**Section 2 — Information We Collect:**

- Account Information: "When you create an account, we collect your email address, display name, and authentication provider identifier. If you sign up with Google, we receive your email address and display name via Google OAuth (using the openid, profile, and email scopes)."
- Uncomment the payment information paragraph about Stripe
- Inventory Data: unchanged
- Identify Feature: unchanged
- Usage Information: Add PostHog disclosure: "We use PostHog for anonymous, cookieless product analytics. This collects page views, feature usage events, and basic device information (browser type, screen size). No persistent identifiers or cookies are used for analytics purposes."

**Section 3 — How We Use Your Information:**

- Uncomment Stripe bullet
- Add bullet: "Analyze anonymous usage patterns to improve the application"

**Section 4 — Data Storage and Security:** unchanged

**Section 5 — Third-Party Services:**

- Add: PostHog — Anonymous product analytics
- Add: Sentry — Error monitoring and reporting
- Uncomment: Stripe — Subscription management and payment processing

**Section 6 — Your Data Rights (expanded):**
Restructure into three subsections:

GDPR Rights (EU Users):

- Access your personal data
- Rectify inaccurate data
- Erase your data (right to be forgotten)
- Restrict processing of your data
- Data portability
- Object to processing
- Withdraw consent at any time
- Lodge a complaint with your local supervisory authority

CCPA Rights (California Residents):

- Right to know what personal information is collected
- Right to delete personal information
- Right to opt-out of sale of personal information — note: "We do not sell personal information"
- Right to non-discrimination for exercising privacy rights

All Users:

- Delete your account and all associated data via account settings
- Export your data through account settings
- Contact us for any other data rights request

**Section 7 — Cookies and Tracking (expanded):**

- Essential cookies for authentication and session management
- IndexedDB for local catalog cache and inventory storage
- PostHog operates in cookieless mode (memory-only persistence, no persistent identifiers)
- No third-party advertising cookies or tracking pixels

**Section 8 — Data Retention (new):**

- Account data is retained until you delete your account. We do not automatically purge inactive accounts.
- Group session data (Search Party): ended sessions and participant records are deleted 30 days after the session ends.
- Pricing observations: deleted after 180 days.
- Usage counters: deleted when the tracking window expires.
- Webhook events: deleted 30 days after processing.
- Anonymous users: all data is stored locally in your browser (IndexedDB) and is never transmitted to our servers.

**Section 9 — Data Breach Notification (new):**

- In the event of a data breach affecting your personal information, we will notify affected users via email within 72 hours of discovering the breach.

**Section 10 — International Data Transfers (new):**

- Our services (Supabase, PostHog) are hosted in the United States. If you access the Service from outside the United States, your data may be transferred to and stored in the United States.

**Section 11 — Do Not Track (new):**

- "We do not currently respond to Do Not Track browser signals. However, our analytics operate in cookieless mode and do not persistently track users across sessions."

**Section 12 — Artificial Intelligence (new):**

- "We do not use your personal data or inventory data to train machine learning or artificial intelligence models."

**Section 13 — Children's Privacy:** unchanged

**Section 14 — Changes to This Policy:** unchanged

**Section 15 — Contact Us:** unchanged

**Footer:** LEGO trademark disclaimer unchanged

- [ ] **Step 2: Verify the page renders**

Start the dev server (if not running) and navigate to `/privacy`. Verify all sections render correctly, links work, and no layout issues.

- [ ] **Step 3: Commit**

```bash
git add app/privacy/page.tsx
git commit -m "feat: rewrite privacy policy with GDPR/CCPA rights, data retention, PostHog disclosure"
```

---

### Task 11: Terms of Service Rewrite

**Files:**

- Modify: `app/terms/page.tsx`

- [ ] **Step 1: Rewrite the terms of service page**

Replace the entire content of `app/terms/page.tsx`. Key structural changes:

**Metadata:** Update description.

**Header:**

- "Last Updated: April 2, 2026"
- Add "Effective: April 2, 2026"

**Section 1 — Acceptance of Terms:** unchanged

**Section 2 — Description of Service:**

- Remove "currently provided in a beta phase"
- Keep: "We reserve the right to modify, suspend, or discontinue any aspect of the Service at any time."

**Section 3 — Subscriptions and Payments (uncomment):**

- Billing via Stripe, recurring authorization
- Cancel anytime via account settings or billing portal, access continues through billing period
- Non-refundable except as required by law
- Remove the "Beta Access" bullet

**Section 4 — User Accounts:** unchanged (renumber from 3 to 4)

**Section 5 — Acceptable Use (additions):**

- Add: "Use data obtained from the Service to train machine learning or artificial intelligence models"
- Add: "Use the Service if you are under 13 years of age"

**Section 6 — Rate Limits and Quotas:** unchanged

**Section 7 — Third-Party Services (addition):**

- Add: "Export features generate files compatible with Rebrickable and BrickLink formats. Your use of those files on third-party platforms is subject to those platforms' terms of service."

**Section 8 — Group Sessions (new):**

- When you host a Search Party session, participants can see the set inventory and mark pieces found.
- Participant display names are visible to all session members.
- Session data (participants, pieces found) is retained for 30 days after the session ends, then permanently deleted.
- If a participant deletes their account, their display name is replaced with "Deleted User" in session history.

**Section 9 — Intellectual Property:** unchanged

**Section 10 — User Data (revised):**

- Retain ownership language
- Add: "You can delete your account and all associated data at any time through account settings. Deletion is permanent and cannot be undone. Active subscriptions are automatically cancelled upon account deletion."

**Section 11 — Disclaimer of Warranties:** unchanged

**Section 12 — Limitation of Liability:** unchanged

**Section 13 — Indemnification (new):**

- "You agree to indemnify, defend, and hold harmless Brick Party and its operator from and against any claims, damages, losses, liabilities, costs, and expenses (including reasonable legal fees) arising out of or related to your violation of these Terms or your misuse of the Service."

**Section 14 — Termination:** unchanged

**Section 15 — Dispute Resolution (new):**

- "Before pursuing legal action, both parties agree to attempt to resolve any dispute informally for at least 30 days. Any legal proceedings shall be brought exclusively in the courts located in the State of Oregon, United States."

**Section 16 — Governing Law:**

- Change to: "These Terms shall be governed by and construed in accordance with the laws of the State of Oregon, United States, without regard to its conflict of law provisions."

**Section 17 — Changes to Terms:** unchanged

**Section 18 — Contact:** unchanged

**Footer:** LEGO trademark disclaimer unchanged

Remove the old Section 11 (Beta Service) entirely.

- [ ] **Step 2: Verify the page renders**

Navigate to `/terms`. Verify all sections render correctly.

- [ ] **Step 3: Commit**

```bash
git add app/terms/page.tsx
git commit -m "feat: rewrite terms of service with group sessions, dispute resolution, AI prohibition"
```

---

### Task 12: Final Verification

- [ ] **Step 1: Type check**

Run: `npx tsc --noEmit`
Expected: Clean pass

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: No errors

- [ ] **Step 3: Run tests**

Run: `npm test -- --run`
Expected: All existing tests pass (no tests broken by these changes)

- [ ] **Step 4: Manual smoke test**

1. Account deletion: create a test account, add some data, delete it, verify redirect to `/`
2. Group session cleanup: verify migration applied (check `cron.job` table)
3. PostHog: verify pageview events fire in DevTools console (debug mode)
4. Privacy policy: read through at `/privacy`, verify all sections present
5. Terms of service: read through at `/terms`, verify all sections present

- [ ] **Step 5: Commit any remaining fixes**

```bash
git add -A
git commit -m "chore: final verification and cleanup"
```
