# Feature Gating + Billing UI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enforce Free/Plus tier limits across the app, add billing UI (account tab, pricing page, upgrade modals, dunning banner), and enable 14-day trials.

**Architecture:** SSR-preloaded entitlements in root layout → `EntitlementsProvider` context → `useEntitlements()` hook for client components. API routes check entitlements server-side independently. Shared `UpgradeModal` for all feature gates. Stripe Portal for subscription management. See `docs/plans/2026-02-26-feature-gating-billing-ui-design.md` for the full design.

**Tech Stack:** Next.js App Router, React Context, Zustand, Supabase (Postgres + RLS), Stripe (Checkout + Billing Portal), Vitest

**Key reference files:**

- Entitlements service: `app/lib/services/entitlements.ts` (`getEntitlements()`, `hasFeature()`, `Entitlements` type)
- Auth provider pattern: `app/components/providers/auth-provider.tsx`
- Modal pattern: `app/components/ui/Modal.tsx`
- Existing checkout route: `app/api/billing/create-checkout-session/route.ts`
- Billing spec: `docs/billing/stripe-subscriptions.md`

---

### Task 1: Feature Flag Migration

Add missing feature flag seeds for `tabs.unlimited` and `rarity.enabled`.

**Files:**

- Create: `supabase/migrations/<timestamp>_add_tabs_rarity_feature_flags.sql`

**Step 1: Create the migration**

```bash
cd /home/drew/cobble && supabase migration new add_tabs_rarity_feature_flags
```

**Step 2: Write the migration SQL**

Open the created file in `supabase/migrations/` and write:

```sql
INSERT INTO public.feature_flags (key, description, min_tier, rollout_pct, is_enabled)
VALUES
  ('tabs.unlimited', 'Unlimited open tabs (free capped at 3)', 'plus', 100, true),
  ('rarity.enabled', 'Part rarity badges and filters', 'plus', 100, true)
ON CONFLICT (key) DO UPDATE SET
  description = EXCLUDED.description,
  min_tier = EXCLUDED.min_tier,
  rollout_pct = EXCLUDED.rollout_pct,
  is_enabled = EXCLUDED.is_enabled;
```

**Step 3: Apply the migration locally**

```bash
supabase migration up
```

Expected: Migration applies successfully.

**Step 4: Commit**

```bash
git add supabase/migrations/*add_tabs_rarity_feature_flags*
git commit -m "Add tabs.unlimited and rarity.enabled feature flag seeds"
```

---

### Task 2: EntitlementsProvider

Create the React context provider and `useEntitlements()` hook. Follows the same pattern as `auth-provider.tsx`.

**Files:**

- Create: `app/components/providers/entitlements-provider.tsx`
- Create: `app/components/providers/__tests__/entitlements-provider.test.tsx`

**Step 1: Write the failing tests**

Create `app/components/providers/__tests__/entitlements-provider.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  EntitlementsProvider,
  useEntitlements,
} from '../entitlements-provider';

function TestConsumer() {
  const ent = useEntitlements();
  return (
    <div>
      <span data-testid="tier">{ent.tier}</span>
      <span data-testid="isPlus">{String(ent.isPlus)}</span>
      <span data-testid="hasTabs">
        {String(ent.hasFeature('tabs.unlimited'))}
      </span>
    </div>
  );
}

describe('EntitlementsProvider', () => {
  it('defaults to free tier when initialEntitlements is null', () => {
    render(
      <EntitlementsProvider initialEntitlements={null}>
        <TestConsumer />
      </EntitlementsProvider>
    );
    expect(screen.getByTestId('tier').textContent).toBe('free');
    expect(screen.getByTestId('isPlus').textContent).toBe('false');
    expect(screen.getByTestId('hasTabs').textContent).toBe('false');
  });

  it('exposes Plus entitlements when provided', () => {
    const plusEntitlements = {
      tier: 'plus' as const,
      features: ['tabs.unlimited', 'lists.unlimited', 'rarity.enabled'],
      featureFlagsByKey: {},
    };
    render(
      <EntitlementsProvider initialEntitlements={plusEntitlements}>
        <TestConsumer />
      </EntitlementsProvider>
    );
    expect(screen.getByTestId('tier').textContent).toBe('plus');
    expect(screen.getByTestId('isPlus').textContent).toBe('true');
    expect(screen.getByTestId('hasTabs').textContent).toBe('true');
  });

  it('throws when useEntitlements is used outside provider', () => {
    // Suppress React error boundary console output
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<TestConsumer />)).toThrow(
      'useEntitlements must be used within an EntitlementsProvider'
    );
    spy.mockRestore();
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npm test -- --run app/components/providers/__tests__/entitlements-provider.test.tsx
```

Expected: FAIL — module not found.

**Step 3: Implement the provider**

