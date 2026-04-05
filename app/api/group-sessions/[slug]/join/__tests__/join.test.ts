import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock server-only before importing the route
vi.mock('server-only', () => ({}));

// Pass-through CSRF middleware so we can invoke POST directly
vi.mock('@/app/lib/middleware/csrf', () => ({
  withCsrfProtection: (handler: (...args: never[]) => unknown) => handler,
}));

// Allow rate-limited requests through
vi.mock('@/lib/rateLimit', () => ({
  consumeRateLimit: vi
    .fn()
    .mockResolvedValue({ allowed: true, retryAfterSeconds: 0 }),
  getClientIp: vi.fn().mockResolvedValue('127.0.0.1'),
}));

// Silence metrics
vi.mock('@/lib/metrics', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Supabase client mocks
// ---------------------------------------------------------------------------
//
// Two clients are exercised:
//   - authClient: session lookup, auth.getUser, existing-participant lookup,
//     cleanup RPC, new-participant insert.
//   - serviceRoleClient: existing-participant update (bypasses the column-level
//     GRANT restriction from migration 20260325131949).
//
// The table accessor for `group_session_participants` is stateful — it returns
// a chainable builder whose terminal call resolves to the next queued result.
// Callers queue results via queueAuth*/queueService* helpers below.

type QueryResult = { data: unknown; error: unknown };

function makeTable(queue: QueryResult[]) {
  const nextResult = (): QueryResult =>
    queue.shift() ?? { data: null, error: null };

  const builder: Record<string, unknown> = {};
  const chain = () => builder;

  builder.select = vi.fn(chain);
  builder.insert = vi.fn(chain);
  builder.update = vi.fn(chain);
  builder.delete = vi.fn(chain);
  builder.eq = vi.fn(chain);
  builder.is = vi.fn(chain);
  builder.maybeSingle = vi.fn(() => Promise.resolve(nextResult()));
  // `.then` makes the builder await-able for calls that don't end in
  // maybeSingle() (e.g. the color-slot SELECT).
  builder.then = (resolve: (value: QueryResult) => unknown) =>
    Promise.resolve(nextResult()).then(resolve);

  return builder;
}

const authParticipantsQueue: QueryResult[] = [];
const authSessionsQueue: QueryResult[] = [];
const serviceParticipantsQueue: QueryResult[] = [];

const mockGetUser = vi.fn();
const mockAuthRpc = vi.fn().mockResolvedValue({ error: null });

vi.mock('@/app/lib/supabaseAuthServerClient', () => ({
  getSupabaseAuthServerClient: vi.fn().mockImplementation(async () => ({
    auth: { getUser: mockGetUser },
    from: vi.fn((table: string) => {
      if (table === 'group_sessions') return makeTable(authSessionsQueue);
      if (table === 'group_session_participants')
        return makeTable(authParticipantsQueue);
      throw new Error(`unexpected auth-client table: ${table}`);
    }),
    rpc: mockAuthRpc,
  })),
}));

const serviceFromSpy = vi.fn((table: string) => {
  if (table === 'group_session_participants')
    return makeTable(serviceParticipantsQueue);
  throw new Error(`unexpected service-role-client table: ${table}`);
});

vi.mock('@/app/lib/supabaseServiceRoleClient', () => ({
  getSupabaseServiceRoleClient: vi.fn(() => ({ from: serviceFromSpy })),
}));

// Route is imported after the mocks are registered.
import { POST } from '../route';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resetQueues() {
  authParticipantsQueue.length = 0;
  authSessionsQueue.length = 0;
  serviceParticipantsQueue.length = 0;
}

function makeRequest(slug: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost/api/group-sessions/${slug}/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const SLUG = 'r7uib5';
const SESSION_ID = 'session-uuid-1';
const CLIENT_TOKEN = 'client-token-abc';
const USER = { id: 'user-uuid-1', email: 'host@example.com' };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/group-sessions/[slug]/join', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetQueues();
    mockGetUser.mockResolvedValue({ data: { user: USER }, error: null });
  });

  it('rejoin updates the existing participant via the service-role client (regression: column-level GRANT)', async () => {
    // Active session exists
    authSessionsQueue.push({
      data: { id: SESSION_ID, set_num: '75192', is_active: true },
      error: null,
    });
    // Existing participant row matched by session_id + client_token
    authParticipantsQueue.push({
      data: {
        id: 'participant-uuid-1',
        session_id: SESSION_ID,
        client_token: CLIENT_TOKEN,
        user_id: USER.id,
        display_name: 'Old Name',
        pieces_found: 3,
        color_slot: 2,
        last_seen_at: null,
        left_at: null,
      },
      error: null,
    });
    // Service-role UPDATE ... RETURNING *
    serviceParticipantsQueue.push({
      data: {
        id: 'participant-uuid-1',
        display_name: 'Host User',
        pieces_found: 3,
        color_slot: 2,
      },
      error: null,
    });

    const res = await POST(
      makeRequest(SLUG, {
        displayName: 'Host User',
        clientToken: CLIENT_TOKEN,
      }),
      { params: Promise.resolve({ slug: SLUG }) }
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.participant).toMatchObject({
      id: 'participant-uuid-1',
      displayName: 'Host User',
      piecesFound: 3,
      colorSlot: 2,
    });

    // The regression: the update must go through the service-role client.
    expect(serviceFromSpy).toHaveBeenCalledWith('group_session_participants');
  });

  it('surfaces 500 when the service-role update fails', async () => {
    authSessionsQueue.push({
      data: { id: SESSION_ID, set_num: '75192', is_active: true },
      error: null,
    });
    authParticipantsQueue.push({
      data: {
        id: 'participant-uuid-1',
        session_id: SESSION_ID,
        client_token: CLIENT_TOKEN,
        user_id: USER.id,
        display_name: 'Old Name',
        pieces_found: 0,
        color_slot: 1,
        last_seen_at: null,
        left_at: null,
      },
      error: null,
    });
    // Simulate a PostgREST permission error
    serviceParticipantsQueue.push({
      data: null,
      error: { code: '42501', message: 'permission denied for column x' },
    });

    const res = await POST(
      makeRequest(SLUG, {
        displayName: 'Host User',
        clientToken: CLIENT_TOKEN,
      }),
      { params: Promise.resolve({ slug: SLUG }) }
    );

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('unknown_error');
  });

  it('new participant insert still uses the auth client (service-role untouched)', async () => {
    authSessionsQueue.push({
      data: { id: SESSION_ID, set_num: '75192', is_active: true },
      error: null,
    });
    // No existing participant
    authParticipantsQueue.push({ data: null, error: null });
    // resolveColorSlot SELECT on active participants
    authParticipantsQueue.push({ data: [], error: null });
    // INSERT ... RETURNING *
    authParticipantsQueue.push({
      data: {
        id: 'participant-uuid-new',
        display_name: 'Host User',
        pieces_found: 0,
        color_slot: 1,
      },
      error: null,
    });

    const res = await POST(
      makeRequest(SLUG, {
        displayName: 'Host User',
        clientToken: CLIENT_TOKEN,
      }),
      { params: Promise.resolve({ slug: SLUG }) }
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.participant.id).toBe('participant-uuid-new');
    expect(serviceFromSpy).not.toHaveBeenCalled();
  });

  it('returns 404 when the session is inactive (covers continue → forgot-to-reactivate edge case)', async () => {
    authSessionsQueue.push({
      data: { id: SESSION_ID, set_num: '75192', is_active: false },
      error: null,
    });

    const res = await POST(
      makeRequest(SLUG, {
        displayName: 'Host User',
        clientToken: CLIENT_TOKEN,
      }),
      { params: Promise.resolve({ slug: SLUG }) }
    );

    expect(res.status).toBe(404);
    expect(serviceFromSpy).not.toHaveBeenCalled();
  });
});
