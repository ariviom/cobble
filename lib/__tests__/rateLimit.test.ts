import { logger } from '@/lib/metrics';
import { consumeRateLimit } from '@/lib/rateLimit';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mockRpc = vi.fn();

vi.mock('@/app/lib/db/catalogAccess', () => ({
  getCatalogReadClient: () => ({
    rpc: mockRpc,
  }),
}));

describe('consumeRateLimit', () => {
  beforeEach(() => {
    mockRpc.mockReset();
  });

  it('returns distributed result when Supabase RPC succeeds', async () => {
    mockRpc.mockResolvedValue({
      data: [{ allowed: true, retry_after_seconds: 0 }],
      error: null,
    });

    const result = await consumeRateLimit('distributed-key', {
      windowMs: 1_000,
      maxHits: 5,
    });

    expect(result).toEqual({ allowed: true, retryAfterSeconds: 0 });
    expect(mockRpc).toHaveBeenCalledWith('consume_rate_limit', {
      p_key: 'distributed-key',
      p_max_hits: 5,
      p_window_ms: 1_000,
    });
  });

  it('falls back to in-memory bucket when Supabase RPC fails', async () => {
    mockRpc.mockResolvedValue({ data: null, error: new Error('boom') });
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});

    const opts = { windowMs: 1_000, maxHits: 1 };
    const first = await consumeRateLimit('fallback-key', opts);
    const second = await consumeRateLimit('fallback-key', opts);

    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(false);
    expect(second.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it('evicts old buckets and respects TTL in fallback mode', async () => {
    mockRpc.mockResolvedValue({ data: null, error: new Error('boom') });
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    vi.useFakeTimers();

    const windowMs = 1_000;
    const opts = { windowMs, maxHits: 1 };

    // Fill more than max buckets (500) to trigger eviction; use 505 keys.
    const keys = Array.from({ length: 505 }, (_, i) => `k${i}`);
    for (const key of keys) {
      await consumeRateLimit(key, opts);
    }

    // Advance time past window to force TTL expiry.
    vi.advanceTimersByTime(windowMs + 10);

    // Reuse an early key; it should have been evicted/expired and allowed again.
    const result = await consumeRateLimit('k0', opts);
    expect(result.allowed).toBe(true);

    warnSpy.mockRestore();
    vi.useRealTimers();
  });
});
