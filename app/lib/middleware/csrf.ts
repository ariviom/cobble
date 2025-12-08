import { NextRequest, NextResponse } from 'next/server';

const DEFAULT_ALLOWED_ORIGINS = ['http://localhost:3000'];

function getAllowedOrigins(): string[] {
  const envOrigin = process.env.NEXT_PUBLIC_APP_URL;
  const origins = DEFAULT_ALLOWED_ORIGINS.slice();
  if (envOrigin) origins.push(envOrigin);
  return origins.filter(Boolean);
}

export function validateOrigin(req: NextRequest): boolean {
  const origin = req.headers.get('origin');
  const referer = req.headers.get('referer');

  // Allow same-origin requests (no origin/referer header)
  if (!origin && !referer) return true;

  const allowed = getAllowedOrigins();
  const candidate = origin ?? (referer ? new URL(referer).origin : null);
  return candidate ? allowed.includes(candidate) : false;
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
