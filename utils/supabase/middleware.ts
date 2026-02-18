import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const isDev = process.env.NODE_ENV !== 'production';

/**
 * Generate or forward a request ID for distributed tracing.
 * Accepts incoming x-request-id header or generates a new UUID.
 */
function getRequestId(request: NextRequest): string {
  const existing = request.headers.get('x-request-id');
  if (existing) return existing;
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID();
  }
  return `req-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

// Enforced (permissive) CSP to keep the app unblocked today.
function buildRelaxedCsp(): string {
  const directives = [
    "default-src 'self'",
    ['script-src', `'self'`, "'unsafe-inline'", isDev ? "'unsafe-eval'" : null]
      .filter(Boolean)
      .join(' '),
    [
      'connect-src',
      "'self'",
      'https://*.supabase.co',
      'https://api.brickognize.com',
      'https://*.ingest.sentry.io',
      'ws:',
      'wss:',
    ].join(' '),
    [
      'img-src',
      "'self'",
      'https://cdn.rebrickable.com',
      'https://img.bricklink.com',
      'https://storage.googleapis.com',
      'data:',
      'blob:',
    ].join(' '),
    // Next.js inlines critical CSS; keep inline styles allowed.
    "style-src 'self' 'unsafe-inline'",
    ['font-src', "'self'", 'https://fonts.gstatic.com', 'data:'].join(' '),
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ];

  return directives.join('; ');
}

/**
 * Apply CSP headers and request ID for distributed tracing.
 * Supabase session refresh is intentionally skipped here to
 * keep middleware compatible with the Edge runtime (avoids supabase-js Node
 * APIs that trigger warnings).
 */
export async function updateSession(request: NextRequest) {
  const requestId = getRequestId(request);

  // Clone headers and add request ID so route handlers can access it
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-request-id', requestId);

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  // Also set on response for client visibility
  response.headers.set('x-request-id', requestId);

  // Refresh Supabase auth cookies when configuration is available. This uses
  // the SSR client, which is safe in middleware/Edge and keeps cookies
  // up-to-date without needing access tokens on the client.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (supabaseUrl && supabaseAnonKey) {
    try {
      const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
        cookies: {
          getAll: () => request.cookies.getAll(),
          setAll: cookies => {
            for (const { name, value, options } of cookies) {
              // Update request cookies so downstream server components
              // (layout, pages) see the refreshed session in this same request.
              request.cookies.set(name, value);
              response.cookies.set(name, value, options);
            }
          },
        },
      });

      await supabase.auth.getUser();
    } catch {
      // Swallow refresh errors to keep middleware non-fatal.
    }
  }

  response.headers.set('Content-Security-Policy', buildRelaxedCsp());

  return response;
}
