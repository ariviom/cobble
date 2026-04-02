import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Environment configuration for E2E tests.
 *
 * These default to local Supabase (`supabase start`) values.
 * Override via env vars for remote testing.
 */
const config = {
  supabaseUrl: process.env.E2E_SUPABASE_URL ?? 'http://127.0.0.1:54321',
  supabaseAnonKey:
    process.env.E2E_SUPABASE_ANON_KEY ??
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0',
  supabaseServiceRoleKey:
    process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ??
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU',
} as const;

let _serviceClient: SupabaseClient | null = null;

/** Service-role client for test setup/teardown (bypasses RLS). */
export function getServiceClient(): SupabaseClient {
  if (!_serviceClient) {
    _serviceClient = createClient(
      config.supabaseUrl,
      config.supabaseServiceRoleKey,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );
  }
  return _serviceClient;
}

let _anonClient: SupabaseClient | null = null;

/** Anon client for unauthenticated API calls. */
export function getAnonClient(): SupabaseClient {
  if (!_anonClient) {
    _anonClient = createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return _anonClient;
}

export { config };
