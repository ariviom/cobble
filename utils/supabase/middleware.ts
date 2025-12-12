import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const isDev = process.env.NODE_ENV !== 'production';

// Allowlist specific inline script hashes that Next.js/hosting may inject and
// cannot be easily nonced. Add hashes here as needed to satisfy CSP without
// relaxing to unsafe-inline.
const INLINE_SCRIPT_HASHES: string[] = [
  // Reported from blocked inline script on account page.
  "'sha256-LYOkJ1qGEDu9pdqTOdqu9G86xq3oisQLByhnl/fcz/A='",
];

function getNonce(request: NextRequest): string {
  // Use web crypto in Edge; fall back to a time/random string if unavailable.
  const headerNonce = request.headers.get('x-nonce');
  if (headerNonce) return headerNonce;
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID();
  }
  return `nonce-${Date.now()}-${Math.random().toString(16).slice(2)}`;
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

// Report-only (strict) CSP to surface remaining inline/eval usage without
// breaking the app. This is the target policy once inline offenders are fixed.
function buildStrictReportOnlyCsp(nonce: string): string {
  const directives = [
    "default-src 'self'",
    [
      'script-src',
      `'self'`,
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      isDev ? "'unsafe-eval'" : null,
      ...INLINE_SCRIPT_HASHES,
    ]
      .filter(Boolean)
      .join(' '),
    [
      'connect-src',
      "'self'",
      'https://*.supabase.co',
      'https://api.brickognize.com',
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
 * Refresh Supabase session cookies for SSR-aware routes.
 * Node-only APIs are fine here; middleware runs in the Node runtime.
 */
export async function updateSession(request: NextRequest) {
  const response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const nonce = getNonce(request);
  const relaxedCsp = buildRelaxedCsp();
  const strictReportOnlyCsp = buildStrictReportOnlyCsp(nonce);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    response.headers.set('Content-Security-Policy', relaxedCsp);
    response.headers.set(
      'Content-Security-Policy-Report-Only',
      strictReportOnlyCsp
    );
    return response;
  }

  const pendingCookies: Array<{
    name: string;
    value: string;
    options?: CookieOptions;
  }> = [];

  // Create a server client that uses the request/response for cookie management.
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: cookies => {
        pendingCookies.push(...cookies);
      },
    },
  });

  // Touch auth state to trigger refresh if needed.
  await supabase.auth.getUser().catch(() => {
    // Swallow errors; middleware should not block requests on auth failure.
  });

  for (const { name, value, options } of pendingCookies) {
    response.cookies.set({ name, value, ...options });
  }

  response.headers.set('Content-Security-Policy', relaxedCsp);
  response.headers.set(
    'Content-Security-Policy-Report-Only',
    strictReportOnlyCsp
  );

  return response;
}
