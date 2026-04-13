import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

const redirectMock = vi.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT:${url}`);
});

vi.mock('next/navigation', () => ({
  redirect: (url: string) => redirectMock(url),
}));

const getUserMock = vi.fn();

vi.mock('@/app/lib/supabaseAuthServerClient', () => ({
  getSupabaseAuthServerClient: async () => ({
    auth: { getUser: getUserMock },
  }),
}));

import { requireAdmin } from '@/app/lib/server/requireAdmin';

describe('requireAdmin', () => {
  beforeEach(() => {
    redirectMock.mockClear();
    getUserMock.mockReset();
  });

  it('redirects to / when no user is signed in', async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });

    await expect(requireAdmin()).rejects.toThrow('NEXT_REDIRECT:/');
    expect(redirectMock).toHaveBeenCalledWith('/');
  });

  it('redirects to / when signed-in user is not an admin', async () => {
    getUserMock.mockResolvedValue({
      data: {
        user: {
          id: 'u1',
          email: 'user@example.com',
          app_metadata: { role: 'user' },
        },
      },
    });

    await expect(requireAdmin()).rejects.toThrow('NEXT_REDIRECT:/');
  });

  it('returns the user when role=admin', async () => {
    const user = {
      id: 'u1',
      email: 'admin@example.com',
      app_metadata: { role: 'admin' },
    };
    getUserMock.mockResolvedValue({ data: { user } });

    const result = await requireAdmin();

    expect(result).toEqual(user);
    expect(redirectMock).not.toHaveBeenCalled();
  });
});
