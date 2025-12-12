import { createServerClient } from '@supabase/ssr';
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
 * Apply CSP headers. Supabase session refresh is intentionally skipped here to
 * keep middleware compatible with the Edge runtime (avoids supabase-js Node
 * APIs that trigger warnings).
 */
export async function updateSession(request: NextRequest) {
  const response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

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

  const nonce = getNonce(request);
  const relaxedCsp = buildRelaxedCsp();
  const strictReportOnlyCsp = buildStrictReportOnlyCsp(nonce);

  response.headers.set('Content-Security-Policy', relaxedCsp);
  response.headers.set(
    'Content-Security-Policy-Report-Only',
    strictReportOnlyCsp
  );

  return response;
}
