import { ErrorBoundary } from '@/app/components/ErrorBoundary';
import { AuthProvider } from '@/app/components/providers/auth-provider';
import { ReactQueryProvider } from '@/app/components/providers/react-query-provider';
import { ThemeProvider } from '@/app/components/providers/theme-provider';
import { getSupabaseAuthServerClient } from '@/app/lib/supabaseAuthServerClient';
import { resolveThemePreference } from '@/app/lib/theme/resolve';
import { buildUserHandle } from '@/app/lib/users';
import type { User } from '@supabase/supabase-js';
import type { Metadata, Viewport } from 'next';
import type {
  ResolvedTheme,
  ThemeColor,
  ThemePreference,
} from './components/theme/constants';
import './styles/globals.css';

export const metadata: Metadata = {
  title: 'Brick Party — LEGO Set Piece Picker',
  description:
    'Search LEGO sets, track owned pieces, and export missing parts lists for Rebrickable and BrickLink.',
  keywords: [
    'LEGO',
    'sets',
    'pieces',
    'inventory',
    'tracking',
    'Rebrickable',
    'BrickLink',
  ],
  authors: [{ name: 'Brick Party' }],
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  let dbTheme: ThemePreference | null = null;
  let initialUser: User | null = null;
  let initialHandle: string | null = null;
  let dbThemeColor: ThemeColor | null = null;

  try {
    const supabase = await getSupabaseAuthServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    initialUser = user;

    if (user) {
      // Load theme preference
      const { data: preferences, error: themeError } = await supabase
        .from('user_preferences')
        .select('theme, theme_color')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!themeError && preferences?.theme) {
        if (
          preferences.theme === 'light' ||
          preferences.theme === 'dark' ||
          preferences.theme === 'system'
        ) {
          dbTheme = preferences.theme;
        }
      }
      if (!themeError && preferences?.theme_color) {
        if (
          preferences.theme_color === 'blue' ||
          preferences.theme_color === 'yellow' ||
          preferences.theme_color === 'purple' ||
          preferences.theme_color === 'red' ||
          preferences.theme_color === 'green'
        ) {
          dbThemeColor = preferences.theme_color;
        }
      }

      // Load profile to compute canonical handle (username or user_id)
      const { data: profile, error: profileError } = await supabase
        .from('user_profiles')
        .select('user_id,username')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!profileError) {
        if (profile) {
          initialHandle = buildUserHandle({
            user_id: profile.user_id,
            username: profile.username,
          });
        } else {
          initialHandle = buildUserHandle({
            user_id: user.id,
            username: null,
          });
        }
      } else {
        initialHandle = buildUserHandle({
          user_id: user.id,
          username: null,
        });
      }
    }
  } catch {
    // Swallow errors and fall back to client-side theme handling.
  }

  // On the server we don't know the real system preference; use 'light'
  // as a conservative default and let the client refine 'system' if needed.
  const systemTheme: ResolvedTheme = 'light';

  // For signed-in users, prefer DB; if missing, fall back to light instead of "system"
  // to avoid dark flashes for users who chose light. For anon users, resolve using
  // the standard precedence (db -> cookie -> system), but cookies are no longer used.
  const { preference: initialTheme, resolved } = resolveThemePreference({
    dbTheme,
    cookieTheme: null,
    systemTheme,
  });

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={resolved === 'dark' ? 'dark' : undefined}
    >
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta
          name="color-scheme"
          content={resolved === 'dark' ? 'dark light' : 'light'}
        />
      </head>
      <body className="bg-background text-foreground antialiased">
        <AuthProvider initialUser={initialUser} initialHandle={initialHandle}>
          <ThemeProvider
            initialTheme={initialTheme}
            initialThemeColor={dbThemeColor ?? undefined}
          >
            <ReactQueryProvider>
              <ErrorBoundary>{children}</ErrorBoundary>
            </ReactQueryProvider>
          </ThemeProvider>
        </AuthProvider>
        {/* <svg
          width="0"
          height="0"
          aria-hidden="true"
          focusable="false"
          style={{ position: 'absolute' }}
        >
          <filter id="knockout-white" colorInterpolationFilters="sRGB">
            <feColorMatrix
              in="SourceGraphic"
              type="matrix"
              values={`
                1 0 0 0 0
                0 1 0 0 0
                0 0 1 0 0
               -1 -1 -1 3 0
              `}
              result="rgba"
            />
            <feComponentTransfer in="rgba">
              <feFuncA type="linear" slope="1000" />
            </feComponentTransfer>
            <feComposite in="SourceGraphic" in2="rgba" operator="in" />
          </filter>
        </svg> */}
      </body>
    </html>
  );
}
