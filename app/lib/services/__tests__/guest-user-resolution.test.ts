import { describe, expect, it, beforeEach, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/supabase/types';

vi.mock('server-only', () => ({}));

import { resolveGuestCheckoutUser } from '../billing';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type MockAdmin = {
  listUsers: ReturnType<typeof vi.fn>;
  inviteUserByEmail: ReturnType<typeof vi.fn>;
};

function makeMockSupabase(overrides: Partial<MockAdmin> = {}): {
  supabase: SupabaseClient<Database>;
  admin: MockAdmin;
} {
  const admin: MockAdmin = {
    listUsers:
      overrides.listUsers ??
      vi.fn().mockResolvedValue({
        data: { users: [] },
        error: null,
      }),
    inviteUserByEmail:
      overrides.inviteUserByEmail ??
      vi.fn().mockResolvedValue({
        data: { user: null },
        error: null,
      }),
  };

  const supabase = { auth: { admin } } as unknown as SupabaseClient<Database>;

  return { supabase, admin };
}

const TEST_EMAIL = 'buyer@example.com';
const EXISTING_USER_ID = 'existing-user-uuid';
const INVITED_USER_ID = 'invited-user-uuid';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('resolveGuestCheckoutUser', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns existing user id when listUsers finds a matching email', async () => {
    const { supabase, admin } = makeMockSupabase({
      listUsers: vi.fn().mockResolvedValue({
        data: {
          users: [
            { id: 'other-user', email: 'other@example.com' },
            { id: EXISTING_USER_ID, email: TEST_EMAIL },
          ],
        },
        error: null,
      }),
    });

    const userId = await resolveGuestCheckoutUser(TEST_EMAIL, { supabase });

    expect(userId).toBe(EXISTING_USER_ID);
    expect(admin.listUsers).toHaveBeenCalled();
    expect(admin.inviteUserByEmail).not.toHaveBeenCalled();
  });

  it('matches email case-insensitively', async () => {
    const { supabase, admin } = makeMockSupabase({
      listUsers: vi.fn().mockResolvedValue({
        data: {
          users: [{ id: EXISTING_USER_ID, email: 'Buyer@Example.COM' }],
        },
        error: null,
      }),
    });

    const userId = await resolveGuestCheckoutUser(TEST_EMAIL, { supabase });

    expect(userId).toBe(EXISTING_USER_ID);
    expect(admin.inviteUserByEmail).not.toHaveBeenCalled();
  });

  it('invites user and returns new user id when no existing user found', async () => {
    const { supabase, admin } = makeMockSupabase({
      listUsers: vi.fn().mockResolvedValue({
        data: { users: [] },
        error: null,
      }),
      inviteUserByEmail: vi.fn().mockResolvedValue({
        data: { user: { id: INVITED_USER_ID } },
        error: null,
      }),
    });

    const userId = await resolveGuestCheckoutUser(TEST_EMAIL, { supabase });

    expect(userId).toBe(INVITED_USER_ID);
    expect(admin.inviteUserByEmail).toHaveBeenCalledWith(
      TEST_EMAIL,
      expect.objectContaining({
        redirectTo: expect.stringContaining('/auth/callback?next=/sets'),
      })
    );
  });

  it('falls through to invite when listUsers errors', async () => {
    const { supabase } = makeMockSupabase({
      listUsers: vi.fn().mockResolvedValue({
        data: { users: [] },
        error: { message: 'Service unavailable' },
      }),
      inviteUserByEmail: vi.fn().mockResolvedValue({
        data: { user: { id: INVITED_USER_ID } },
        error: null,
      }),
    });

    const userId = await resolveGuestCheckoutUser(TEST_EMAIL, { supabase });

    expect(userId).toBe(INVITED_USER_ID);
  });

  it('throws when invite fails', async () => {
    const { supabase } = makeMockSupabase({
      listUsers: vi.fn().mockResolvedValue({
        data: { users: [] },
        error: null,
      }),
      inviteUserByEmail: vi.fn().mockResolvedValue({
        data: { user: null },
        error: { message: 'Rate limit exceeded' },
      }),
    });

    await expect(
      resolveGuestCheckoutUser(TEST_EMAIL, { supabase })
    ).rejects.toThrow('Failed to invite guest user');
  });

  it('throws when invite succeeds but returns no user', async () => {
    const { supabase } = makeMockSupabase({
      listUsers: vi.fn().mockResolvedValue({
        data: { users: [] },
        error: null,
      }),
      inviteUserByEmail: vi.fn().mockResolvedValue({
        data: { user: null },
        error: null,
      }),
    });

    await expect(
      resolveGuestCheckoutUser(TEST_EMAIL, { supabase })
    ).rejects.toThrow('Invite succeeded but no user returned');
  });

  it('uses NEXT_PUBLIC_APP_URL for redirectTo when set', async () => {
    const originalUrl = process.env.NEXT_PUBLIC_APP_URL;
    process.env.NEXT_PUBLIC_APP_URL = 'https://brickparty.app';

    try {
      const { supabase, admin } = makeMockSupabase({
        listUsers: vi.fn().mockResolvedValue({
          data: { users: [] },
          error: null,
        }),
        inviteUserByEmail: vi.fn().mockResolvedValue({
          data: { user: { id: INVITED_USER_ID } },
          error: null,
        }),
      });

      await resolveGuestCheckoutUser(TEST_EMAIL, { supabase });

      expect(admin.inviteUserByEmail).toHaveBeenCalledWith(TEST_EMAIL, {
        redirectTo: 'https://brickparty.app/auth/callback?next=/sets',
      });
    } finally {
      if (originalUrl === undefined) {
        delete process.env.NEXT_PUBLIC_APP_URL;
      } else {
        process.env.NEXT_PUBLIC_APP_URL = originalUrl;
      }
    }
  });

  it('paginates through listUsers when first page has no match', async () => {
    // First page: 50 users, no match (triggers pagination)
    // Second page: contains the match
    const fiftyOtherUsers = Array.from({ length: 50 }, (_, i) => ({
      id: `user-${i}`,
      email: `user${i}@example.com`,
    }));

    const listUsersFn = vi
      .fn()
      .mockResolvedValueOnce({
        data: { users: fiftyOtherUsers },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { users: [{ id: EXISTING_USER_ID, email: TEST_EMAIL }] },
        error: null,
      });

    const { supabase, admin } = makeMockSupabase({ listUsers: listUsersFn });

    const userId = await resolveGuestCheckoutUser(TEST_EMAIL, { supabase });

    expect(userId).toBe(EXISTING_USER_ID);
    expect(listUsersFn).toHaveBeenCalledTimes(2);
    expect(listUsersFn).toHaveBeenCalledWith({ page: 1, perPage: 50 });
    expect(listUsersFn).toHaveBeenCalledWith({ page: 2, perPage: 50 });
    expect(admin.inviteUserByEmail).not.toHaveBeenCalled();
  });
});
