import {
  createServerClient,
  type CookieMethodsServer,
  type CookieOptions,
} from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

import type { Database } from '@/supabase/types';

/**
 * Middleware helper to keep Supabase auth cookies in sync for SSR.
 *
 * This refreshes the session on each matched request so that server components
 * using the SSR client can reliably read the current user from cookies.
 */
export async function updateSession(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.next();
  }

  const response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const cookieMethods: CookieMethodsServer = {
    getAll: async () => {
      const all = request.cookies.getAll();
      if (!all || all.length === 0) return null;
      return all.map(cookie => ({
        name: cookie.name,
        value: cookie.value,
      }));
    },
    setAll: async cookiesToSet => {
      for (const cookie of cookiesToSet) {
        const options: CookieOptions = cookie.options ?? {};
        response.cookies.set({
          name: cookie.name,
          value: cookie.value,
          ...options,
        });
      }
    },
  };

  const supabase = createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: cookieMethods,
  });

  try {
    // Trigger a session refresh so cookies stay up to date for SSR usage.
    await supabase.auth.getSession();
  } catch {
    // Ignore errors; downstream auth checks in route handlers or components
    // will still behave correctly based on whatever cookies are present.
  }

  return response;
}



