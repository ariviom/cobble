import {
  DEFAULT_THEME_COLOR,
  DEVICE_THEME_COLOR_KEY,
  DEVICE_THEME_KEY,
  THEME_COLOR_TO_VALUE,
  USER_THEME_COLOR_KEY,
  USER_THEME_KEY,
  type ThemePreference,
} from '@/app/components/theme/constants';

function buildThemeBootstrapScript(initialTheme?: ThemePreference): string {
  const colorValueEntries = Object.entries(THEME_COLOR_TO_VALUE)
    .map(([key, value]) => `'${key}': '${value}'`)
    .join(',');

  const initialThemeLiteral =
    initialTheme === undefined ? 'null' : `'${initialTheme}'`;

  return `
    (function () {
      try {
        var INITIAL_THEME = ${initialThemeLiteral};
        var USER_THEME_KEY = '${USER_THEME_KEY}';
        var DEVICE_THEME_KEY = '${DEVICE_THEME_KEY}';
        var USER_THEME_COLOR_KEY = '${USER_THEME_COLOR_KEY}';
        var DEVICE_THEME_COLOR_KEY = '${DEVICE_THEME_COLOR_KEY}';
        var DEFAULT_THEME_COLOR = '${DEFAULT_THEME_COLOR}';
        var THEME_COLOR_VALUES = { ${colorValueEntries} };

        var getStoredTheme = function (key) {
          if (typeof localStorage === 'undefined') return null;
          var value = localStorage.getItem(key);
          return value === 'light' || value === 'dark' || value === 'system'
            ? value
            : null;
        };

        var getStoredThemeColor = function (key) {
          if (typeof localStorage === 'undefined') return null;
          var value = localStorage.getItem(key);
          return value && THEME_COLOR_VALUES[value] ? value : null;
        };

        var setThemeCookie = function (theme) {
          try {
            document.cookie =
              'brickparty_theme_pref=' +
              theme +
              '; Path=/; Max-Age=' +
              60 * 60 * 24 * 365 +
              '; SameSite=Lax';
          } catch {}
        };

        var storeThemeColor = function (scope, color) {
          if (typeof localStorage === 'undefined') return;
          var key =
            scope === 'user' ? USER_THEME_COLOR_KEY : DEVICE_THEME_COLOR_KEY;
          try {
            localStorage.setItem(key, color);
          } catch {}
        };

        var getSystemTheme = function () {
          if (
            typeof window === 'undefined' ||
            typeof window.matchMedia !== 'function'
          ) {
            return 'light';
          }
          return window.matchMedia('(prefers-color-scheme: dark)').matches
            ? 'dark'
            : 'light';
        };

        var resolveTheme = function (theme) {
          if (theme === 'dark' || theme === 'light') return theme;
          return getSystemTheme();
        };

        var resolveThemeColor = function (color) {
          if (THEME_COLOR_VALUES[color]) return color;
          return DEFAULT_THEME_COLOR;
        };

        var storedUserTheme = getStoredTheme(USER_THEME_KEY);
        var storedDeviceTheme = getStoredTheme(DEVICE_THEME_KEY);
        var scope = storedUserTheme ? 'user' : storedDeviceTheme ? 'device' : 'system';
        var theme = storedUserTheme || storedDeviceTheme || 'system';

        // If SSR provides a theme from Supabase, use it for first paint but
        // do NOT write to localStorage. Supabase is the source of truth for
        // authenticated users; localStorage is just a cache that gets updated
        // by ThemeProvider after client-side hydration.
        if (
          INITIAL_THEME === 'light' ||
          INITIAL_THEME === 'dark' ||
          INITIAL_THEME === 'system'
        ) {
          theme = INITIAL_THEME;
          scope = 'user';
          // Intentionally NOT writing to localStorage here - ThemeProvider
          // will sync from Supabase and update the cache appropriately.
        }

        var resolvedTheme = resolveTheme(theme);

        var root = document.documentElement;
        if (root) {
          if (resolvedTheme === 'dark') {
            root.classList.add('dark');
          } else {
            root.classList.remove('dark');
          }
        }

        // Ensure cookie mirrors the resolved preference so server-side
        // resolution can reuse it on subsequent requests.
        setThemeCookie(theme);

        var storedUserThemeColor = getStoredThemeColor(USER_THEME_COLOR_KEY);
        var storedDeviceThemeColor = getStoredThemeColor(DEVICE_THEME_COLOR_KEY);
        var colorScope = storedUserThemeColor
          ? 'user'
          : storedDeviceThemeColor
            ? 'device'
            : null;
        var color = resolveThemeColor(
          storedUserThemeColor || storedDeviceThemeColor || DEFAULT_THEME_COLOR
        );
        var colorValue = THEME_COLOR_VALUES[color] || THEME_COLOR_VALUES[DEFAULT_THEME_COLOR];
        if (root) {
          root.style.setProperty('--color-theme-primary', colorValue);
        }
        if (colorScope) {
          storeThemeColor(colorScope, color);
        }
      } catch (err) {
        // Swallow errors; theme will fall back to CSS defaults.
      }
    })();
  `;
}

type ThemeScriptProps = {
  initialTheme?: ThemePreference | undefined;
};

export function ThemeScript({ initialTheme }: ThemeScriptProps) {
  return (
    <script
      // We intentionally inline this script so it runs before React hydrates.
      dangerouslySetInnerHTML={{ __html: buildThemeBootstrapScript(initialTheme) }}
    />
  );
}

