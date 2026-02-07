import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import type { Database } from '@/supabase/types';

/**
 * Auth callback handler for Supabase PKCE code exchange.
 *
 * Handles both OAuth redirects (Google sign-in) and email confirmation links
 * (signup, password reset, magic link). Supabase redirects here with a `code`
 * parameter which we exchange for a session, then redirect to the app.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);

  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/';

  if (code) {
    const cookieStore = await cookies();

    const supabase = createServerClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              );
            } catch {
              // The `setAll` method was called from a Server Component.
              // This can be ignored if you have middleware refreshing
              // user sessions.
            }
          },
        },
      }
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // Successful code exchange - redirect to the intended destination
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Code exchange failed or no code provided - redirect to login with error
  return NextResponse.redirect(`${origin}/login?error=auth_callback_error`);
}
