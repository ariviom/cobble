'use client';

import {
  DEFAULT_THEME_COLOR,
  THEME_COLOR_HEX,
  THEME_COLOR_TO_VALUE,
  THEME_CONTRAST_TEXT,
  THEME_TEXT_COLORS_DARK,
  THEME_TEXT_COLORS_LIGHT,
  ThemeColor,
  ThemePreference,
  USER_THEME_COLOR_KEY,
  USER_THEME_KEY,
} from '@/app/components/theme/constants';
import { useSupabaseUser } from '@/app/hooks/useSupabaseUser';
import { getSupabaseBrowserClient } from '@/app/lib/supabaseClient';
import {
  ThemeProvider as NextThemesProvider,
  useTheme as useNextTheme,
} from 'next-themes';
import {
  createContext,
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

type ThemeContextValue = {
  theme: ThemePreference;
  resolvedTheme: 'light' | 'dark';
  themeColor: ThemeColor;
  isLoading: boolean;
  setTheme: (theme: ThemePreference) => void;
  setThemeColor: (color: ThemeColor) => void;
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

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

function persistThemeColor(color: ThemeColor) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(USER_THEME_COLOR_KEY, color);
  } catch {
    // ignore storage errors
  }
}

const FAVICON_SVG_PATHS =
  'M489.34 232.72 287.26 132.36c-9.76-4.85-20.37-7.27-30.97-7.27s-21.54 2.5-31.42 7.49l-59.5 30.09 29.04 14.42c17.26-7.11 38.55-11.31 61.6-11.31 57.57 0 104.23 26.19 104.23 58.49v23.95c0 32.3-46.67 58.49-104.23 58.49s-104.23-26.19-104.23-58.49V224.28c0-6.6 1.95-12.94 5.53-18.85l-38.6-19.17-96.16 48.62c-12.79 6.47-12.72 24.75.11 31.13l202.08 100.36c9.76 4.85 20.37 7.27 30.97 7.27s21.54-2.5 31.42-7.49l202.31-102.29c12.79-6.47 12.72-24.75-.11-31.13Z M256 183.72c-49.38 0-86.29 21.4-86.29 40.54s36.9 40.54 86.29 40.54 86.29-21.4 86.29-40.54-36.9-40.54-86.29-40.54Z';

