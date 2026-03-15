# Entitlement Override Table Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow specific email addresses to receive Plus-tier entitlements automatically, acting as a floor that coexists with paid subscriptions.

**Architecture:** A new `billing_entitlement_overrides` table stores email→tier mappings. The `getUserEntitlements()` function in `billing.ts` is extended to look up the authenticated user's email in this table and return the higher of the subscription tier and the override tier. Service-role-only access; managed via direct SQL in Supabase dashboard.

**Tech Stack:** Supabase (Postgres migration, RLS), TypeScript (billing service + entitlements tests), Vitest

---

## File Structure

| File                                                                | Action | Responsibility                                                       |
| ------------------------------------------------------------------- | ------ | -------------------------------------------------------------------- |
| `supabase/migrations/<timestamp>_billing_entitlement_overrides.sql` | Create | DDL: table, RLS, index                                               |
| `app/lib/services/billing.ts`                                       | Modify | Add `getEmailTierOverride()`, integrate into `getUserEntitlements()` |
| `app/lib/__tests__/entitlements-overrides.test.ts`                  | Create | Tests for override logic in `getUserEntitlements()`                  |

---

## Chunk 1: Database Migration + Service Logic + Tests

### Task 1: Create the migration

**Files:**

- Create: `supabase/migrations/<timestamp>_billing_entitlement_overrides.sql`

- [ ] **Step 1: Create the migration file**

```bash
npx supabase migration new billing_entitlement_overrides
```

- [ ] **Step 2: Write the migration SQL**

```sql
-- billing_entitlement_overrides: email-based tier floor for manual upgrades.
-- Managed via Supabase dashboard SQL; service_role access only.
-- Emails are auto-lowercased on insert/update via trigger.

create table if not exists public.billing_entitlement_overrides (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  tier text not null default 'plus' check (tier in ('plus', 'pro')),
  reason text,
  created_at timestamptz default now()
);

alter table public.billing_entitlement_overrides enable row level security;

-- Service-role only — no authenticated user access needed
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'billing_entitlement_overrides'
      and policyname = 'billing_entitlement_overrides_service_role_all'
  ) then
    create policy billing_entitlement_overrides_service_role_all
      on public.billing_entitlement_overrides
      for all
      to service_role
      using (true)
      with check (true);
  end if;
end$$;

-- Auto-lowercase email on insert/update to prevent case mismatch issues
create or replace function public.billing_entitlement_overrides_lowercase_email()
returns trigger as $$
begin
  new.email := lower(new.email);
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_lowercase_email on public.billing_entitlement_overrides;
create trigger trg_lowercase_email
  before insert or update on public.billing_entitlement_overrides
  for each row execute function public.billing_entitlement_overrides_lowercase_email();

-- Unique index on lowercase email for case-insensitive uniqueness
create unique index if not exists billing_entitlement_overrides_email_idx
  on public.billing_entitlement_overrides (email);
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/*_billing_entitlement_overrides.sql
git commit -m "feat: add billing_entitlement_overrides migration"
```

---

### Task 2: Regenerate Supabase types

**Files:**

- Modify: `supabase/types.ts` (auto-generated)

- [ ] **Step 1: Apply the migration locally**

```bash
npx supabase db reset
```

Or if local DB is already running:

```bash
npx supabase migration up
```

- [ ] **Step 2: Regenerate TypeScript types**

```bash
npm run generate-types
```

- [ ] **Step 3: Verify the new table appears in `supabase/types.ts`**

Search for `billing_entitlement_overrides` in the generated file. Confirm `Row`, `Insert`, `Update` types include `id`, `email`, `tier`, `reason`, `created_at`.

- [ ] **Step 4: Commit**

```bash
git add supabase/types.ts
git commit -m "chore: regenerate types for billing_entitlement_overrides"
```

---

### Task 3: Write the failing tests

**Files:**

- Create: `app/lib/__tests__/entitlements-overrides.test.ts`

The tests mock Supabase (including `auth.admin.getUserById`) to isolate `getUserEntitlements()`. They verify:

1. No override → subscription tier wins
2. Override exists, no subscription → override tier returned
3. Email found via `billing_customers` (skips auth admin lookup)
4. Same tier on both → floor behavior works
5. Subscription higher than override → subscription wins
6. Override higher than subscription → override wins
7. Override lookup failure → graceful fallback to subscription tier
8. No subscription + no override → free
9. Email lookup fails entirely → free
10. Auth returns null email → free

- [ ] **Step 1: Write the test file**

