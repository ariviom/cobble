import { NextRequest } from 'next/server';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { updateSession } from '../middleware';

vi.mock('@supabase/ssr', () => {
  return {
    createServerClient: vi.fn((url: string, key: string, opts: { cookies: { setAll: (cookies: Array<{ name: string; value: string; options?: Record<string, unknown> }>) => void; getAll: () => unknown } }) => {
      const { cookies } = opts;
      return {
        auth: {
          // Simulate Supabase refreshing cookies during getUser().
          getUser: vi.fn().mockImplementation(async () => {
            cookies.setAll([
              { name: 'sb-test-refresh', value: 'refreshed', options: { path: '/' } },
            ]);
            return { data: { user: null }, error: null };
          }),
        },
      };
    }),
  };
});

describe('updateSession middleware', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://example.test';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon_key';
  });

  it('refreshes auth cookies using Supabase SSR client', async () => {
    const req = new NextRequest('http://example.test/api/foo', {
      headers: {
        cookie: 'sb-access-token=oldtoken;',
      },
    });

    const res = await updateSession(req);

    const refreshed = res.cookies.get('sb-test-refresh');
    expect(refreshed?.value).toBe('refreshed');

    const { createServerClient } = await import('@supabase/ssr');
    expect((createServerClient as unknown as { mock: { calls: unknown[] } }).mock.calls[0]?.[0]).toBe('http://example.test');
    expect((createServerClient as unknown as { mock: { calls: unknown[] } }).mock.calls[0]?.[1]).toBe('anon_key');
  });

  it('is a no-op when env vars are missing', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    const req = new NextRequest('http://example.test/api/foo');
    const res = await updateSession(req);

    // No refresh cookie should be set.
    const refreshed = res.cookies.get('sb-test-refresh');
    expect(refreshed).toBeUndefined();
  });
});

