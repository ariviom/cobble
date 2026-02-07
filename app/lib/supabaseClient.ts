import type { Database } from '@/supabase/types';
import { createBrowserClient } from '@supabase/ssr';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY'
  );
}

const createBrowserSupabaseClient = () =>
  createBrowserClient<Database>(supabaseUrl, supabaseAnonKey);

type BrowserClient = ReturnType<typeof createBrowserSupabaseClient>;

let browserClient: BrowserClient | null = null;

export function getSupabaseBrowserClient(): BrowserClient {
  if (!browserClient) {
    browserClient = createBrowserSupabaseClient();
  }
  return browserClient;
}

/**
 * Get the redirect URL for OAuth callbacks.
 * Points to /auth/callback so the PKCE code exchange happens server-side.
 * Uses window.location.origin to support any local port (3000, 3001, etc).
 */
export function getAuthRedirectUrl(): string {
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/auth/callback`;
  }
  // Fallback for server-side (shouldn't be used for OAuth)
  const origin =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.VERCEL_URL ||
    'http://localhost:3000';
  const protocol = origin.startsWith('http') ? '' : 'https://';
  return `${protocol}${origin}/auth/callback`;
}