Create `app/components/providers/entitlements-provider.tsx`:

```tsx
'use client';

import {
  createContext,
  useContext,
  useMemo,
  type PropsWithChildren,
} from 'react';

import type { Entitlements } from '@/app/lib/services/entitlements';

type EntitlementsContextValue = {
  tier: Entitlements['tier'];
  features: string[];
  isPlus: boolean;
  hasFeature: (key: string) => boolean;
};

const EntitlementsContext = createContext<EntitlementsContextValue | null>(
  null
);

const FREE_DEFAULTS: EntitlementsContextValue = {
  tier: 'free',
  features: [],
  isPlus: false,
  hasFeature: () => false,
};

type Props = PropsWithChildren<{
  initialEntitlements: Entitlements | null;
}>;

export function EntitlementsProvider({ initialEntitlements, children }: Props) {
  const value = useMemo<EntitlementsContextValue>(() => {
    if (!initialEntitlements) return FREE_DEFAULTS;
    const featureSet = new Set(initialEntitlements.features);
    return {
      tier: initialEntitlements.tier,
      features: initialEntitlements.features,
      isPlus:
        initialEntitlements.tier === 'plus' ||
        initialEntitlements.tier === 'pro',
      hasFeature: (key: string) => featureSet.has(key),
    };
  }, [initialEntitlements]);

  return (
    <EntitlementsContext.Provider value={value}>
      {children}
    </EntitlementsContext.Provider>
  );
}

export function useEntitlements(): EntitlementsContextValue {
  const ctx = useContext(EntitlementsContext);
  if (!ctx) {
    throw new Error(
      'useEntitlements must be used within an EntitlementsProvider'
    );
  }
  return ctx;
}
```

**Step 4: Run tests to verify they pass**

```bash
npm test -- --run app/components/providers/__tests__/entitlements-provider.test.tsx
```

Expected: 3 tests PASS.

**Step 5: Commit**

```bash
git add app/components/providers/entitlements-provider.tsx app/components/providers/__tests__/entitlements-provider.test.tsx
git commit -m "Add EntitlementsProvider with useEntitlements hook"
```

---

### Task 3: SSR Entitlements Preload + DunningBanner

Wire `EntitlementsProvider` into the root layout with SSR preloading. Add a `DunningBanner` for `past_due` subscriptions.

**Files:**

- Modify: `app/layout.tsx`
- Create: `app/components/dunning-banner.tsx`

**Step 1: Add entitlements preload to root layout**

In `app/layout.tsx`:

1. Add import at top:

```tsx
import { EntitlementsProvider } from '@/app/components/providers/entitlements-provider';
import { DunningBanner } from '@/app/components/dunning-banner';
import {
  getEntitlements,
  type Entitlements,
} from '@/app/lib/services/entitlements';
```

2. After the `initialUser` fetch block (after profile/theme loading, still inside the `try`), add:

```tsx
let initialEntitlements: Entitlements | null = null;
let subscriptionStatus: string | null = null;
```

Then inside the `if (user)` block, after loading theme/profile, add:

```tsx
initialEntitlements = await getEntitlements(user.id);

// Load subscription status for dunning banner
const { data: sub } = await supabase
  .from('billing_subscriptions')
  .select('status')
  .eq('user_id', user.id)
  .in('status', ['active', 'trialing', 'past_due'])
  .order('created_at', { ascending: false })
  .limit(1)
  .maybeSingle();
subscriptionStatus = sub?.status ?? null;
```

Note: This uses the auth server client (not service role) because `billing_subscriptions` has RLS allowing owner select. Verify this works — if RLS blocks the query, switch to `getCatalogWriteClient()` (service role) with the user_id filter.

3. Wrap with `EntitlementsProvider` and add `DunningBanner` in the JSX. The provider hierarchy becomes:

```tsx
<AuthProvider initialUser={initialUser} initialHandle={initialHandle}>
  <EntitlementsProvider initialEntitlements={initialEntitlements}>
    <SentryUserContext />
    <DunningBanner subscriptionStatus={subscriptionStatus} />
    <SyncProvider>
      <ThemeProvider ...>
        <ReactQueryProvider>
          <ErrorBoundary>{children}</ErrorBoundary>
        </ReactQueryProvider>
      </ThemeProvider>
    </SyncProvider>
  </EntitlementsProvider>
</AuthProvider>
```

**Step 2: Create DunningBanner component**

Create `app/components/dunning-banner.tsx`:

