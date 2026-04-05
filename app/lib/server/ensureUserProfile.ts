import 'server-only';

import { generateUsername } from '@/app/lib/generateUsername';
import type { SupabaseAuthServerClient } from '@/app/lib/supabaseAuthServerClient';
import type { Tables } from '@/supabase/types';

export type UserProfileRow = Tables<'user_profiles'>;

/**
 * Fetch the user's profile, creating one with an auto-generated username
 * if it does not yet exist. Also backfills a username on an existing profile
 * whose username is null.
 *
 * Safe to call on every account page load — a no-op when the profile is
 * already complete.
 */
export async function ensureUserProfile(
  supabase: SupabaseAuthServerClient,
  userId: string,
  oauthDisplayName: string | null = null
): Promise<UserProfileRow | null> {
  const { data: existing, error: fetchError } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (fetchError) return null;

  if (existing && existing.username) {
    return existing;
  }

  // Either: (a) no profile row, or (b) profile exists but username is null.
  // Try up to 3 random usernames to tolerate collisions on the unique index.
  const maxAttempts = 3;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const candidate = generateUsername();

    if (!existing) {
      const displayName = oauthDisplayName ?? candidate;
      const { data: created, error: insertError } = await supabase
        .from('user_profiles')
        .insert({
          user_id: userId,
          display_name: displayName,
          username: candidate,
        })
        .select('*')
        .maybeSingle();

      if (!insertError && created) return created;
      // 23505 = unique_violation; retry with a fresh username.
      if (insertError?.code !== '23505') return null;
    } else {
      const { data: updated, error: updateError } = await supabase
        .from('user_profiles')
        .update({ username: candidate })
        .eq('user_id', userId)
        .select('*')
        .maybeSingle();

      if (!updateError && updated) return updated;
      if (updateError?.code !== '23505') return existing;
    }
  }

  return existing ?? null;
}
