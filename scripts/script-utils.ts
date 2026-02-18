/**
 * Shared utility functions for scripts.
 */
import { createClient } from '@supabase/supabase-js';

import type { Database } from '@/supabase/types';

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export function createSupabaseClient() {
  const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const supabaseServiceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  return createClient<Database>(supabaseUrl, supabaseServiceRoleKey);
}
