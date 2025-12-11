import { resolvePublicUser } from '@/app/lib/publicUsers';

const maybeSingleMock = vi.fn();
const ilikeMock = vi.fn();
const eqMock = vi.fn();
const selectMock = vi.fn();
const fromMock = vi.fn();

vi.mock('@/app/lib/supabaseServerClient', () => ({
  getSupabaseServerClient: () => ({
    from: fromMock.mockImplementation(() => ({
      select: selectMock.mockReturnThis(),
      ilike: ilikeMock.mockReturnThis(),
      eq: eqMock.mockReturnThis(),
      maybeSingle: maybeSingleMock,
    })),
  }),
}));

describe('resolvePublicUser', () => {
  beforeEach(() => {
    fromMock.mockClear();
    selectMock.mockClear();
    ilikeMock.mockClear();
    eqMock.mockClear();
    maybeSingleMock.mockReset();
  });

  it('returns public profile and queries the public view', async () => {
    maybeSingleMock.mockResolvedValueOnce({
      data: {
        user_id: 'u1',
        username: 'alice',
        display_name: 'Alice',
        lists_public: true,
      },
      error: null,
    });

    const result = await resolvePublicUser('alice');

    expect(fromMock).toHaveBeenCalledWith('public_user_profiles_view');
    expect(ilikeMock).toHaveBeenCalledWith('username', 'alice');
    expect(result).toEqual({
      type: 'public',
      profile: {
        user_id: 'u1',
        username: 'alice',
        display_name: 'Alice',
        lists_public: true,
      },
    });
  });

  it('returns private when lists_public is false', async () => {
    maybeSingleMock.mockResolvedValueOnce({
      data: {
        user_id: 'u2',
        username: 'bob',
        display_name: 'Bob',
        lists_public: false,
      },
      error: null,
    });

    const result = await resolvePublicUser('bob');

    expect(result).toEqual({
      type: 'private',
      info: {
        user_id: 'u2',
        username: 'bob',
        display_name: 'Bob',
      },
    });
  });

  it('returns not_found on error or missing data', async () => {
    maybeSingleMock.mockResolvedValueOnce({ data: null, error: null });

    const result = await resolvePublicUser('missing');

    expect(result).toEqual({ type: 'not_found' });
  });
});