function updateFavicon(iconColor: string) {
  if (typeof document === 'undefined') return;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="7 5.5 508 508"><path fill="${iconColor}" d="${FAVICON_SVG_PATHS}"/></svg>`;
  const url = `data:image/svg+xml,${encodeURIComponent(svg)}`;
  let link = document.querySelector<HTMLLinkElement>(
    'link[rel="icon"][type="image/svg+xml"]'
  );
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    link.type = 'image/svg+xml';
    document.head.appendChild(link);
  }
  link.href = url;
}

function applyThemeColor(
  nextColor: ThemeColor,
  resolvedTheme?: 'light' | 'dark'
) {
  const cssValue =
    THEME_COLOR_TO_VALUE[nextColor] ??
    THEME_COLOR_TO_VALUE[DEFAULT_THEME_COLOR];

  // Determine text color based on resolved theme (dark mode needs lighter colors)
  const isDark = resolvedTheme === 'dark';
  const textColorMap = isDark
    ? THEME_TEXT_COLORS_DARK
    : THEME_TEXT_COLORS_LIGHT;
  const textColor =
    textColorMap[nextColor] ?? textColorMap[DEFAULT_THEME_COLOR];
  const contrastText =
    THEME_CONTRAST_TEXT[nextColor] ?? THEME_CONTRAST_TEXT[DEFAULT_THEME_COLOR];

  if (typeof document !== 'undefined') {
    const root = document.documentElement;
    root?.style.setProperty('--color-theme-primary', cssValue);
    root?.style.setProperty('--color-theme-text', textColor);
    root?.style.setProperty('--color-theme-primary-contrast', contrastText);

    // Update theme-color meta tag so mobile browser chrome matches
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      const hex =
        resolvedTheme === 'dark'
          ? '#1f2937'
          : (THEME_COLOR_HEX[nextColor] ??
            THEME_COLOR_HEX[DEFAULT_THEME_COLOR]);
      metaThemeColor.setAttribute('content', hex);
    }

    // Update SVG favicon to match theme color
    const hex =
      THEME_COLOR_HEX[nextColor] ?? THEME_COLOR_HEX[DEFAULT_THEME_COLOR];
    updateFavicon(hex);
  }
  persistThemeColor(nextColor);
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

type ThemeProviderProps = PropsWithChildren<{
  initialTheme?: ThemePreference | undefined;
  initialThemeColor?: ThemeColor | undefined;
}>;

function AppThemeInner({
  children,
  initialThemeColor,
}: PropsWithChildren<{ initialThemeColor?: ThemeColor }>) {
  const { user } = useSupabaseUser();
  const { theme, resolvedTheme, setTheme: setNextTheme } = useNextTheme();
  const [themeColor, setThemeColorState] =
    useState<ThemeColor>(DEFAULT_THEME_COLOR);
  const [isMounted, setIsMounted] = useState(false);
  const [isLoadingColor, setIsLoadingColor] = useState(true);

  // Initialize theme color on mount only
  useEffect(() => {
    setIsMounted(true);
    const storedColor = readStoredThemeColor(USER_THEME_COLOR_KEY);
    const nextColor = initialThemeColor ?? storedColor ?? DEFAULT_THEME_COLOR;
    setThemeColorState(nextColor);
    setIsLoadingColor(false);
    // Note: Initial color application happens in the effect below
  }, [initialThemeColor]);

  // Apply theme colors whenever color or resolved theme changes
  // This handles both initial mount and light/dark mode switches
  useEffect(() => {
    if (!isMounted) return;
    const safeResolved = resolvedTheme === 'dark' ? 'dark' : 'light';
    applyThemeColor(themeColor, safeResolved);
  }, [resolvedTheme, themeColor, isMounted]);

  const setTheme = useCallback(
    (nextTheme: ThemePreference) => {
      setNextTheme(nextTheme);
      if (user) {
        void saveUserPreferences(user.id, {
          theme: nextTheme,
          themeColor,
        }).catch(() => {
          // non-fatal
        });
      }
    },
    [setNextTheme, themeColor, user]
  );

  const setThemeColor = useCallback(
    (nextColor: ThemeColor) => {
      setThemeColorState(nextColor);
      const safeResolved = resolvedTheme === 'dark' ? 'dark' : 'light';
      applyThemeColor(nextColor, safeResolved);
      if (user) {
        const normalizedTheme =
          theme === 'light' || theme === 'dark' || theme === 'system'
            ? (theme as ThemePreference)
            : undefined;
        const payload: { themeColor: ThemeColor; theme?: ThemePreference } = {
          themeColor: nextColor,
        };
        if (normalizedTheme) {
          payload.theme = normalizedTheme;
        }
        void saveUserPreferences(user.id, payload).catch(() => {
          // non-fatal
        });
      }
    },
    [theme, resolvedTheme, user]
  );

  const contextValue = useMemo<ThemeContextValue>(() => {
    const safeTheme: ThemePreference =
      theme === 'dark' ? 'dark' : theme === 'system' ? 'system' : 'light';
    const safeResolved: 'light' | 'dark' =
      resolvedTheme === 'dark' ? 'dark' : 'light';

    return {
      theme: safeTheme,
      resolvedTheme: safeResolved,
      themeColor,
      isLoading: !isMounted || isLoadingColor,
      setTheme,
      setThemeColor,
    };
  }, [
    isMounted,
    isLoadingColor,
    resolvedTheme,
    setTheme,
    setThemeColor,
    theme,
    themeColor,
  ]);

  return (
    <ThemeContext.Provider value={contextValue}>
      {children}
    </ThemeContext.Provider>
  );
}

export function ThemeProvider({
  children,
  initialTheme,
  initialThemeColor,
}: ThemeProviderProps) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme={initialTheme ?? 'light'}
      enableSystem
      storageKey={USER_THEME_KEY}
      enableColorScheme
    >
      <AppThemeInner
        {...(initialThemeColor !== undefined ? { initialThemeColor } : {})}
      >
        {children}
      </AppThemeInner>
    </NextThemesProvider>
  );
}

export function useThemeContext(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useThemeContext must be used within ThemeProvider');
  }
  return context;
}
