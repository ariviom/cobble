'use client';

import {
  DEFAULT_THEME_COLOR,
  DEVICE_THEME_COLOR_KEY,
  DEVICE_THEME_KEY,
  ResolvedTheme,
  ThemeColor,
  ThemePreference,
  THEME_COLOR_TO_VALUE,
  USER_THEME_COLOR_KEY,
  USER_THEME_KEY,
} from '@/app/components/theme/constants';
import { useSupabaseUser } from '@/app/hooks/useSupabaseUser';
import { getSupabaseBrowserClient } from '@/app/lib/supabaseClient';
import {
  createContext,
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

type ThemeScope = 'user' | 'device';

type ThemeContextValue = {
  theme: ThemePreference;
  resolvedTheme: ResolvedTheme;
  themeColor: ThemeColor;
  isLoading: boolean;
  setTheme: (theme: ThemePreference) => void;
  setThemeColor: (color: ThemeColor) => void;
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system';
}

function readStoredTheme(key: string): ThemePreference | null {
  if (typeof window === 'undefined') return null;
  try {
    const value = window.localStorage.getItem(key);
    return isThemePreference(value) ? value : null;
  } catch {
    return null;
  }
}

function isThemeColor(value: unknown): value is ThemeColor {
  return (
    value === 'blue' ||
    value === 'yellow' ||
    value === 'purple' ||
    value === 'red' ||
    value === 'green'
  );
}

function readStoredThemeColor(key: string): ThemeColor | null {
  if (typeof window === 'undefined') return null;
  try {
    const value = window.localStorage.getItem(key);
    return isThemeColor(value) ? value : null;
  } catch {
    return null;
  }
}

function persistThemePreference(scope: ThemeScope, theme: ThemePreference) {
  if (typeof window === 'undefined') return;
  const themeKey = scope === 'user' ? USER_THEME_KEY : DEVICE_THEME_KEY;
  try {
    window.localStorage.setItem(themeKey, theme);
  } catch {
    // Ignore storage exceptions (e.g., private mode).
  }
}

function persistThemeColor(scope: ThemeScope, color: ThemeColor) {
  if (typeof window === 'undefined') return;
  const colorKey =
    scope === 'user' ? USER_THEME_COLOR_KEY : DEVICE_THEME_COLOR_KEY;
  try {
    window.localStorage.setItem(colorKey, color);
  } catch {
    // Ignore storage errors.
  }
}

function clearScopeStorage(scope: ThemeScope) {
  if (typeof window === 'undefined') return;
  const themeKey = scope === 'user' ? USER_THEME_KEY : DEVICE_THEME_KEY;
  const colorKey =
    scope === 'user' ? USER_THEME_COLOR_KEY : DEVICE_THEME_COLOR_KEY;
  try {
    window.localStorage.removeItem(themeKey);
    window.localStorage.removeItem(colorKey);
  } catch {
    // Ignore storage errors.
  }
}

function resolveThemePreference(theme: ThemePreference): ResolvedTheme {
  if (theme === 'light' || theme === 'dark') return theme;
  if (typeof window === 'undefined') return 'light';
  if (typeof window.matchMedia !== 'function') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

function applyDocumentClass(color: ResolvedTheme) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (!root) return;
  if (color === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
}

async function saveUserPreferences(
  userId: string,
  preferences: {
    theme?: ThemePreference;
    themeColor?: ThemeColor;
  }
): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const payload: {
    user_id: string;
    updated_at: string;
    theme?: ThemePreference;
    theme_color?: ThemeColor;
  } = {
    user_id: userId,
    updated_at: new Date().toISOString(),
  };

  if (preferences.theme !== undefined) {
    payload.theme = preferences.theme;
  }

  if (preferences.themeColor !== undefined) {
    payload.theme_color = preferences.themeColor;
  }

  await supabase
    .from('user_preferences')
    .upsert(payload, { onConflict: 'user_id' });
}

export function ThemeProvider({ children }: PropsWithChildren) {
  const { user } = useSupabaseUser();
  const [theme, setThemeState] = useState<ThemePreference>('system');
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>('light');
  const [scope, setScope] = useState<ThemeScope>('device');
  const [themeColor, setThemeColorState] = useState<ThemeColor>(
    DEFAULT_THEME_COLOR
  );
  const [colorScope, setColorScope] = useState<ThemeScope>('device');
  const [isInitialized, setIsInitialized] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const fetchedUserIdRef = useRef<string | null>(null);

  const determineInitialTheme = useCallback(() => {
    const storedUserTheme = readStoredTheme(USER_THEME_KEY);
    const storedDeviceTheme = readStoredTheme(DEVICE_THEME_KEY);

    if (user) {
      if (storedUserTheme) {
        return {
          theme: storedUserTheme,
          scope: 'user' as ThemeScope,
        };
      }

      if (storedDeviceTheme) {
        return {
          theme: storedDeviceTheme,
          scope: 'device' as ThemeScope,
        };
      }

      return { theme: 'system' as ThemePreference, scope: 'user' as ThemeScope };
    }

    return {
      theme: storedDeviceTheme ?? ('system' as ThemePreference),
      scope: 'device' as ThemeScope,
    };
  }, [user]);

  const determineInitialThemeColor = useCallback(() => {
    const storedUserColor = readStoredThemeColor(USER_THEME_COLOR_KEY);
    const storedDeviceColor = readStoredThemeColor(DEVICE_THEME_COLOR_KEY);

    if (user) {
      if (storedUserColor) {
        return {
          color: storedUserColor,
          scope: 'user' as ThemeScope,
        };
      }

      if (storedDeviceColor) {
        return {
          color: storedDeviceColor,
          scope: 'device' as ThemeScope,
        };
      }

      return {
        color: DEFAULT_THEME_COLOR,
        scope: 'user' as ThemeScope,
      };
    }

    return {
      color: storedDeviceColor ?? DEFAULT_THEME_COLOR,
      scope: 'device' as ThemeScope,
    };
  }, [user]);

  const applyTheme = useCallback(
    (nextTheme: ThemePreference, scopeOverride?: ThemeScope) => {
      const nextScope = scopeOverride ?? (user ? 'user' : 'device');
      const nextResolved = resolveThemePreference(nextTheme);
      setThemeState(nextTheme);
      setResolvedTheme(nextResolved);
      setScope(nextScope);
      applyDocumentClass(nextResolved);
      persistThemePreference(nextScope, nextTheme);
    },
    [user]
  );

  const applyThemeColor = useCallback(
    (nextColor: ThemeColor, scopeOverride?: ThemeScope) => {
      const nextScope = scopeOverride ?? (user ? 'user' : 'device');
      const cssValue =
        THEME_COLOR_TO_VALUE[nextColor] ??
        THEME_COLOR_TO_VALUE[DEFAULT_THEME_COLOR];
      setThemeColorState(nextColor);
      setColorScope(nextScope);
      if (typeof document !== 'undefined') {
        const root = document.documentElement;
        root?.style.setProperty('--color-theme-primary', cssValue);
      }
      persistThemeColor(nextScope, nextColor);
    },
    [user]
  );

  const setTheme = useCallback(
    (nextTheme: ThemePreference) => {
      const currentTheme = nextTheme;
      applyTheme(currentTheme, user ? 'user' : scope);
      if (user) {
        void saveUserPreferences(user.id, {
          theme: currentTheme,
          themeColor,
        }).catch(error => {
          console.error('Failed to persist theme preference', error);
        });
      }
    },
    [applyTheme, scope, themeColor, user]
  );

  const setThemeColor = useCallback(
    (nextColor: ThemeColor) => {
      applyThemeColor(nextColor, user ? 'user' : colorScope);
      if (user) {
        void saveUserPreferences(user.id, {
          theme,
          themeColor: nextColor,
        }).catch(error => {
          console.error('Failed to persist theme color', error);
        });
      }
    },
    [applyThemeColor, colorScope, theme, user]
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const initialTheme = determineInitialTheme();
    applyTheme(initialTheme.theme, initialTheme.scope);
    const initialColor = determineInitialThemeColor();
    applyThemeColor(initialColor.color, initialColor.scope);
    setIsInitialized(true);
  }, [
    applyTheme,
    applyThemeColor,
    determineInitialTheme,
    determineInitialThemeColor,
  ]);

  useEffect(() => {
    if (!user) {
      fetchedUserIdRef.current = null;
      clearScopeStorage('user');
      const deviceTheme = readStoredTheme(DEVICE_THEME_KEY) ?? 'system';
      applyTheme(deviceTheme, 'device');
      const deviceColor =
        readStoredThemeColor(DEVICE_THEME_COLOR_KEY) ?? DEFAULT_THEME_COLOR;
      applyThemeColor(deviceColor, 'device');
      return;
    }

    if (fetchedUserIdRef.current === user.id) {
      return;
    }

    const storedUserTheme = readStoredTheme(USER_THEME_KEY);
    const storedUserColor = readStoredThemeColor(USER_THEME_COLOR_KEY);
    const hasStoredTheme = !!storedUserTheme;
    const hasStoredColor = !!storedUserColor;

    if (storedUserTheme) {
      applyTheme(storedUserTheme, 'user');
    }
    if (storedUserColor) {
      applyThemeColor(storedUserColor, 'user');
    }

    if (hasStoredTheme && hasStoredColor) {
      fetchedUserIdRef.current = user.id;
      return;
    }

    let cancelled = false;
    setIsSyncing(true);

    const loadPreference = async () => {
      try {
        const supabase = getSupabaseBrowserClient();
        const { data, error } = await supabase
          .from('user_preferences')
          .select('theme, theme_color')
          .eq('user_id', user.id)
          .maybeSingle();

        if (cancelled) return;

        if (error) {
          throw error;
        }

        if (data?.theme && isThemePreference(data.theme)) {
          applyTheme(data.theme, 'user');
        } else if (!hasStoredTheme) {
          const fallbackTheme = readStoredTheme(DEVICE_THEME_KEY) ?? 'system';
          applyTheme(fallbackTheme, 'device');
        }

        if (data?.theme_color && isThemeColor(data.theme_color)) {
          applyThemeColor(data.theme_color, 'user');
        } else if (!hasStoredColor) {
          const fallbackColor =
            readStoredThemeColor(DEVICE_THEME_COLOR_KEY) ??
            DEFAULT_THEME_COLOR;
          applyThemeColor(fallbackColor, 'device');
        }

        fetchedUserIdRef.current = user.id;
      } catch (error) {
        console.error('Failed to load theme preference', error);
      } finally {
        if (!cancelled) {
          setIsSyncing(false);
        }
      }
    };

    void loadPreference();

    return () => {
      cancelled = true;
    };
  }, [applyTheme, applyThemeColor, user]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (theme !== 'system') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const handleChange = (event: MediaQueryListEvent) => {
      const nextResolved: ResolvedTheme = event.matches ? 'dark' : 'light';
      setResolvedTheme(nextResolved);
      applyDocumentClass(nextResolved);
    };

    const initialResolved: ResolvedTheme = mediaQuery.matches ? 'dark' : 'light';
    setResolvedTheme(initialResolved);
    applyDocumentClass(initialResolved);

    mediaQuery.addEventListener('change', handleChange);

    return () => {
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, [theme]);

  const contextValue = useMemo<ThemeContextValue>(
    () => ({
      theme,
      resolvedTheme,
      themeColor,
      isLoading: !isInitialized || isSyncing,
      setTheme,
      setThemeColor,
    }),
    [
      isInitialized,
      isSyncing,
      resolvedTheme,
      setTheme,
      setThemeColor,
      theme,
      themeColor,
    ]
  );

  return (
    <ThemeContext.Provider value={contextValue}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useThemeContext(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useThemeContext must be used within ThemeProvider');
  }
  return context;
}