```tsx
'use client';

import { useCallback, useState } from 'react';

type Props = {
  subscriptionStatus: string | null;
};

export function DunningBanner({ subscriptionStatus }: Props) {
  const [portalLoading, setPortalLoading] = useState(false);

  const openPortal = useCallback(async () => {
    setPortalLoading(true);
    try {
      const res = await fetch('/api/billing/create-portal-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } finally {
      setPortalLoading(false);
    }
  }, []);

  if (subscriptionStatus !== 'past_due') return null;

  return (
    <div className="flex items-center justify-center gap-3 bg-amber-100 px-4 py-2 text-sm text-amber-900 dark:bg-amber-900/30 dark:text-amber-200">
      <span>
        Your payment failed — update your payment method to keep Plus features.
      </span>
      <button
        onClick={openPortal}
        disabled={portalLoading}
        className="shrink-0 rounded-md bg-amber-800 px-3 py-1 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50 dark:bg-amber-700 dark:hover:bg-amber-600"
      >
        {portalLoading ? 'Loading...' : 'Update Payment'}
      </button>
    </div>
  );
}
```

**Step 3: Type check**

```bash
npx tsc --noEmit
```

Expected: No errors.

**Step 4: Verify dev server renders correctly**

Open the app in the browser. Confirm no rendering errors. The dunning banner should not appear (no `past_due` subscriptions exist).

**Step 5: Commit**

```bash
git add app/layout.tsx app/components/dunning-banner.tsx
git commit -m "Wire SSR entitlements preload and dunning banner into root layout"
```

---

### Task 4: Checkout Trial Period

Add 14-day trial to Stripe checkout session creation.

**Files:**

- Modify: `app/api/billing/create-checkout-session/route.ts`
- Modify: Test file if one exists (check `app/api/billing/__tests__/`)

**Step 1: Add trial_period_days to checkout session**

In `app/api/billing/create-checkout-session/route.ts`, find the `stripe.checkout.sessions.create()` call. In the `subscription_data` object, add `trial_period_days`:

```tsx
subscription_data: {
  metadata: { user_id: user.id },
  trial_period_days: 14,
},
```

**Step 2: Type check**

```bash
npx tsc --noEmit
```

Expected: No errors.

**Step 3: Commit**

```bash
git add app/api/billing/create-checkout-session/route.ts
git commit -m "Add 14-day trial to Plus checkout"
```

---

### Task 5: UpgradeModal Component

Shared modal shown when free users hit a feature gate.

**Files:**

- Create: `app/components/upgrade-modal.tsx`
- Create: `app/components/__tests__/upgrade-modal.test.tsx`

**Step 1: Define feature gate config**

Decide on the feature descriptions used in the modal. Create a lookup:

| Feature Key              | Gate Message                                                |
| ------------------------ | ----------------------------------------------------------- |
| `tabs.unlimited`         | You've reached the free limit of 3 open tabs.               |
| `lists.unlimited`        | You've reached the free limit of 5 lists.                   |
| `identify.unlimited`     | You've used all your free identifications for today.        |
| `search_party.unlimited` | You've used your free Search Party sessions for this month. |
| `rarity.enabled`         | Part rarity insights are a Plus feature.                    |
| `sync.cloud`             | Cloud sync is a Plus feature.                               |

**Step 2: Write the failing tests**

Create `app/components/__tests__/upgrade-modal.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { UpgradeModal, type FeatureGateKey } from '../upgrade-modal';

describe('UpgradeModal', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <UpgradeModal open={false} feature="tabs.unlimited" onClose={vi.fn()} />
    );
    expect(container.innerHTML).toBe('');
  });

  it('shows feature-specific message when open', () => {
    render(
      <UpgradeModal open={true} feature="tabs.unlimited" onClose={vi.fn()} />
    );
    expect(screen.getByText(/free limit of 3 open tabs/i)).toBeTruthy();
    expect(screen.getByText(/upgrade to plus/i)).toBeTruthy();
  });

  it('renders View Plans link to /pricing', () => {
    render(
      <UpgradeModal open={true} feature="rarity.enabled" onClose={vi.fn()} />
    );
    const link = screen.getByRole('link', { name: /view plans/i });
    expect(link.getAttribute('href')).toBe('/pricing');
  });

  it('calls onClose when Maybe Later is clicked', () => {
    const onClose = vi.fn();
    render(
      <UpgradeModal open={true} feature="tabs.unlimited" onClose={onClose} />
    );
    fireEvent.click(screen.getByText(/maybe later/i));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
```

**Step 3: Run tests to verify they fail**

```bash
npm test -- --run app/components/__tests__/upgrade-modal.test.tsx
```

Expected: FAIL — module not found.

**Step 4: Implement UpgradeModal**

Create `app/components/upgrade-modal.tsx`:

