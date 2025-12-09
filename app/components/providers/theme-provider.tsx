'use client';

import {
  DEFAULT_THEME_COLOR,
  THEME_COLOR_TO_VALUE,
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

function applyThemeColor(nextColor: ThemeColor) {
	const cssValue =
		THEME_COLOR_TO_VALUE[nextColor] ??
		THEME_COLOR_TO_VALUE[DEFAULT_THEME_COLOR];
	if (typeof document !== 'undefined') {
		const root = document.documentElement;
		root?.style.setProperty('--color-theme-primary', cssValue);
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
	const [themeColor, setThemeColorState] = useState<ThemeColor>(DEFAULT_THEME_COLOR);
  const [isMounted, setIsMounted] = useState(false);
	const [isLoadingColor, setIsLoadingColor] = useState(true);

  useEffect(() => {
    setIsMounted(true);
		const storedColor = readStoredThemeColor(USER_THEME_COLOR_KEY);
		const nextColor = initialThemeColor ?? storedColor ?? DEFAULT_THEME_COLOR;
		setThemeColorState(nextColor);
		applyThemeColor(nextColor);
    setIsLoadingColor(false);
	}, [initialThemeColor]);

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
			applyThemeColor(nextColor);
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
		[theme, user]
	);

  const contextValue = useMemo<ThemeContextValue>(() => {
    const safeTheme =
      (theme as ThemePreference | undefined) === 'dark'
        ? 'dark'
        : (theme as ThemePreference | undefined) === 'light'
          ? 'light'
          : 'light';
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
			enableSystem={false}
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
