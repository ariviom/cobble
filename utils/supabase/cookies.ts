import type { CookieMethodsServer, CookieOptions } from '@supabase/ssr';

/**
 * Create CookieMethodsServer for use with @supabase/ssr's createServerClient.
 *
 * This abstraction allows the same cookie handling pattern to be used in both:
 * - Middleware (using NextRequest/NextResponse cookies)
 * - Server Components/Route Handlers (using next/headers cookies)
 */
export function createCookieMethods(options: {
  getAll: () =>
    | Array<{ name: string; value: string }>
    | null
    | Promise<Array<{ name: string; value: string }> | null>;
  setAll: (
    cookies: Array<{ name: string; value: string; options?: CookieOptions }>
  ) => void | Promise<void>;
}): CookieMethodsServer {
  return {
    getAll: async () => {
      const all = await options.getAll();
      if (!all || all.length === 0) return null;
      return all.map(cookie => ({
        name: cookie.name,
        value: cookie.value,
      }));
    },
    setAll: async cookiesToSet => {
      for (const cookie of cookiesToSet) {
        const cookieOptions: CookieOptions = cookie.options ?? {};
        await options.setAll([
          {
            name: cookie.name,
            value: cookie.value,
            options: cookieOptions,
          },
        ]);
      }
    },
  };
}

/**
 * Create CookieMethodsServer for middleware context (NextRequest/NextResponse).
 */
export function createMiddlewareCookieMethods(
  request: { cookies: { getAll: () => Array<{ name: string; value: string }> } },
  response: {
    cookies: {
      set: (options: {
        name: string;
        value: string;
        [key: string]: unknown;
      }) => void;
    };
  }
): CookieMethodsServer {
  return {
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
}

/**
 * Create CookieMethodsServer for Server Component context (next/headers).
 *
 * Server Components cannot mutate cookies (and Netlify Edge will throw).
 * We intentionally no-op setAll to avoid runtime errors; middleware/route
 * handlers are responsible for refresh token writes.
 */
export function createServerComponentCookieMethods(cookieStore: {
  getAll: () => Array<{ name: string; value: string }>;
  set: (options: { name: string; value: string; [key: string]: unknown }) => void;
}): CookieMethodsServer {
  return {
    getAll: async () => {
      const all = cookieStore.getAll();
      if (!all || all.length === 0) return null;
      return all.map(cookie => ({
        name: cookie.name,
        value: cookie.value,
      }));
    },
    setAll: async () => {
      // No-op: cookie mutation must happen in middleware or route handlers.
    },
  };
}