```typescript
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

// Mock the Supabase service role client before importing billing
const mockFrom = vi.fn();
const mockGetUserById = vi.fn();
const mockSupabase = {
  from: mockFrom,
  auth: { admin: { getUserById: mockGetUserById } },
};

vi.mock('@/app/lib/supabaseServiceRoleClient', () => ({
  getSupabaseServiceRoleClient: () => mockSupabase,
}));

vi.mock('@/app/lib/stripe/client', () => ({
  getStripeClient: () => ({}),
}));

import { getUserEntitlements } from '@/app/lib/services/billing';

// Helper to build a Supabase query chain mock (multi-row result, thenable)
function mockQuery(
  data: unknown[] | null,
  error: { message: string } | null = null
) {
  const result = { data, error };
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        ...result,
        then: (resolve: (v: typeof result) => void) =>
          Promise.resolve(result).then(resolve),
      }),
    }),
  };
}

// Helper for single-row result (.maybeSingle())
function mockSingleQuery(
  data: unknown | null,
  error: { message: string } | null = null
) {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({ data, error }),
      }),
    }),
  };
}

// Helper to configure the auth.admin.getUserById mock
function mockAuthUser(
  email: string | null,
  error: { message: string } | null = null
) {
  if (error) {
    mockGetUserById.mockResolvedValue({ data: null, error });
  } else {
    mockGetUserById.mockResolvedValue({
      data: { user: { email } },
      error: null,
    });
  }
}

describe('getUserEntitlements with overrides', () => {
  const userId = 'user-123';
  const userEmail = 'vip@example.com';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns subscription tier when no override exists', () => {
    // User has no billing_customers row, auth returns email, no override match
    mockFrom.mockImplementation((table: string) => {
      if (table === 'billing_subscriptions') {
        return mockQuery([{ tier: 'plus', status: 'active' }]);
      }
      if (table === 'billing_customers') {
        return mockSingleQuery(null); // no customer row
      }
      if (table === 'billing_entitlement_overrides') {
        return mockSingleQuery(null); // no override
      }
      return mockSingleQuery(null);
    });
    mockAuthUser(userEmail);

    return getUserEntitlements(userId).then(result => {
      expect(result.tier).toBe('plus');
    });
  });

  it('returns override tier when no active subscription', () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'billing_subscriptions') {
        return mockQuery([]); // no subscriptions
      }
      if (table === 'billing_customers') {
        return mockSingleQuery(null);
      }
      if (table === 'billing_entitlement_overrides') {
        return mockSingleQuery({ tier: 'plus' });
      }
      return mockSingleQuery(null);
    });
    mockAuthUser(userEmail);

    return getUserEntitlements(userId).then(result => {
      expect(result.tier).toBe('plus');
    });
  });

  it('uses email from billing_customers when available (skips auth lookup)', () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'billing_subscriptions') {
        return mockQuery([]);
      }
      if (table === 'billing_customers') {
        return mockSingleQuery({ email: userEmail }); // email found here
      }
      if (table === 'billing_entitlement_overrides') {
        return mockSingleQuery({ tier: 'plus' });
      }
      return mockSingleQuery(null);
    });
    // auth.admin should NOT be called when billing_customers has the email
    mockGetUserById.mockRejectedValue(new Error('should not be called'));

    return getUserEntitlements(userId).then(result => {
      expect(result.tier).toBe('plus');
      expect(mockGetUserById).not.toHaveBeenCalled();
    });
  });

  it('returns higher tier when both override and subscription exist (floor behavior)', () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'billing_subscriptions') {
        return mockQuery([{ tier: 'plus', status: 'active' }]);
      }
      if (table === 'billing_customers') {
        return mockSingleQuery({ email: userEmail });
      }
      if (table === 'billing_entitlement_overrides') {
        return mockSingleQuery({ tier: 'plus' }); // same tier — floor
      }
      return mockSingleQuery(null);
    });

    return getUserEntitlements(userId).then(result => {
      expect(result.tier).toBe('plus');
    });
  });

  it('subscription wins when higher than override', () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'billing_subscriptions') {
        return mockQuery([{ tier: 'pro', status: 'active' }]);
      }
      if (table === 'billing_customers') {
        return mockSingleQuery({ email: userEmail });
      }
      if (table === 'billing_entitlement_overrides') {
        return mockSingleQuery({ tier: 'plus' }); // override is lower
      }
      return mockSingleQuery(null);
    });

    return getUserEntitlements(userId).then(result => {
      expect(result.tier).toBe('pro');
    });
  });

  it('override wins when higher than subscription', () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'billing_subscriptions') {
        return mockQuery([{ tier: 'plus', status: 'active' }]);
      }
      if (table === 'billing_customers') {
        return mockSingleQuery({ email: userEmail });
      }
      if (table === 'billing_entitlement_overrides') {
        return mockSingleQuery({ tier: 'pro' }); // override is higher
      }
      return mockSingleQuery(null);
    });

    return getUserEntitlements(userId).then(result => {
      expect(result.tier).toBe('pro');
    });
  });

  it('falls back to subscription tier when override lookup fails', () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'billing_subscriptions') {
        return mockQuery([{ tier: 'plus', status: 'active' }]);
      }
      if (table === 'billing_customers') {
        return mockSingleQuery({ email: userEmail });
      }
      if (table === 'billing_entitlement_overrides') {
        return mockSingleQuery(null, { message: 'db error' });
      }
      return mockSingleQuery(null);
    });

    return getUserEntitlements(userId).then(result => {
      expect(result.tier).toBe('plus');
    });
  });

  it('returns free when no subscription and no override', () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'billing_subscriptions') {
        return mockQuery([]);
      }
      if (table === 'billing_customers') {
        return mockSingleQuery(null);
      }
      if (table === 'billing_entitlement_overrides') {
        return mockSingleQuery(null);
      }
      return mockSingleQuery(null);
    });
    mockAuthUser(userEmail);

    return getUserEntitlements(userId).then(result => {
      expect(result.tier).toBe('free');
    });
  });

  it('returns free when email lookup fails entirely', () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'billing_subscriptions') {
        return mockQuery([]);
      }
      if (table === 'billing_customers') {
        return mockSingleQuery(null); // no customer row
      }
      return mockSingleQuery(null);
    });
    // Auth lookup also fails
    mockAuthUser(null, { message: 'auth error' });

    return getUserEntitlements(userId).then(result => {
      expect(result.tier).toBe('free');
    });
  });

  it('returns free when auth returns user with null email', () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'billing_subscriptions') {
        return mockQuery([]);
      }
      if (table === 'billing_customers') {
        return mockSingleQuery(null);
      }
      return mockSingleQuery(null);
    });
    // Auth succeeds but email is null
    mockAuthUser(null);

    return getUserEntitlements(userId).then(result => {
      expect(result.tier).toBe('free');
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- --run app/lib/__tests__/entitlements-overrides.test.ts
```

