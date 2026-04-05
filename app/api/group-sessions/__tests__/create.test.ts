import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

vi.mock('@/app/lib/middleware/csrf', () => ({
  withCsrfProtection: (handler: (...args: never[]) => unknown) => handler,
}));

vi.mock('@/lib/metrics', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Supabase auth client mock — only `group_sessions` is queried from the route
// itself (prior-for-set lookup). Everything else goes through mocked services.
// ---------------------------------------------------------------------------

type QueryResult = { data: unknown; error: unknown };

const sessionsQueue: QueryResult[] = [];

function makeSessionsBuilder() {
  const builder: Record<string, unknown> = {};
  const chain = () => builder;

  builder.select = vi.fn(chain);
  builder.eq = vi.fn(chain);
  builder.gte = vi.fn(chain);
  builder.limit = vi.fn(chain);
  builder.maybeSingle = vi.fn(() =>
    Promise.resolve(sessionsQueue.shift() ?? { data: null, error: null })
  );

  return builder;
}

const mockGetUser = vi.fn();

vi.mock('@/app/lib/supabaseAuthServerClient', () => ({
  getSupabaseAuthServerClient: vi.fn().mockImplementation(async () => ({
    auth: { getUser: mockGetUser },
    from: vi.fn((table: string) => {
      if (table === 'group_sessions') return makeSessionsBuilder();
      throw new Error(`unexpected table on auth client: ${table}`);
    }),
  })),
}));

// ---------------------------------------------------------------------------
// Service mocks
// ---------------------------------------------------------------------------

const mockGetEntitlements = vi.fn();
const mockHasFeature = vi.fn();
vi.mock('@/app/lib/services/entitlements', () => ({
  getEntitlements: (...args: unknown[]) => mockGetEntitlements(...args),
  hasFeature: (...args: unknown[]) => mockHasFeature(...args),
}));

const mockCreateGroupSession = vi.fn();
vi.mock('@/app/lib/services/groupSessions', () => ({
  createGroupSession: (...args: unknown[]) => mockCreateGroupSession(...args),
}));

const mockCheckAndIncrementUsage = vi.fn();
vi.mock('@/app/lib/services/usageCounters', () => ({
  checkAndIncrementUsage: (...args: unknown[]) =>
    mockCheckAndIncrementUsage(...args),
}));

// Route imported after mocks
import { POST } from '../route';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const USER = { id: 'user-uuid-1', email: 'host@example.com' };
const SET_NUMBER = '1737-1';

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/group-sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function setFree() {
  mockGetEntitlements.mockResolvedValue({ tier: 'free', features: [] });
  mockHasFeature.mockReturnValue(false);
}

function setUnlimited() {
  mockGetEntitlements.mockResolvedValue({
    tier: 'plus',
    features: ['search_party.unlimited'],
  });
  mockHasFeature.mockReturnValue(true);
}

function createdSessionOk() {
  mockCreateGroupSession.mockResolvedValue({
    kind: 'created',
    session: {
      id: 'session-uuid-1',
      slug: 'abcdef',
      setNumber: SET_NUMBER,
      isActive: true,
    },
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/group-sessions (create, per-set quota)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionsQueue.length = 0;
    mockGetUser.mockResolvedValue({ data: { user: USER }, error: null });
    createdSessionOk();
  });

  it('increments the counter when no prior session exists for this set this month', async () => {
    setFree();
    // prior-for-set lookup: no row
    sessionsQueue.push({ data: null, error: null });
    mockCheckAndIncrementUsage.mockResolvedValue({
      allowed: true,
      limit: 2,
      remaining: 1,
      resetAt: new Date().toISOString(),
    });

    const res = await POST(makeRequest({ setNumber: SET_NUMBER }), {
      params: Promise.resolve({}),
    });

    expect(res.status).toBe(200);
    expect(mockCheckAndIncrementUsage).toHaveBeenCalledTimes(1);
    expect(mockCheckAndIncrementUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER.id,
        featureKey: 'search_party_host:monthly',
        limit: 2,
      })
    );
    expect(mockCreateGroupSession).toHaveBeenCalledTimes(1);
  });

  it('skips the counter when a prior session for the same set exists this month (restart is free)', async () => {
    setFree();
    // prior-for-set lookup: row found (any id is enough)
    sessionsQueue.push({
      data: { id: 'prior-session-uuid' },
      error: null,
    });

    const res = await POST(makeRequest({ setNumber: SET_NUMBER }), {
      params: Promise.resolve({}),
    });

    expect(res.status).toBe(200);
    expect(mockCheckAndIncrementUsage).not.toHaveBeenCalled();
    expect(mockCreateGroupSession).toHaveBeenCalledTimes(1);
  });

  it('returns 429 quota_exceeded when the counter denies a new set', async () => {
    setFree();
    // prior-for-set lookup: no row — genuinely a new set
    sessionsQueue.push({ data: null, error: null });
    mockCheckAndIncrementUsage.mockResolvedValue({
      allowed: false,
      limit: 2,
      remaining: 0,
      resetAt: new Date().toISOString(),
    });

    const res = await POST(makeRequest({ setNumber: SET_NUMBER }), {
      params: Promise.resolve({}),
    });

    expect(res.status).toBe(429);
    const json = await res.json();
    expect(json.error).toBe('quota_exceeded');
    expect(json.message).toContain('sets this month');
    expect(mockCreateGroupSession).not.toHaveBeenCalled();
  });

  it('skips both the prior-lookup and counter for unlimited-tier users', async () => {
    setUnlimited();

    const res = await POST(makeRequest({ setNumber: SET_NUMBER }), {
      params: Promise.resolve({}),
    });

    expect(res.status).toBe(200);
    expect(mockCheckAndIncrementUsage).not.toHaveBeenCalled();
    // The prior-lookup is gated behind `!hasFeature(unlimited)`, so the
    // sessions queue should be untouched.
    expect(sessionsQueue.length).toBe(0);
    expect(mockCreateGroupSession).toHaveBeenCalledTimes(1);
  });

  it('fails closed on prior-lookup error — still runs the counter check', async () => {
    setFree();
    // Prior-for-set lookup errors out
    sessionsQueue.push({
      data: null,
      error: { message: 'simulated pg failure' },
    });
    mockCheckAndIncrementUsage.mockResolvedValue({
      allowed: true,
      limit: 2,
      remaining: 1,
      resetAt: new Date().toISOString(),
    });

    const res = await POST(makeRequest({ setNumber: SET_NUMBER }), {
      params: Promise.resolve({}),
    });

    expect(res.status).toBe(200);
    // The error path must still enforce quota rather than silently letting
    // the request through.
    expect(mockCheckAndIncrementUsage).toHaveBeenCalledTimes(1);
  });

  it('returns 401 when the user is not authenticated', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'Not authenticated' },
    });

    const res = await POST(makeRequest({ setNumber: SET_NUMBER }), {
      params: Promise.resolve({}),
    });

    expect(res.status).toBe(401);
    expect(mockCheckAndIncrementUsage).not.toHaveBeenCalled();
    expect(mockCreateGroupSession).not.toHaveBeenCalled();
  });
});
