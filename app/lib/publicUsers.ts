import { getSupabaseServiceRoleClient } from '@/app/lib/supabaseServiceRoleClient';
import type { Tables } from '@/supabase/types';
import { USERNAME_REGEX } from '@/app/lib/users';

export type PublicUserProfile = Pick<
  Tables<'user_profiles'>,
  'user_id' | 'username' | 'display_name' | 'lists_public'
>;

export type PrivateUserInfo = Pick<
  Tables<'user_profiles'>,
  'user_id' | 'username' | 'display_name'
>;

export type ResolvedUser =
  | { type: 'public'; profile: PublicUserProfile }
  | { type: 'private'; info: PrivateUserInfo }
  | { type: 'not_found' };

export async function resolvePublicUser(
  handle: string
): Promise<ResolvedUser> {
  const supabase = getSupabaseServiceRoleClient();

  const isUsername = USERNAME_REGEX.test(handle);

  let query = supabase
    .from('user_profiles')
    .select<'user_id,username,display_name,lists_public'>(
      'user_id,username,display_name,lists_public'
    );

  if (isUsername) {
    // Usernames are stored case-insensitively (unique index on lower(username))
    // Use ilike for case-insensitive matching
    query = query.ilike('username', handle);
  } else {
    // For user_id (UUID), use exact match
    query = query.eq('user_id', handle);
  }

  const { data, error } = await query.maybeSingle();

  if (error || !data) {
    return { type: 'not_found' };
  }

  if (!data.lists_public) {
    return {
      type: 'private',
      info: {
        user_id: data.user_id,
        username: data.username,
        display_name: data.display_name,
      },
    };
  }

  return {
    type: 'public',
    profile: data as PublicUserProfile,
  };
}


