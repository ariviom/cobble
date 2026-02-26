import { NextRequest, NextResponse } from 'next/server';

const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:3001',
  'https://brick-party.com',
  'https://www.brick-party.com',
];

function parseCsvEnv(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);
}

function getAllowedOrigins(): Set<string> {
  const envOrigin = process.env.NEXT_PUBLIC_APP_URL;
  const previewOrigin = process.env.NEXT_PUBLIC_PREVIEW_URL;
  const stagingOrigin = process.env.NEXT_PUBLIC_STAGING_URL;
  const extraOrigins = parseCsvEnv(process.env.CSRF_ALLOWED_ORIGINS);

  const origins = new Set<string>(DEFAULT_ALLOWED_ORIGINS);
  if (envOrigin) origins.add(envOrigin);
  if (previewOrigin) origins.add(previewOrigin);
  if (stagingOrigin) origins.add(stagingOrigin);
  for (const origin of extraOrigins) origins.add(origin);

  return origins;
}

/**
 * Validate request origin against allowed origins.
 * Returns 'valid' if origin matches, 'missing' if no origin headers present,
 * or 'invalid' if origin doesn't match allowed list.
 */
export function validateOrigin(
  req: NextRequest
): 'valid' | 'missing' | 'invalid' {
  const origin = req.headers.get('origin');
  const referer = req.headers.get('referer');

  // No origin headers present - caller must decide how to handle
  // (e.g., require CSRF token for mutations)
  if (!origin && !referer) return 'missing';

  const allowed = getAllowedOrigins();
  let candidate: string | null = origin;

  if (!candidate && referer) {
    try {
      candidate = new URL(referer).origin;
    } catch {
      candidate = null;
    }
  }

  if (candidate && allowed.has(candidate)) return 'valid';

  // If we had headers but couldn't derive a valid origin (e.g., malformed referer), deny.
  return 'invalid';
}

export function withCsrfProtection(
  handler: (req: NextRequest) => Promise<NextResponse> | NextResponse
) {
  return async (req: NextRequest) => {
    // GET requests are read-only, no CSRF protection needed
    if (req.method === 'GET') {
      return handler(req);
    }

    const originStatus = validateOrigin(req);

    // If origin is explicitly invalid (cross-origin attack), always deny
    if (originStatus === 'invalid') {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }

    const csrfHeader = req.headers.get('x-csrf-token');
    const csrfCookie = req.cookies.get('csrf_token')?.value ?? null;

    // If origin headers are missing (privacy tools, older browsers), require
    // double-submit validation: both x-csrf-token header AND csrf_token cookie
    // must be present and match. Cookie alone is insufficient because browsers
    // send cookies automatically on cross-site requests.
    if (originStatus === 'missing') {
      if (!csrfHeader || !csrfCookie || csrfHeader !== csrfCookie) {
        return NextResponse.json({ error: 'forbidden' }, { status: 403 });
      }
    }

    // If CSRF header is provided, it must match the cookie (double-submit validation)
    if (csrfHeader && (!csrfCookie || csrfHeader !== csrfCookie)) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }

    return handler(req);
  };
}
