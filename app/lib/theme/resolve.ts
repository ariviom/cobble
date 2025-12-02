import type {
  ResolvedTheme,
  ThemePreference,
} from '@/app/components/theme/constants';

export type ThemeSource = 'db' | 'cookie' | 'system';

type ResolveThemeArgs = {
  dbTheme: ThemePreference | null;
  cookieTheme: ThemePreference | null;
  systemTheme: ResolvedTheme;
};

type ResolveThemeResult = {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  source: ThemeSource;
};

/**
 * Resolve the active theme preference and concrete resolved theme.
 *
 * Precedence:
 * 1. dbTheme (when user is authenticated and preference exists)
 * 2. cookieTheme (mirrored from previous resolutions)
 * 3. systemTheme (falls back to 'system' preference with given resolved value)
 */
export function resolveThemePreference({
  dbTheme,
  cookieTheme,
  systemTheme,
}: ResolveThemeArgs): ResolveThemeResult {
  const normalize = (value: unknown): ThemePreference | null => {
    return value === 'light' || value === 'dark' || value === 'system'
      ? value
      : null;
  };

  const db = normalize(dbTheme);
  const cookie = normalize(cookieTheme);

  if (db) {
    return {
      preference: db,
      resolved: db === 'system' ? systemTheme : db,
      source: 'db',
    };
  }

  if (cookie) {
    return {
      preference: cookie,
      resolved: cookie === 'system' ? systemTheme : cookie,
      source: 'cookie',
    };
  }

  // No persisted preference; respect system, but express it via 'system'
  return {
    preference: 'system',
    resolved: systemTheme,
    source: 'system',
  };
}