```tsx
'use client';

import Link from 'next/link';

import { Modal } from '@/app/components/ui/Modal';

export type FeatureGateKey =
  | 'tabs.unlimited'
  | 'lists.unlimited'
  | 'identify.unlimited'
  | 'search_party.unlimited'
  | 'rarity.enabled'
  | 'sync.cloud';

const GATE_MESSAGES: Record<FeatureGateKey, string> = {
  'tabs.unlimited': "You've reached the free limit of 3 open tabs.",
  'lists.unlimited': "You've reached the free limit of 5 lists.",
  'identify.unlimited': "You've used all your free identifications for today.",
  'search_party.unlimited':
    "You've used your free Search Party sessions for this month.",
  'rarity.enabled': 'Part rarity insights are a Plus feature.',
  'sync.cloud': 'Cloud sync is a Plus feature.',
};

const PLUS_BENEFITS = [
  'Unlimited tabs, lists, and identifications',
  'Part rarity insights',
  'Cloud sync across devices',
  'Unlimited Search Party sessions',
];

type Props = {
  open: boolean;
  feature: FeatureGateKey;
  onClose: () => void;
};

export function UpgradeModal({ open, feature, onClose }: Props) {
  return (
    <Modal open={open} title="Upgrade to Plus" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <p className="text-foreground-muted">{GATE_MESSAGES[feature]}</p>
        <div className="bg-surface-raised rounded-lg border border-subtle p-4">
          <p className="mb-2 text-sm font-semibold text-foreground">
            Plus includes:
          </p>
          <ul className="space-y-1 text-sm text-foreground-muted">
            {PLUS_BENEFITS.map(b => (
              <li key={b} className="flex items-start gap-2">
                <span className="mt-0.5 text-green-600">&#10003;</span>
                {b}
              </li>
            ))}
          </ul>
        </div>
        <div className="flex gap-3">
          <Link
            href="/pricing"
            className="flex-1 rounded-lg bg-theme-primary px-4 py-2 text-center text-sm font-medium text-white hover:opacity-90"
          >
            View Plans
          </Link>
          <button
            onClick={onClose}
            className="hover:bg-surface-raised flex-1 rounded-lg border border-subtle px-4 py-2 text-center text-sm font-medium text-foreground-muted"
          >
            Maybe Later
          </button>
        </div>
      </div>
    </Modal>
  );
}
```

**Step 5: Run tests to verify they pass**

```bash
npm test -- --run app/components/__tests__/upgrade-modal.test.tsx
```

Expected: 4 tests PASS.

**Step 6: Commit**

```bash
git add app/components/upgrade-modal.tsx app/components/__tests__/upgrade-modal.test.tsx
git commit -m "Add shared UpgradeModal for feature gates"
```

---

### Task 6: Tab Limit Enforcement

Free users are limited to 3 open tabs. Show UpgradeModal when they try to open a 4th.

**Files:**

- Modify: `app/store/open-tabs.ts` — add `FREE_TAB_LIMIT` constant (for documentation), but the actual gate is in the calling component
- Find and modify: the component(s) that call `openTab()` — search for `openTab(` across the codebase to find all call sites
- Need to identify the right place to intercept (likely a wrapper hook or the tab bar component)

**Approach:** Rather than modifying every call site, create a `useGatedOpenTab()` hook that wraps `openTab()` with the entitlements check. Components switch to using this hook. The hook returns `{ openTab, upgradeModalProps }` — the component renders `<UpgradeModal {...upgradeModalProps} />`.

**Step 1: Write the hook + test**

Create `app/hooks/useGatedOpenTab.ts` (or add to an existing hooks file):

```tsx
'use client';

import { useCallback, useState } from 'react';

import { useEntitlements } from '@/app/components/providers/entitlements-provider';
import type { FeatureGateKey } from '@/app/components/upgrade-modal';
import { useOpenTabs } from '@/app/store/open-tabs';
import type { SetTab } from '@/app/store/open-tabs';

const FREE_TAB_LIMIT = 3;

type GatedOpenTabResult = {
  openTab: (tab: SetTab) => void;
  showUpgradeModal: boolean;
  dismissUpgradeModal: () => void;
  gateFeature: FeatureGateKey;
};

export function useGatedOpenTab(): GatedOpenTabResult {
  const { hasFeature } = useEntitlements();
  const { tabs, openTab: storeOpenTab } = useOpenTabs();
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  const openTab = useCallback(
    (tab: SetTab) => {
      // If tab already exists, always allow (just switches to it)
      const exists = tabs.some(
        t => t.type === 'set' && t.id.toLowerCase() === tab.id.toLowerCase()
      );
      if (exists) {
        storeOpenTab(tab);
        return;
      }

      // Count existing set tabs (not landing tabs)
      const setTabCount = tabs.filter(t => t.type === 'set').length;
      if (setTabCount >= FREE_TAB_LIMIT && !hasFeature('tabs.unlimited')) {
        setShowUpgradeModal(true);
        return;
      }
      storeOpenTab(tab);
    },
    [tabs, hasFeature, storeOpenTab]
  );

  return {
    openTab,
    showUpgradeModal,
    dismissUpgradeModal: useCallback(() => setShowUpgradeModal(false), []),
    gateFeature: 'tabs.unlimited',
  };
}
```