Expected: Tests fail because `getUserEntitlements()` does not yet query `billing_entitlement_overrides` or look up the user's email.

- [ ] **Step 3: Commit**

```bash
git add app/lib/__tests__/entitlements-overrides.test.ts
git commit -m "test: add failing tests for entitlement overrides"
```

---

### Task 4: Implement the override lookup in billing.ts

**Files:**

- Modify: `app/lib/services/billing.ts:251-281` (`getUserEntitlements` function)

The changes:

1. Add a helper `getEmailTierOverride()` that looks up a user's email from `auth.users` (via the `billing_customers` table, which already has the email), then checks `billing_entitlement_overrides`.
2. Modify `getUserEntitlements()` to call this helper and return the higher tier.

- [ ] **Step 1: Add the `getEmailTierOverride` helper**

Add this function above `getUserEntitlements()` in `billing.ts`:

```typescript
/**
 * Check if the user's email has an entitlement override.
 * Returns the override tier or null if no override exists.
 * Looks up user email via auth admin API, then checks the overrides table.
 */
async function getEmailTierOverride(
  userId: string,
  supabase: SupabaseClient<Database>
): Promise<BillingTier | null> {
  // Look up the user's email. Try billing_customers first (cheap), fall back to auth.
  const { data: customer, error: customerError } = await supabase
    .from('billing_customers')
    .select('email')
    .eq('user_id', userId)
    .maybeSingle();

  let email: string | null = customer?.email ?? null;

  if (!email) {
    // User may not have a billing_customers row yet (never started checkout).
    // Fall back to auth.users via service role.
    const { data: authData, error: authError } =
      await supabase.auth.admin.getUserById(userId);
    if (authError || !authData?.user?.email) {
      if (authError) {
        logger.error('billing.override_email_lookup_failed', {
          error: authError.message,
        });
      }
      return null;
    }
    email = authData.user.email;
  }

  const { data: override, error: overrideError } = await supabase
    .from('billing_entitlement_overrides')
    .select('tier')
    .eq('email', email.toLowerCase())
    .maybeSingle();

  if (overrideError) {
    logger.error('billing.override_lookup_failed', {
      error: overrideError.message,
    });
    return null;
  }

  return (override?.tier as BillingTier) ?? null;
}
```

- [ ] **Step 2: Modify `getUserEntitlements` to integrate overrides**

