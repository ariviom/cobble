export const USERNAME_REGEX = /^[a-z0-9_]{3,24}$/;

const RESERVED_USERNAMES = new Set<string>([
  'login',
  'account',
  'search',
  'sets',
  'identify',
  'api',
  'u',
  'id',
  'admin',
  'support',
  'help',
]);

export function normalizeUsernameCandidate(input: string): string | null {
  const value = input.trim().toLowerCase();
  if (value.length === 0) return null;
  if (!USERNAME_REGEX.test(value)) return null;
  if (RESERVED_USERNAMES.has(value)) return null;
  return value;
}

type UserProfileIdentity = {
  user_id: string;
  username: string | null;
};

export function buildUserHandle(profile: UserProfileIdentity): string {
  if (profile.username && profile.username.length > 0) {
    return profile.username;
  }
  return profile.user_id;
}





