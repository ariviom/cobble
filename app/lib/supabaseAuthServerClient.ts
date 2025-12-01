import 'server-only';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

import type { Database } from '@/supabase/types';

/**
 * Supabase client for authenticated server components.
 *
 * This uses @supabase/ssr and the Next.js cookie store so that auth state
 * (session tokens) can be read on the server. It should be used only for
 * per-user, auth-aware operations – catalog reads should continue to use
 * the anon server client (`getSupabaseServerClient`).
 */
export async function getSupabaseAuthServerClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY'
    );
  }

  const cookieStore = await cookies();

  return createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(
        name: string,
        value: string,
        options: Parameters<typeof cookieStore.set>[2]
      ) {
        cookieStore.set(name, value, options);
      },
      remove(name: string, options: Parameters<typeof cookieStore.set>[2]) {
        cookieStore.set(name, '', { ...options, maxAge: 0 });
      },
    },
  });
}


