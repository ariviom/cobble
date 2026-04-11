import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

vi.mock('@/app/lib/middleware/csrf', () => ({
  withCsrfProtection: (
    handler: (
      req: import('next/server').NextRequest,
      context: { params: Promise<Record<string, never>> }
    ) => Promise<import('next/server').NextResponse>
  ) => handler,
}));

const mockConsumeRateLimit = vi.fn();
const mockGetClientIp = vi.fn();
vi.mock('@/lib/rateLimit', () => ({
  consumeRateLimit: (...args: unknown[]) => mockConsumeRateLimit(...args),
  getClientIp: (...args: unknown[]) => mockGetClientIp(...args),
}));

const mockGetUser = vi.fn();
vi.mock('@/app/lib/supabaseAuthServerClient', () => ({
  getSupabaseAuthServerClient: vi.fn(async () => ({
    auth: {
      getUser: mockGetUser,
    },
  })),
}));

const mockGetEntitlements = vi.fn();
const mockHasFeature = vi.fn();
vi.mock('@/app/lib/services/entitlements', () => ({
  getEntitlements: (...args: unknown[]) => mockGetEntitlements(...args),
  hasFeature: (...args: unknown[]) => mockHasFeature(...args),
}));

const mockGetUsageStatus = vi.fn();
const mockIncrementUsage = vi.fn();
const mockCheckAndIncrementUsage = vi.fn();
vi.mock('@/app/lib/services/usageCounters', () => ({
  getUsageStatus: (...args: unknown[]) => mockGetUsageStatus(...args),
  incrementUsage: (...args: unknown[]) => mockIncrementUsage(...args),
  checkAndIncrementUsage: (...args: unknown[]) =>
    mockCheckAndIncrementUsage(...args),
}));

const mockRunIdentifyPipeline = vi.fn();
vi.mock('@/app/lib/identify/pipeline', () => ({
  runIdentifyPipeline: (...args: unknown[]) => mockRunIdentifyPipeline(...args),
}));

const { mockLoggerWarn, mockLoggerError } = vi.hoisted(() => ({
  mockLoggerWarn: vi.fn(),
  mockLoggerError: vi.fn(),
}));
vi.mock('@/lib/metrics', () => ({
  logger: {
    warn: mockLoggerWarn,
    error: mockLoggerError,
  },
}));

import { POST } from '../route';

describe('identify route quota enforcement', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockConsumeRateLimit.mockResolvedValue({
      allowed: true,
      retryAfterSeconds: 0,
    });
    mockGetClientIp.mockResolvedValue('127.0.0.1');
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    });
    mockGetEntitlements.mockResolvedValue({ tier: 'free', features: [] });
    mockHasFeature.mockReturnValue(false);
    mockGetUsageStatus.mockResolvedValue({
      count: 4,
      limit: 5,
      remaining: 1,
      resetAt: '2026-04-11T00:00:00.000Z',
    });
    mockCheckAndIncrementUsage.mockResolvedValue({
      allowed: false,
      limit: 5,
      remaining: 0,
      resetAt: '2026-04-11T00:00:00.000Z',
    });
    mockRunIdentifyPipeline.mockResolvedValue({
      status: 'fallback',
      payload: {
        part: null,
        blPartId: null,
        blAvailableColors: [],
        source: 'cache',
        candidates: [],
        availableColors: [],
        selectedColorId: null,
        sets: [{ setNumber: '1234-1' }],
      },
    });
  });

  it('rejects a successful identify if atomic quota consumption loses a race', async () => {
    class TestBlob extends Blob {
      async arrayBuffer() {
        return new Uint8Array([1, 2, 3]).buffer;
      }
    }

    const image = new TestBlob([new Uint8Array([1, 2, 3])], {
      type: 'image/png',
    });
    const form = {
      get: (key: string) => {
        if (key === 'image') return image;
        return null;
      },
    };

    const req = {
      method: 'POST',
      headers: new Headers({ origin: 'http://localhost:3000' }),
      formData: vi.fn().mockResolvedValue(form),
    } as unknown as import('next/server').NextRequest;

    const res = await POST(req, { params: Promise.resolve({}) });
    const json = await res.json();

    expect(mockLoggerError).not.toHaveBeenCalled();
    expect(res.status).toBe(429);
    expect(json.error).toBe('feature_unavailable');
    expect(mockIncrementUsage).not.toHaveBeenCalled();
  });
});
