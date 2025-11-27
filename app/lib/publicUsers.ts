import { getSupabaseServiceRoleClient } from '@/app/lib/supabaseServiceRoleClient';
import type { Tables } from '@/supabase/types';
import { USERNAME_REGEX } from '@/app/lib/users';

export type PublicUserProfile = Pick<
  Tables<'user_profiles'>,
  'user_id' | 'username' | 'display_name' | 'collections_public'
>;

export async function resolvePublicUser(
  handle: string
): Promise<PublicUserProfile | null> {
  const supabase = getSupabaseServiceRoleClient();

  const isUsername = USERNAME_REGEX.test(handle);

  const query = supabase
    .from('user_profiles')
    .select<'user_id,username,display_name,collections_public'>(
      'user_id,username,display_name,collections_public'
    )
    .eq(isUsername ? 'username' : 'user_id', handle)
    .maybeSingle();

  const { data, error } = await query;

  if (error || !data) {
    return null;
  }

  if (!data.collections_public) {
    return null;
  }

  return data as PublicUserProfile;
}


