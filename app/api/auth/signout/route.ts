import 'server-only';

import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

import type { Database } from '@/supabase/types';

type SupabaseCookie = {
  name: string;
  value: string;
  options?: CookieOptions;
};

export async function POST(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json(
      { error: 'Missing Supabase environment configuration.' },
      { status: 500 }
    );
  }

  const pendingCookies: SupabaseCookie[] = [];

  const supabase = createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll: () =>
        request.cookies.getAll().map(cookie => ({
          name: cookie.name,
          value: cookie.value,
        })),
      setAll: cookies => {
        pendingCookies.push(...cookies);
      },
    },
  });

  try {
    const { error } = await supabase.auth.signOut();

    const response = NextResponse.json(
      error ? { error: 'Failed to sign out.' } : { success: true },
      {
        status: error ? 500 : 200,
      }
    );

    for (const { name, value, options } of pendingCookies) {
      response.cookies.set({ name, value, ...options });
    }

    return response;
  } catch {
    const response = NextResponse.json(
      { error: 'Unexpected error signing out.' },
      { status: 500 }
    );

    for (const { name, value, options } of pendingCookies) {
      response.cookies.set({ name, value, ...options });
    }

    return response;
  }
}
