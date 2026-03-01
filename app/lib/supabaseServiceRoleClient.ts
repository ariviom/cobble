import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/supabase/types';

import { getEnvOrThrow } from '@/app/lib/env';

let serviceRoleClient: SupabaseClient<Database> | null = null;

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
