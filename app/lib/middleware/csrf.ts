import { NextRequest, NextResponse } from 'next/server';

const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:3000',
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

export function validateOrigin(req: NextRequest): boolean {
  const origin = req.headers.get('origin');
  const referer = req.headers.get('referer');

  // Allow same-origin/fetch without origin/referer (first-party navigation or same-site fetch)
  if (!origin && !referer) return true;

  const allowed = getAllowedOrigins();
  let candidate: string | null = origin;

  if (!candidate && referer) {
    try {
      candidate = new URL(referer).origin;
    } catch {
      candidate = null;
    }
  }

  if (candidate && allowed.has(candidate)) return true;

  // If we had headers but couldn't derive a valid origin (e.g., malformed referer), deny.
  return false;
}

export function withCsrfProtection(
  handler: (req: NextRequest) => Promise<NextResponse> | NextResponse
) {
  return async (req: NextRequest) => {
    if (req.method !== 'GET' && !validateOrigin(req)) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
    return handler(req);
  };
}
