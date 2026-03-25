import 'server-only';

import type { Tables } from '@/supabase/types';
import type { SupabaseAuthServerClient } from '@/app/lib/supabaseAuthServerClient';

export type UserProfileRow = Tables<'user_profiles'>;

/**
 * Fetch a user profile by user ID.
 * Returns the full profile row, or null if not found.
 */
export async function getUserProfile(
  supabase: SupabaseAuthServerClient,
  userId: string
): Promise<UserProfileRow | null> {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) return null;
  return data;
}

/**
 * Fetch just the username for a user.
 * Lighter query than getUserProfile when you only need the username.
 */
export async function getUserUsername(
  supabase: SupabaseAuthServerClient,
  userId: string
): Promise<string | null> {
  const { data } = await supabase
    .from('user_profiles')
    .select('username')
    .eq('user_id', userId)
    .maybeSingle();

  return data?.username ?? null;
}
