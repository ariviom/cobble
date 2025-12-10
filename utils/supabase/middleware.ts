import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

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

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return response;
  }

  // Create a server client that uses the request/response for cookie management.
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: cookies => {
        for (const { name, value, options } of cookies) {
          response.cookies.set({ name, value, ...options });
        }
      },
    },
  });

  // Touch auth state to trigger refresh if needed.
  await supabase.auth.getUser().catch(() => {
    // Swallow errors; middleware should not block requests on auth failure.
  });

  return response;
}