**Step 2: Find all `openTab()` call sites**

Search the codebase:

```bash
# The implementing agent should run:
# grep -r "openTab(" --include="*.tsx" --include="*.ts" app/
```

For each call site that opens new set tabs (not `openLandingTab` or `replaceLandingWithSet`):

- Import `useGatedOpenTab` instead of using `useOpenTabs().openTab` directly
- Add `<UpgradeModal open={showUpgradeModal} feature={gateFeature} onClose={dismissUpgradeModal} />` to the component JSX

If there are many call sites, consider creating a `<GatedUpgradeModal />` component that is rendered once at a high level (e.g., in layout or the tab bar) and triggered via a Zustand store flag, to avoid duplicating the modal across components.

**Step 3: Type check and test**

```bash
npx tsc --noEmit
```

**Step 4: Manual verification**

In the browser (with `BETA_ALL_ACCESS` unset or false):

1. Open 3 set tabs
2. Try to open a 4th → UpgradeModal should appear
3. Dismiss modal → tabs unchanged
4. Click an existing tab → should switch (no modal)

**Step 5: Commit**

```bash
git add app/hooks/useGatedOpenTab.ts [modified component files]
git commit -m "Enforce 3-tab limit for free tier with upgrade modal"
```

---

### Task 7: List Limit Enforcement

Free users are limited to 5 lists. Gate at both API and client level.

**Files:**

- Find: the API route or Supabase call that creates user lists (search for list/collection creation in `app/api/user-sets/` or related stores)
- Find: the client component with the "New List" / "Create List" button

**Step 1: Add API-level enforcement**

In the list creation route/handler, before creating the list:

```tsx
import { getEntitlements, hasFeature } from '@/app/lib/services/entitlements';

// After auth check:
const entitlements = await getEntitlements(user.id);
if (!hasFeature(entitlements, 'lists.unlimited')) {
  const { count } = await supabase
    .from('user_lists') // or whatever the table name is
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id);

  if ((count ?? 0) >= 5) {
    return NextResponse.json(
      {
        error: 'feature_unavailable',
        reason: 'list_limit_reached',
        message:
          "You've reached the free limit of 5 lists. Upgrade to Plus for unlimited lists.",
        limit: 5,
      },
      { status: 403 }
    );
  }
}
```

Note: The implementing agent needs to find the exact table name and route. Search for where lists are created — likely involves `user_sets` table or a custom lists table. Check the Zustand store at `app/store/user-sets.ts` for the creation flow.

**Step 2: Add client-level pre-check**

In the component with the "Create List" button, check entitlements before making the API call:

```tsx
const { hasFeature } = useEntitlements();
const [showUpgradeModal, setShowUpgradeModal] = useState(false);

const handleCreateList = () => {
  if (listCount >= 5 && !hasFeature('lists.unlimited')) {
    setShowUpgradeModal(true);
    return;
  }
  // proceed with creation...
};
```

Add `<UpgradeModal open={showUpgradeModal} feature="lists.unlimited" onClose={() => setShowUpgradeModal(false)} />` to the JSX.

**Step 3: Type check and test**

```bash
npx tsc --noEmit
```

**Step 4: Commit**

```bash
git add [modified files]
git commit -m "Enforce 5-list limit for free tier"
```

---

### Task 8: Identify + Search Party Upgrade Modal Wiring

These routes already return 403/429 with `error: 'feature_unavailable'` or `error: 'quota_exceeded'`. Wire the client components to show `UpgradeModal` on these responses instead of generic errors.

**Files:**

- Find: the client component that calls `/api/identify` (likely in the identify page or a hook)
- Find: the client component that calls `/api/group-sessions` POST (Search Party creation)

**Step 1: Find identify client handler**

Search for `fetch.*identify` or `api/identify` in client components. Find where the response is handled. Add:

```tsx
if (res.status === 429) {
  const data = await res.json();
  if (data.error === 'feature_unavailable' || data.error === 'quota_exceeded') {
    setUpgradeFeature('identify.unlimited');
    setShowUpgradeModal(true);
    return;
  }
}
```

**Step 2: Find Search Party host creation handler**

Search for `fetch.*group-sessions` POST calls. Add the same pattern:

```tsx
if (res.status === 429) {
  const data = await res.json();
  if (data.error === 'quota_exceeded') {
    setUpgradeFeature('search_party.unlimited');
    setShowUpgradeModal(true);
    return;
  }
}
```

**Step 3: Add UpgradeModal to both components**

Both components need `<UpgradeModal>` in their JSX with state for `open` and `feature`.

**Step 4: Manual test**

With `BETA_ALL_ACCESS` unset:

1. Use identify 5 times → 6th should show upgrade modal
2. Host 2 Search Party sessions → 3rd should show upgrade modal

**Step 5: Commit**

```bash
git add [modified files]
git commit -m "Show upgrade modal on identify and search party quota limits"
```

---

### Task 9: Rarity Gate

Rarity filter/sort/group options remain visible but disabled for free users with a "Plus" label. Clicking triggers the upgrade modal.

**Files:**

- Find: components that render rarity filter/sort/group options in inventory views. Search for `rarity` in `app/components/set/` directory.

**Step 1: Identify rarity UI touchpoints**

Search the codebase:

```
rarity filter, sort, group options in inventory controls
RarityBadge component usage
```

The implementing agent should find:

- Where rarity appears as a filter option (e.g., "Rarity" in filter dropdowns/tabs)
- Where rarity appears as a sort option
- Where rarity appears as a group-by option
- Where `RarityBadge` is rendered in inventory item views

**Step 2: Gate filter/sort/group options**

For each rarity option in filter/sort/group controls:

```tsx
const { hasFeature } = useEntitlements();
const [showUpgradeModal, setShowUpgradeModal] = useState(false);

// In the option rendering:
<button
  onClick={() => {
    if (!hasFeature('rarity.enabled')) {
      setShowUpgradeModal(true);
      return;
    }
    // apply the rarity filter/sort/group
  }}
>
  Rarity{' '}
  <span className="ml-1 text-xs font-medium text-theme-primary">(Plus)</span>
</button>;
```

Show the Plus label only when `!hasFeature('rarity.enabled')`.

**Step 3: Gate RarityBadge display**

In `app/components/set/items/RarityBadge.tsx` (or its parent), conditionally render:

```tsx
const { hasFeature } = useEntitlements();
if (!hasFeature('rarity.enabled')) return null;
```

Or alternatively, render the badge but blurred/dimmed as a teaser. Simpler to just hide it.

**Step 4: Add UpgradeModal to the relevant parent component**

```tsx
<UpgradeModal
  open={showUpgradeModal}
  feature="rarity.enabled"
  onClose={() => setShowUpgradeModal(false)}
/>
```

**Step 5: Type check and manual test**

```bash
npx tsc --noEmit
```

Verify: free user sees rarity options with "(Plus)" label, clicking shows modal. Plus user sees normal rarity controls.

**Step 6: Commit**

```bash
git add [modified files]
git commit -m "Gate rarity features behind Plus with visible-but-disabled controls"
```

---

### Task 10: Sync Gate (Pull-Only for Free)

