import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/supabase/types';

let serviceRoleClient: SupabaseClient<Database> | null = null;

function getEnvOrThrow(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function getSupabaseServiceRoleClient(): SupabaseClient<Database> {
  if (serviceRoleClient) {
    return serviceRoleClient;
  }

  const supabaseUrl = getEnvOrThrow('NEXT_PUBLIC_SUPABASE_URL');
  const serviceRoleKey = getEnvOrThrow('SUPABASE_SERVICE_ROLE_KEY');

  serviceRoleClient = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  return serviceRoleClient;
}