Replace the current `getUserEntitlements` function body to incorporate the override as a floor:

```typescript
export async function getUserEntitlements(
  userId: string,
  options?: { supabase?: SupabaseClient<Database> }
): Promise<{ tier: BillingTier }> {
  const supabase = options?.supabase ?? getSupabaseServiceRoleClient();

  const tierRank: Record<BillingTier, number> = { free: 0, plus: 1, pro: 2 };

  // Fetch subscription tier and override tier in parallel
  const [subscriptionResult, overrideTier] = await Promise.all([
    supabase
      .from('billing_subscriptions')
      .select('tier,status')
      .eq('user_id', userId),
    getEmailTierOverride(userId, supabase),
  ]);

  // Resolve best subscription tier
  let bestTier: BillingTier = 'free';

  if (subscriptionResult.error) {
    logger.error('billing.entitlements_query_failed', {
      error: subscriptionResult.error.message,
    });
  } else {
    for (const row of subscriptionResult.data ?? []) {
      if (!row.tier || !row.status) continue;
      if (!ACTIVE_STATUSES.includes(row.status as Stripe.Subscription.Status)) {
        continue;
      }
      if (tierRank[row.tier as BillingTier] > tierRank[bestTier]) {
        bestTier = row.tier as BillingTier;
      }
    }
  }

  // Apply override as floor (highest wins)
  if (overrideTier && tierRank[overrideTier] > tierRank[bestTier]) {
    bestTier = overrideTier;
  }

  return { tier: bestTier };
}
```

- [ ] **Step 3: Run tests**

```bash
npm test -- --run app/lib/__tests__/entitlements-overrides.test.ts
```

Expected: All tests pass.

- [ ] **Step 4: Run existing billing tests to confirm no regressions**

```bash
npm test -- --run app/lib/__tests__/billing.test.ts
```

Expected: All existing tests still pass.

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit
```

Expected: No type errors.

- [ ] **Step 6: Commit**

```bash
git add app/lib/services/billing.ts app/lib/__tests__/entitlements-overrides.test.ts
git commit -m "feat: integrate entitlement overrides into getUserEntitlements"
```

---

### Task 5: Verify case-insensitive email handling

The migration auto-lowercases emails via trigger. The service query also lowercases (`.eq('email', email.toLowerCase())`). Verify with a test:

- [ ] **Step 1: Add a test for case-insensitive email matching**

Add to the test file:

```typescript
it('lowercases email before override lookup', () => {
  mockFrom.mockImplementation((table: string) => {
    if (table === 'billing_subscriptions') {
      return mockQuery([]);
    }
    if (table === 'billing_customers') {
      return mockSingleQuery(null);
    }
    if (table === 'billing_entitlement_overrides') {
      return mockSingleQuery({ tier: 'plus' });
    }
    return mockSingleQuery(null);
  });
  // Auth returns uppercase email — service should lowercase before querying overrides
  mockAuthUser('VIP@EXAMPLE.COM');

  return getUserEntitlements(userId).then(result => {
    expect(result.tier).toBe('plus');
  });
});
```

- [ ] **Step 2: Run the full test suite**

```bash
npm test -- --run app/lib/__tests__/entitlements-overrides.test.ts
```

Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add app/lib/__tests__/entitlements-overrides.test.ts
git commit -m "test: add case-insensitive email override test"
```

---

### Task 6: Invalidate entitlements cache when overrides change

The entitlements cache (5-minute LRU) in `entitlements.ts` will naturally pick up override changes within 5 minutes. No code change needed — this is acceptable for a manually-managed table. Document this behavior:

- [ ] **Step 1: Add a comment in `getEmailTierOverride`**

Add a brief note above the function:

```typescript
/**
 * Check if the user's email has an entitlement override.
 * Returns the override tier or null if no override exists.
 *
 * Note: Results are cached by the upstream entitlements LRU cache (5-min TTL).
 * Override changes take effect within 5 minutes without manual cache invalidation.
 */
```

- [ ] **Step 2: Commit**

```bash
git add app/lib/services/billing.ts
git commit -m "docs: note cache TTL behavior for entitlement overrides"
```

---

## Usage

To grant a user Plus access, run this SQL in the Supabase dashboard:

```sql
INSERT INTO billing_entitlement_overrides (email, tier, reason)
VALUES ('user@example.com', 'plus', 'Beta tester');
```

Email casing doesn't matter — the trigger auto-lowercases on insert.

To revoke:

```sql
DELETE FROM billing_entitlement_overrides WHERE email = 'user@example.com';
```

Changes take effect within 5 minutes (entitlements cache TTL).
