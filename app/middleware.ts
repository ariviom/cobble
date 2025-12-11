import type { NextRequest } from 'next/server';
import { updateSession } from '@/utils/supabase/middleware';

export function middleware(request: NextRequest) {
  return updateSession(request);
}

// Limit session-refresh middleware to routes that rely on Supabase auth.
// Avoids cookie churn and latency on static assets and public APIs.
export const config = {
  matcher: [
    '/account/:path*',
    '/collection/:path*',
    '/user/:path*',
    '/group/:path*',
    '/join/:path*',
    // Auth-dependent APIs
    '/api/group-sessions/:path*',
    '/api/prices/:path*',
    '/api/user-sets/:path*',
    '/api/user/:path*',
    '/api/sync',
  ],
};
