import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

const { getUserMock, getDetailMock } = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  getDetailMock: vi.fn(),
}));

vi.mock('@/app/lib/supabaseAuthServerClient', () => ({
  getSupabaseAuthServerClient: async () => ({
    auth: { getUser: getUserMock },
  }),
}));

vi.mock('@/app/lib/services/adminUsers', () => ({
  getAdminUserDetail: getDetailMock,
}));

import { GET } from '@/app/api/admin/users/[userId]/route';

function makeReq() {
  return new NextRequest(new URL('http://localhost/api/admin/users/u1'));
}

describe('GET /api/admin/users/[userId]', () => {
  beforeEach(() => {
    getUserMock.mockReset();
    getDetailMock.mockReset();
  });

  it('returns 404 when caller is not admin', async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });

    const res = await GET(makeReq(), {
      params: Promise.resolve({ userId: 'u1' }),
    });

    expect(res.status).toBe(404);
    expect(getDetailMock).not.toHaveBeenCalled();
  });

  it('returns 404 when detail is null', async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: 'a1', app_metadata: { role: 'admin' } } },
    });
    getDetailMock.mockResolvedValue(null);

    const res = await GET(makeReq(), {
      params: Promise.resolve({ userId: 'u1' }),
    });

    expect(res.status).toBe(404);
  });

  it('returns detail when admin and target exists', async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: 'a1', app_metadata: { role: 'admin' } } },
    });
    getDetailMock.mockResolvedValue({
      authUser: { id: 'u1', email: 'u@example.com' },
      overview: { username: 'ursula' },
      subscription: null,
    });

    const res = await GET(makeReq(), {
      params: Promise.resolve({ userId: 'u1' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.overview.username).toBe('ursula');
  });
});
