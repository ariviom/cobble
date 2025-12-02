import { ErrorBoundary } from '@/app/components/ErrorBoundary';
import { AuthProvider } from '@/app/components/providers/auth-provider';
import { ReactQueryProvider } from '@/app/components/providers/react-query-provider';
import { ThemeProvider } from '@/app/components/providers/theme-provider';
import { ThemeScript } from '@/app/components/theme/theme-script';
import type {
  ResolvedTheme,
  ThemePreference,
} from '@/app/components/theme/constants';
import { resolveThemePreference } from '@/app/lib/theme/resolve';
import { getSupabaseAuthServerClient } from '@/app/lib/supabaseAuthServerClient';
import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import type { User } from '@supabase/supabase-js';
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
  const cookieStore = await cookies();

  let dbTheme: ThemePreference | null = null;
  let initialUser: User | null = null;

  try {
    const supabase = await getSupabaseAuthServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    initialUser = user;

    if (user) {
      const { data: preferences, error } = await supabase
        .from('user_preferences')
        .select('theme')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!error && preferences?.theme) {
        if (
          preferences.theme === 'light' ||
          preferences.theme === 'dark' ||
          preferences.theme === 'system'
        ) {
          dbTheme = preferences.theme;
        }
      }
    }
  } catch {
    // Swallow errors and fall back to client-side theme handling.
  }

  const cookieThemeRaw = cookieStore.get('brickparty_theme_pref')?.value ?? null;
  const cookieTheme: ThemePreference | null =
    cookieThemeRaw === 'light' ||
    cookieThemeRaw === 'dark' ||
    cookieThemeRaw === 'system'
      ? cookieThemeRaw
      : null;

  // On the server we don't know the real system preference; use 'light'
  // as a conservative default and let the client refine 'system' if needed.
  const systemTheme: ResolvedTheme = 'light';

  const { preference, resolved } = resolveThemePreference({
    dbTheme,
    cookieTheme,
    systemTheme,
  });

  const initialTheme: ThemePreference = preference;

  return (
    <html
      lang="en"
      suppressHydrationWarning
      data-theme-preference={initialTheme}
      data-theme-resolved={resolved}
    >
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta
          name="color-scheme"
          content={resolved === 'dark' ? 'dark light' : 'light dark'}
        />
        <ThemeScript initialTheme={initialTheme} />
      </head>
      <body className="bg-background text-foreground antialiased">
        <AuthProvider initialUser={initialUser}>
          <ThemeProvider initialTheme={initialTheme}>
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
