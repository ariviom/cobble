import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

const { getUserMock, listAdminUsersMock } = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  listAdminUsersMock: vi.fn(),
}));

vi.mock('@/app/lib/supabaseAuthServerClient', () => ({
  getSupabaseAuthServerClient: async () => ({
    auth: { getUser: getUserMock },
  }),
}));

vi.mock('@/app/lib/services/adminUsers', () => ({
  listAdminUsers: listAdminUsersMock,
}));

import { GET } from '@/app/api/admin/users/route';

function makeReq(url: string) {
  return new NextRequest(new URL(url, 'http://localhost'));
}

describe('GET /api/admin/users', () => {
  beforeEach(() => {
    getUserMock.mockReset();
    listAdminUsersMock.mockReset();
  });

  it('returns 404 when caller is not admin', async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });

    const res = await GET(makeReq('http://localhost/api/admin/users'));

    expect(res.status).toBe(404);
    expect(listAdminUsersMock).not.toHaveBeenCalled();
  });

  it('returns rows when caller is admin', async () => {
    getUserMock.mockResolvedValue({
      data: {
        user: { id: 'a1', app_metadata: { role: 'admin' } },
      },
    });
    listAdminUsersMock.mockResolvedValue({
      rows: [{ user_id: 'u1', username: 'alice' }],
      total: 1,
      page: 0,
      pageSize: 25,
    });

    const res = await GET(
      makeReq('http://localhost/api/admin/users?q=ali&page=0&pageSize=25')
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(1);
    expect(body.rows[0].username).toBe('alice');
    expect(listAdminUsersMock).toHaveBeenCalledWith({
      q: 'ali',
      page: 0,
      pageSize: 25,
    });
  });

  it('clamps pageSize to 50', async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: 'a1', app_metadata: { role: 'admin' } } },
    });
    listAdminUsersMock.mockResolvedValue({
      rows: [],
      total: 0,
      page: 0,
      pageSize: 50,
    });

    await GET(makeReq('http://localhost/api/admin/users?pageSize=500'));

    expect(listAdminUsersMock).toHaveBeenCalledWith(
      expect.objectContaining({ pageSize: 50 })
    );
  });

  it('falls back to default pageSize when param is empty string', async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: 'a1', app_metadata: { role: 'admin' } } },
    });
    listAdminUsersMock.mockResolvedValue({
      rows: [],
      total: 0,
      page: 0,
      pageSize: 25,
    });

    await GET(makeReq('http://localhost/api/admin/users?pageSize='));

    expect(listAdminUsersMock).toHaveBeenCalledWith(
      expect.objectContaining({ pageSize: 25 })
    );
  });
});
