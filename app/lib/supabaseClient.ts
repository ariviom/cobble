import type { Database } from '@/supabase/types';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY'
  );
}

const createBrowserClient = () =>
  createClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: {
      // Ensure redirects use the current origin
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
  });

type BrowserClient = ReturnType<typeof createBrowserClient>;

let browserClient: BrowserClient | null = null;

export function getSupabaseBrowserClient(): BrowserClient {
  if (!browserClient) {
    browserClient = createBrowserClient();
  }
  return browserClient;
}

/**
 * Get the redirect URL for OAuth callbacks.
 * In development: http://localhost:3000/account
 * In production: https://brick-party.com/account
 */
export function getAuthRedirectUrl(): string {
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/account`;
  }
  // Fallback for server-side (shouldn't be used for OAuth)
  const origin = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL || 'http://localhost:3000';
  const protocol = origin.startsWith('http') ? '' : 'https://';
  return `${protocol}${origin}/account`;
}


