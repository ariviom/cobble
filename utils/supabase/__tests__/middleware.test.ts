import { NextRequest } from 'next/server';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { updateSession } from '../middleware';

vi.mock('@supabase/ssr', () => {
  return {
    createServerClient: vi.fn(
      (
        _url: string,
        _key: string,
        opts: {
          cookies: {
            setAll: (
              cookies: Array<{
                name: string;
                value: string;
                options?: Record<string, unknown>;
              }>
            ) => void;
            getAll: () => unknown;
          };
        }
      ) => {
        const { cookies } = opts;
        return {
          auth: {
            // Simulate Supabase refreshing cookies during getUser().
            getUser: vi.fn().mockImplementation(async () => {
              cookies.setAll([
                {
                  name: 'sb-test-refresh',
                  value: 'refreshed',
                  options: { path: '/' },
                },
              ]);
              return { data: { user: null }, error: null };
            }),
          },
        };
      }
    ),
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
    const mockCalls = (
      createServerClient as unknown as { mock: { calls: unknown[][] } }
    ).mock.calls;
    expect(mockCalls[0]?.[0]).toBe('http://example.test');
    expect(mockCalls[0]?.[1]).toBe('anon_key');
  });

  it('sets x-request-id header on response', async () => {
    const req = new NextRequest('http://example.test/api/foo');
    const res = await updateSession(req);

    const requestId = res.headers.get('x-request-id');
    expect(requestId).toBeTruthy();
    expect(typeof requestId).toBe('string');
  });

  it('forwards incoming x-request-id header', async () => {
    const req = new NextRequest('http://example.test/api/foo', {
      headers: { 'x-request-id': 'incoming-req-123' },
    });
    const res = await updateSession(req);

    expect(res.headers.get('x-request-id')).toBe('incoming-req-123');
  });

  it('sets Content-Security-Policy header', async () => {
    const req = new NextRequest('http://example.test/api/foo');
    const res = await updateSession(req);

    const csp = res.headers.get('Content-Security-Policy');
    expect(csp).toBeTruthy();
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
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
