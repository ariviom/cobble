import * as fs from 'node:fs';
import * as path from 'node:path';
import { getServiceClient } from './supabase';

/**
 * Test user definitions.
 *
 * All users are created in the local Supabase auth schema with known
 * passwords so tests can sign in directly. Subscriptions and entitlements
 * are seeded in the public schema to match each persona.
 */
export const TEST_USERS = {
  free: {
    email: 'e2e-free@test.local',
    password: 'test-password-free-123!',
    username: 'e2e_free_user',
  },
  plus: {
    email: 'e2e-plus@test.local',
    password: 'test-password-plus-123!',
    username: 'e2e_plus_user',
  },
  trial: {
    email: 'e2e-trial@test.local',
    password: 'test-password-trial-123!',
    username: 'e2e_trial_user',
  },
  pastDue: {
    email: 'e2e-pastdue@test.local',
    password: 'test-password-pastdue-123!',
    username: 'e2e_pastdue_user',
  },
  canceled: {
    email: 'e2e-canceled@test.local',
    password: 'test-password-canceled-123!',
    username: 'e2e_canceled_user',
  },
  cancelPending: {
    email: 'e2e-cancel-pending@test.local',
    password: 'test-password-cancel-pending-123!',
    username: 'e2e_cancel_pending_user',
  },
} as const;

export type TestUserKey = keyof typeof TEST_USERS;

/**
 * Persistent file path for sharing user IDs between the setup process
 * and worker processes. The setup project writes this file; workers read it.
 */
const USER_IDS_FILE = path.join(__dirname, '..', '.test-user-ids.json');

/** Map from test user key to their Supabase user ID. */
export const TEST_USER_IDS: Record<TestUserKey, string> = {
  free: '',
  plus: '',
  trial: '',
  pastDue: '',
  canceled: '',
  cancelPending: '',
};

/** Load user IDs from the shared file (called by worker processes). */
export function loadTestUserIds(): void {
  try {
    const data = JSON.parse(fs.readFileSync(USER_IDS_FILE, 'utf-8'));
    for (const key of Object.keys(TEST_USER_IDS) as TestUserKey[]) {
      if (data[key]) TEST_USER_IDS[key] = data[key];
    }
  } catch {
    // File may not exist yet if setup hasn't run
  }
}

// Auto-load on import so workers always have the IDs
loadTestUserIds();

/** Save user IDs to the shared file (called by setup process). */
function saveTestUserIds(): void {
  fs.writeFileSync(USER_IDS_FILE, JSON.stringify(TEST_USER_IDS, null, 2));
}

/**
 * Create a test user via admin API and return their user ID.
 * If the user already exists (matching email), returns the existing ID.
 */
async function ensureUser(email: string, password: string): Promise<string> {
  const supabase = getServiceClient();

  // List all users and find by email. perPage: 1000 handles environments
  // where other users exist beyond our test users.
  const { data: existingUsers } = await supabase.auth.admin.listUsers({
    perPage: 1000,
    page: 1,
  });

  const existing = existingUsers?.users?.find(u => u.email === email);
  if (existing) {
    return existing.id;
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error) {
    // User might have been created by a concurrent run
    if (error.message?.includes('already been registered')) {
      const { data: retry } = await supabase.auth.admin.listUsers({
        perPage: 1000,
        page: 1,
      });
      const found = retry?.users?.find(u => u.email === email);
      if (found) return found.id;
    }
    throw new Error(`Failed to create user ${email}: ${error.message}`);
  }

  return data.user.id;
}

/**
 * Ensure a user_profiles row exists for the test user.
 */
async function ensureProfile(userId: string, username: string): Promise<void> {
  const supabase = getServiceClient();
  await supabase
    .from('user_profiles')
    .upsert(
      { user_id: userId, username, is_public: true },
      { onConflict: 'user_id' }
    );
}

/**
 * Seed a billing_subscriptions row for a test user.
 * Removes any existing subscriptions first to ensure clean state.
 */
async function seedSubscription(
  userId: string,
  opts: {
    tier: 'plus' | 'pro';
    status: 'active' | 'trialing' | 'past_due' | 'canceled';
    cancelAtPeriodEnd?: boolean;
  }
): Promise<void> {
  const supabase = getServiceClient();

  // Clean up existing test subscriptions for this user
  await supabase.from('billing_subscriptions').delete().eq('user_id', userId);

  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setDate(periodEnd.getDate() + 30);

  const { error } = await supabase.from('billing_subscriptions').insert({
    user_id: userId,
    stripe_subscription_id: `sub_e2e_${userId.slice(0, 8)}_${Date.now()}`,
    stripe_price_id: `price_e2e_${opts.tier}_monthly`,
    stripe_product_id: `prod_e2e_${opts.tier}`,
    tier: opts.tier,
    status: opts.status,
    current_period_end: periodEnd.toISOString(),
    cancel_at_period_end: opts.cancelAtPeriodEnd ?? false,
    metadata: { e2e_test: true },
  });

  if (error) {
    throw new Error(
      `Failed to seed subscription for ${userId}: ${error.message}`
    );
  }
}

/**
 * Seed all test users and their subscriptions.
 * Safe to call multiple times (idempotent).
 * Writes TEST_USER_IDS to a shared file so worker processes can read them.
 */
export async function seedTestData(): Promise<void> {
  console.log('[e2e] Seeding test users...');

  // Create all users
  for (const [key, user] of Object.entries(TEST_USERS)) {
    const userId = await ensureUser(user.email, user.password);
    TEST_USER_IDS[key as TestUserKey] = userId;
    await ensureProfile(userId, user.username);
    console.log(`[e2e]   ${key}: ${userId}`);
  }

  // Persist IDs for worker processes
  saveTestUserIds();

  // Seed subscriptions for non-free users
  await seedSubscription(TEST_USER_IDS.plus, {
    tier: 'plus',
    status: 'active',
  });

  await seedSubscription(TEST_USER_IDS.trial, {
    tier: 'plus',
    status: 'trialing',
  });

  await seedSubscription(TEST_USER_IDS.pastDue, {
    tier: 'plus',
    status: 'past_due',
  });

  await seedSubscription(TEST_USER_IDS.canceled, {
    tier: 'plus',
    status: 'canceled',
  });

  await seedSubscription(TEST_USER_IDS.cancelPending, {
    tier: 'plus',
    status: 'active',
    cancelAtPeriodEnd: true,
  });

  // Free user: no subscription (delete any leftover)
  const supabase = getServiceClient();
  await supabase
    .from('billing_subscriptions')
    .delete()
    .eq('user_id', TEST_USER_IDS.free);

  console.log('[e2e] Seeding complete.');
}

/**
 * Clean up test user data (subscriptions, usage counters, lists).
 * Users themselves are left in place to avoid re-creation overhead.
 */
export async function cleanupTestData(): Promise<void> {
  console.log('[e2e] Cleaning up test data...');

  // Reload IDs in case we're in the teardown process
  loadTestUserIds();

  const supabase = getServiceClient();
  const userIds = Object.values(TEST_USER_IDS).filter(Boolean);
  if (userIds.length === 0) return;

  for (const userId of userIds) {
    await supabase.from('billing_subscriptions').delete().eq('user_id', userId);
    await supabase.from('usage_counters').delete().eq('user_id', userId);
    await supabase
      .from('user_lists')
      .delete()
      .eq('user_id', userId)
      .eq('is_system', false);
  }

  // Clean up the shared file
  try {
    fs.unlinkSync(USER_IDS_FILE);
  } catch {
    // Already removed or never created
  }

  console.log('[e2e] Cleanup complete.');
}
