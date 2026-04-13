import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

const { getUserMock, listMock } = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  listMock: vi.fn(),
}));

vi.mock('@/app/lib/supabaseAuthServerClient', () => ({
  getSupabaseAuthServerClient: async () => ({
    auth: { getUser: getUserMock },
  }),
}));

vi.mock('@/app/lib/services/adminFeedback', async () => {
  const real = await vi.importActual<
    typeof import('@/app/lib/services/adminFeedback')
  >('@/app/lib/services/adminFeedback');
  return { ...real, listAdminFeedback: listMock };
});

import { GET } from '@/app/api/admin/feedback/route';

function makeReq(search = '') {
  return new NextRequest(
    new URL(`http://localhost/api/admin/feedback${search}`)
  );
}

describe('GET /api/admin/feedback', () => {
  beforeEach(() => {
    getUserMock.mockReset();
    listMock.mockReset();
  });

  it('returns 404 when caller is not admin', async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const res = await GET(makeReq());
    expect(res.status).toBe(404);
    expect(listMock).not.toHaveBeenCalled();
  });

  it('passes a valid category through', async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: 'a1', app_metadata: { role: 'admin' } } },
    });
    listMock.mockResolvedValue({
      rows: [],
      total: 0,
      page: 0,
      pageSize: 50,
    });

    await GET(makeReq('?category=bug'));

    expect(listMock).toHaveBeenCalledWith({
      category: 'bug',
      page: 0,
      pageSize: 50,
    });
  });

  it('drops invalid categories', async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: 'a1', app_metadata: { role: 'admin' } } },
    });
    listMock.mockResolvedValue({
      rows: [],
      total: 0,
      page: 0,
      pageSize: 50,
    });

    await GET(makeReq('?category=xxx'));

    expect(listMock).toHaveBeenCalledWith({
      category: undefined,
      page: 0,
      pageSize: 50,
    });
  });
});
