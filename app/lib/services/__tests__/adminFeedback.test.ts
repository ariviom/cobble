import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

const { fromMock, rangeMock, eqMock, orderMock, selectMock } = vi.hoisted(
  () => ({
    fromMock: vi.fn(),
    rangeMock: vi.fn(),
    eqMock: vi.fn(),
    orderMock: vi.fn(),
    selectMock: vi.fn(),
  })
);

vi.mock('@/app/lib/supabaseServiceRoleClient', () => ({
  getSupabaseServiceRoleClient: () => ({ from: fromMock }),
}));

import { listAdminFeedback } from '@/app/lib/services/adminFeedback';

describe('listAdminFeedback', () => {
  beforeEach(() => {
    fromMock.mockReset();
    selectMock.mockReset();
    orderMock.mockReset();
    eqMock.mockReset();
    rangeMock.mockReset();

    eqMock.mockImplementation(() => ({ range: rangeMock }));
    orderMock.mockImplementation(() => ({ eq: eqMock, range: rangeMock }));
    selectMock.mockImplementation(() => ({ order: orderMock }));
    fromMock.mockImplementation(() => ({ select: selectMock }));
  });

  it('queries user_feedback ordered by created_at desc', async () => {
    rangeMock.mockResolvedValue({ data: [], count: 0, error: null });

    await listAdminFeedback({ page: 0, pageSize: 50 });

    expect(fromMock).toHaveBeenCalledWith('user_feedback');
    expect(orderMock).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(rangeMock).toHaveBeenCalledWith(0, 49);
    expect(eqMock).not.toHaveBeenCalled();
  });

  it('applies a category filter', async () => {
    rangeMock.mockResolvedValue({ data: [], count: 0, error: null });

    await listAdminFeedback({ category: 'bug', page: 0, pageSize: 50 });

    expect(eqMock).toHaveBeenCalledWith('category', 'bug');
  });

  it('rejects invalid categories and returns empty', async () => {
    const result = await listAdminFeedback({
      category: 'not_a_category' as never,
      page: 0,
      pageSize: 50,
    });

    expect(result).toEqual({
      rows: [],
      total: 0,
      page: 0,
      pageSize: 50,
    });
    expect(eqMock).not.toHaveBeenCalled();
    expect(fromMock).not.toHaveBeenCalled();
  });
});
