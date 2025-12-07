import { NextResponse, type NextRequest } from 'next/server';

/**
 * Placeholder middleware helper. Supabase session refresh is disabled here
 * to keep the Edge bundle free of Node-only APIs.
 */
export async function updateSession(request: NextRequest) {
  // Pass-through while running in the Edge runtime.
  return NextResponse.next({
    request: {
      headers: request.headers,
    },
  });
}



