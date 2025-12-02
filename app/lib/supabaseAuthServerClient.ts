import 'server-only';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

import type { Database } from '@/supabase/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerComponentCookieMethods } from '@/utils/supabase/cookies';

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
  const cookieMethods = createServerComponentCookieMethods(cookieStore);

  return createServerClient<Database, 'public'>(supabaseUrl, supabaseAnonKey, {
    cookies: cookieMethods,
  });
}


