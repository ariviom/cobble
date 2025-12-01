import 'server-only';

import {
  createServerClient,
  type CookieMethodsServer,
  type CookieOptions,
} from '@supabase/ssr';
import { cookies } from 'next/headers';

import type { Database } from '@/supabase/types';
import type { SupabaseClient } from '@supabase/supabase-js';

export type SupabaseAuthServerClient = SupabaseClient<Database, 'public'>;

/**
 * Supabase client for authenticated server components.
 *
 * This uses @supabase/ssr with Next.js cookies, implementing the
 * `CookieMethodsServer` interface (getAll/setAll) so that auth state
 * (session tokens) can be read and updated on the server.
 */
export async function getSupabaseAuthServerClient(): Promise<SupabaseAuthServerClient> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY'
    );
  }

  const cookieStore = await cookies();

  const cookieMethods: CookieMethodsServer = {
    getAll: async () => {
      const all = cookieStore.getAll();
      if (!all || all.length === 0) return null;
      return all.map(cookie => ({
        name: cookie.name,
        value: cookie.value,
      }));
    },
    setAll: async cookiesToSet => {
      for (const cookie of cookiesToSet) {
        const options: CookieOptions = cookie.options ?? {};
        cookieStore.set({
          name: cookie.name,
          value: cookie.value,
          ...options,
        });
      }
    },
  };

  return createServerClient<Database, 'public'>(supabaseUrl, supabaseAnonKey, {
    cookies: cookieMethods,
  });
}