Free users get read-only sync (data from Supabase flows down, but local changes don't push up).

**Files:**

- Modify: `app/components/providers/sync-provider.tsx` (or wherever SyncWorker is mounted)
- Modify: `app/lib/sync/SyncWorker.ts`

**Step 1: Pass sync mode from SyncProvider to SyncWorker**

`SyncProvider` is a client component inside `EntitlementsProvider`, so it can call `useEntitlements()`:

```tsx
import { useEntitlements } from '@/app/components/providers/entitlements-provider';

// In the SyncProvider component:
const { hasFeature } = useEntitlements();
const syncMode = hasFeature('sync.cloud') ? 'full' : 'pull-only';
```

Pass `syncMode` to the SyncWorker instance. The worker needs a method like `setSyncMode(mode: 'full' | 'pull-only')` or accept it as a constructor/init param.

**Step 2: Modify SyncWorker to respect sync mode**

In `SyncWorker.ts`, find the method that pushes local data to Supabase (likely called during `performSync()`). Guard it:

```tsx
if (this.syncMode === 'pull-only') {
  // Only pull from Supabase, skip push
  await this.pullFromSupabase();
  return;
}
// Full sync: pull + push
await this.pullFromSupabase();
await this.pushToSupabase();
```

The implementing agent needs to read the full SyncWorker to understand the sync flow and identify exactly which methods to guard. The key principle: `pull-only` mode still downloads data from Supabase (so downgraded users keep access) but never writes local changes back.

**Step 3: Type check**

```bash
npx tsc --noEmit
```

**Step 4: Commit**

```bash
git add app/components/providers/sync-provider.tsx app/lib/sync/SyncWorker.ts
git commit -m "Gate sync to pull-only for free tier"
```

---

### Task 11: Pricing Page

Public page with feature comparison table and tier-appropriate CTAs.

**Files:**

- Modify: `app/pricing/page.tsx` (already exists as a placeholder)

**Step 1: Read the existing pricing page**

Check `app/pricing/page.tsx` to see what's there now. It may be a beta placeholder.

**Step 2: Implement the pricing page**

The page is a server component that reads auth state and subscription status, then renders the comparison table with appropriate CTAs.

```tsx
// app/pricing/page.tsx
import { getSupabaseAuthServerClient } from '@/app/lib/supabaseAuthServerClient';
import { getEntitlements } from '@/app/lib/services/entitlements';
import { PricingPageClient } from './pricing-client';

export default async function PricingPage() {
  let tier: 'free' | 'plus' | 'pro' = 'free';
  let isAuthenticated = false;
  let subscriptionStatus: string | null = null;

  try {
    const supabase = await getSupabaseAuthServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      isAuthenticated = true;
      const entitlements = await getEntitlements(user.id);
      tier = entitlements.tier;

      const { data: sub } = await supabase
        .from('billing_subscriptions')
        .select('status')
        .eq('user_id', user.id)
        .in('status', ['active', 'trialing', 'past_due', 'canceled'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      subscriptionStatus = sub?.status ?? null;
    }
  } catch {
    // Swallow — default to free/unauth
  }

  return (
    <PricingPageClient
      tier={tier}
      isAuthenticated={isAuthenticated}
      subscriptionStatus={subscriptionStatus}
      plusMonthlyPriceId={process.env.STRIPE_PRICE_PLUS_MONTHLY ?? ''}
    />
  );
}
```

**Step 3: Implement the client component**

Create `app/pricing/pricing-client.tsx`:

This should render:

- Feature comparison table (use the table from the design doc)
- CTAs based on user state:
  - Not signed in → "Sign up free" button (to auth flow) + "Get more with Plus" button
  - Free, signed in → "Start 14-day free trial" button (calls checkout route)
  - Trialing/Active → "Current plan" badge (no action)
  - Canceled/Past Due → "Resubscribe" button (calls checkout route)

The "Start trial" / "Resubscribe" button calls:

```tsx
const handleCheckout = async () => {
  setLoading(true);
  try {
    const res = await fetch('/api/billing/create-checkout-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ priceId: plusMonthlyPriceId }),
    });
    const data = await res.json();
    if (data.url) window.location.href = data.url;
  } finally {
    setLoading(false);
  }
};
```

Use the existing design system components (`Button`, etc.) and Tailwind classes. Follow the styling patterns in other pages.

**Step 4: Type check and visual verification**

```bash
npx tsc --noEmit
```

Open `/pricing` in browser. Verify table renders, CTAs are correct for your auth state.

**Step 5: Commit**

```bash
git add app/pricing/
git commit -m "Add pricing page with feature comparison and tier-aware CTAs"
```

---

### Task 12: Account Billing Tab

Add a "Billing" tab to the account page showing subscription state and Portal access.

**Files:**

- Create: `app/account/components/BillingTab.tsx`
- Modify: `app/account/AccountPageClient.tsx` — add the tab
- Modify: `app/account/page.tsx` — SSR preload subscription data

**Step 1: Preload subscription data in server component**

In `app/account/page.tsx`, after loading user data, fetch the subscription:

```tsx
import type { Database } from '@/app/lib/database.types';

type SubscriptionRow =
  Database['public']['Tables']['billing_subscriptions']['Row'];

let initialSubscription: SubscriptionRow | null = null;

if (user) {
  const { data: sub } = await supabase
    .from('billing_subscriptions')
    .select('*')
    .eq('user_id', user.id)
    .in('status', ['active', 'trialing', 'past_due', 'canceled'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  initialSubscription = sub;
}
```

Pass `initialSubscription` as a prop to `AccountPageClient`.

**Step 2: Create BillingTab component**

Create `app/account/components/BillingTab.tsx`:

```tsx
'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';

import { Button } from '@/app/components/ui/Button';
import { useEntitlements } from '@/app/components/providers/entitlements-provider';

type SubscriptionRow = {
  status: string;
  tier: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean | null;
};

type Props = {
  subscription: SubscriptionRow | null;
};

export function BillingTab({ subscription }: Props) {
  const { tier } = useEntitlements();
  const [portalLoading, setPortalLoading] = useState(false);

  const openPortal = useCallback(async () => {
    setPortalLoading(true);
    try {
      const res = await fetch('/api/billing/create-portal-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } finally {
      setPortalLoading(false);
    }
  }, []);

  const status = subscription?.status;
  const periodEnd = subscription?.current_period_end
    ? new Date(subscription.current_period_end).toLocaleDateString()
    : null;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold">Current Plan</h3>
        {/* Render based on status — see design doc for state table */}
        {renderPlanStatus(
          tier,
          status,
          periodEnd,
          subscription?.cancel_at_period_end
        )}
      </div>
      <div className="flex gap-3">
        {renderCTAs(tier, status, openPortal, portalLoading)}
      </div>
    </div>
  );
}
```

Implement `renderPlanStatus` and `renderCTAs` as helper functions within the file following the state table from the design doc:

| State                  | Display                                                                                                  |
| ---------------------- | -------------------------------------------------------------------------------------------------------- |
| Free (no subscription) | "Free Plan" badge, "Upgrade to Plus" link → `/pricing`                                                   |
| Trialing               | "Plus (Trial)" badge, trial end date, "Manage Subscription" → Portal                                     |
| Active                 | "Plus" badge, renewal date, cancel note if applicable, "Manage Subscription" → Portal                    |
| Past Due               | "Plus" badge + warning, "Update Payment" → Portal                                                        |
| Canceled               | "Free Plan" badge, "Your Brick Party Plus subscription ended on [date]", "Resubscribe" link → `/pricing` |

**Step 3: Add Billing tab to AccountPageClient**

In `app/account/AccountPageClient.tsx`:

- Add import for `BillingTab`
- Add `<TabsTrigger value="billing">Billing</TabsTrigger>` to the TabsList
- Add `<TabsContent value="billing"><BillingTab subscription={initialSubscription} /></TabsContent>`

**Step 4: Type check and test**

```bash
npx tsc --noEmit
```

Visit `/account` → click "Billing" tab. Verify it shows "Free Plan" with upgrade CTA.

**Step 5: Commit**

```bash
git add app/account/
git commit -m "Add billing tab to account page"
```

---

### Task 13: Update Billing Success/Cancel Pages

Remove beta placeholder messaging from success and cancel pages.

**Files:**

- Modify: `app/billing/success/page.tsx`
- Modify: `app/billing/cancel/page.tsx`

**Step 1: Update success page**

Replace the beta text in `app/billing/success/page.tsx`:

```tsx
<header className="space-y-2">
  <p className="text-sm font-semibold text-green-600">Success</p>
  <h1 className="text-3xl font-bold">Welcome to Plus!</h1>
  <p className="text-foreground-muted">
    Your 14-day trial has started. You now have full access to all Plus
    features.
  </p>
</header>
<div className="flex flex-wrap gap-3">
  <Button href="/">Start exploring</Button>
  <Button href="/account" variant="outline">
    View account
  </Button>
</div>
```

**Step 2: Update cancel page**

Replace the beta text in `app/billing/cancel/page.tsx`:

```tsx
<header className="space-y-2">
  <p className="text-sm font-semibold text-amber-600">Checkout canceled</p>
  <h1 className="text-3xl font-bold">No worries</h1>
  <p className="text-foreground-muted">
    No charge was made. You can upgrade anytime from the pricing page.
  </p>
</header>
<div className="flex flex-wrap gap-3">
  <Button href="/pricing">View plans</Button>
  <Button href="/" variant="outline">
    Back to app
  </Button>
</div>
```

**Step 3: Commit**

```bash
git add app/billing/
git commit -m "Update billing success/cancel pages for launch"
```

---

### Task 14: Remove BETA_ALL_ACCESS Override

Once all gates and billing UI are in place, the beta override should be disabled for production. This is the final step before launch testing.

**Files:**

- Environment config (`.env`, `.env.local`, Vercel env vars)

**Step 1: Unset BETA_ALL_ACCESS**

Remove or set `BETA_ALL_ACCESS=false` in the environment. The entitlements resolver will now use real subscription data.

**Step 2: Full E2E Verification**

Test the complete flow:

1. Free user (no subscription) — verify all limits are enforced, upgrade modals work
2. Pricing page — verify CTAs are correct
3. Start checkout → complete in Stripe test mode → verify success page and Plus access
4. Account → Billing tab → manage subscription via Portal
5. Cancel subscription → verify downgrade messaging
6. Verify sync is pull-only for free, full for Plus

**Step 3: Commit**

```bash
git commit -m "Disable BETA_ALL_ACCESS for production gating"
```

---

## Task Dependency Map

```
Task 1 (flag migration) ────────────────────────────────────┐
Task 2 (EntitlementsProvider) ───┬── Task 3 (SSR preload) ──┤
                                 │                           │
Task 4 (trial period) ──────────┤                           │
                                 │                           │
Task 5 (UpgradeModal) ──────────┼── Task 6 (tabs gate)     │
                                 │── Task 7 (lists gate)    │
                                 │── Task 8 (identify/SP)   │
                                 │── Task 9 (rarity gate)   │
                                 │                           │
Task 3 ──────────────────────────┼── Task 10 (sync gate)    │
                                 │                           │
Task 4 ──────────────────────────┼── Task 11 (pricing page) │
                                 │── Task 12 (billing tab)  │
                                 │── Task 13 (success/cancel)│
                                 │                           │
                                 └── Task 14 (disable beta) ┘
```

**Critical path:** Task 2 → Task 3 → Task 5 → (Tasks 6-12 in parallel) → Task 14

Tasks 1 and 4 can happen at any point. Tasks 6-13 can be parallelized once Tasks 3 and 5 are done.
