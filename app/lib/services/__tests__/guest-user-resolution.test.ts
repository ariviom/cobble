import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/supabase/types';

vi.mock('server-only', () => ({}));

import { resolveGuestCheckoutUser } from '../billing';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type MockAdmin = {
  inviteUserByEmail: ReturnType<typeof vi.fn>;
};

function makeMockSupabase(overrides: Partial<MockAdmin> = {}): {
  supabase: SupabaseClient<Database>;
  admin: MockAdmin;
} {
  const admin: MockAdmin = {
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

// Mock fetch for GoTrue REST API
const mockFetch = vi.fn();

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.restoreAllMocks();
  mockFetch.mockReset();
  vi.stubGlobal('fetch', mockFetch);
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// Helper to create a mock fetch response
function mockFetchResponse(users: Array<{ id: string; email: string }>) {
  return {
    ok: true,
    json: async () => ({ users }),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('resolveGuestCheckoutUser', () => {
  it('returns existing user id when GoTrue finds a matching email', async () => {
    mockFetch.mockResolvedValue(
      mockFetchResponse([
        { id: 'other-user', email: 'other@example.com' },
        { id: EXISTING_USER_ID, email: TEST_EMAIL },
      ])
    );
    const { supabase, admin } = makeMockSupabase();

    const userId = await resolveGuestCheckoutUser(TEST_EMAIL, { supabase });

    expect(userId).toBe(EXISTING_USER_ID);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(admin.inviteUserByEmail).not.toHaveBeenCalled();
  });

  it('matches email case-insensitively', async () => {
    mockFetch.mockResolvedValue(
      mockFetchResponse([{ id: EXISTING_USER_ID, email: 'Buyer@Example.COM' }])
    );
    const { supabase, admin } = makeMockSupabase();

    const userId = await resolveGuestCheckoutUser(TEST_EMAIL, { supabase });

    expect(userId).toBe(EXISTING_USER_ID);
    expect(admin.inviteUserByEmail).not.toHaveBeenCalled();
  });

  it('invites user and returns new user id when no existing user found', async () => {
    mockFetch.mockResolvedValue(mockFetchResponse([]));
    const { supabase, admin } = makeMockSupabase({
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

  it('falls through to invite when GoTrue REST call fails', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    });
    const { supabase } = makeMockSupabase({
      inviteUserByEmail: vi.fn().mockResolvedValue({
        data: { user: { id: INVITED_USER_ID } },
        error: null,
      }),
    });

    const userId = await resolveGuestCheckoutUser(TEST_EMAIL, { supabase });

    expect(userId).toBe(INVITED_USER_ID);
  });

  it('throws when invite fails', async () => {
    mockFetch.mockResolvedValue(mockFetchResponse([]));
    const { supabase } = makeMockSupabase({
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
    mockFetch.mockResolvedValue(mockFetchResponse([]));
    const { supabase } = makeMockSupabase({
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
      mockFetch.mockResolvedValue(mockFetchResponse([]));
      const { supabase, admin } = makeMockSupabase({
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

  it('retries lookup when invite fails with "already been registered"', async () => {
    // First findUserByEmail: no match
    // inviteUserByEmail: fails with "already been registered"
    // Second findUserByEmail: finds the user (created by concurrent webhook)
    mockFetch
      .mockResolvedValueOnce(mockFetchResponse([]))
      .mockResolvedValueOnce(
        mockFetchResponse([{ id: EXISTING_USER_ID, email: TEST_EMAIL }])
      );

    const { supabase } = makeMockSupabase({
      inviteUserByEmail: vi.fn().mockResolvedValue({
        data: { user: null },
        error: {
          message: 'A user with this email address has already been registered',
        },
      }),
    });

    const userId = await resolveGuestCheckoutUser(TEST_EMAIL, { supabase });

    expect(userId).toBe(EXISTING_USER_ID);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('throws when invite race retry lookup also fails', async () => {
    mockFetch
      .mockResolvedValueOnce(mockFetchResponse([]))
      .mockResolvedValueOnce(mockFetchResponse([]));

    const { supabase } = makeMockSupabase({
      inviteUserByEmail: vi.fn().mockResolvedValue({
        data: { user: null },
        error: {
          message: 'A user with this email address has already been registered',
        },
      }),
    });

    await expect(
      resolveGuestCheckoutUser(TEST_EMAIL, { supabase })
    ).rejects.toThrow('Failed to invite guest user');
  });

  it('passes email as filter param to GoTrue REST endpoint', async () => {
    mockFetch.mockResolvedValue(
      mockFetchResponse([{ id: EXISTING_USER_ID, email: TEST_EMAIL }])
    );
    const { supabase } = makeMockSupabase();

    await resolveGuestCheckoutUser(TEST_EMAIL, { supabase });

    expect(mockFetch).toHaveBeenCalledWith(
      `https://test.supabase.co/auth/v1/admin/users?filter=${encodeURIComponent(TEST_EMAIL)}`,
      expect.objectContaining({
        headers: expect.objectContaining({
          apikey: 'test-service-role-key',
          Authorization: 'Bearer test-service-role-key',
        }),
      })
    );
  });
});
