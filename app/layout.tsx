import { DunningBanner } from '@/app/components/dunning-banner';
import { ErrorBoundary } from '@/app/components/ErrorBoundary';
import { AuthProvider } from '@/app/components/providers/auth-provider';
import { EntitlementsProvider } from '@/app/components/providers/entitlements-provider';
import { ReactQueryProvider } from '@/app/components/providers/react-query-provider';
import { SentryUserContext } from '@/app/components/providers/sentry-user-context';
import { SyncProvider } from '@/app/components/providers/sync-provider';
import { ThemeProvider } from '@/app/components/providers/theme-provider';
import {
  getEntitlements,
  type Entitlements,
} from '@/app/lib/services/entitlements';
import { getSupabaseAuthServerClient } from '@/app/lib/supabaseAuthServerClient';
import { resolveThemePreference } from '@/app/lib/theme/resolve';
import { buildUserHandle } from '@/app/lib/users';
import type { User } from '@supabase/supabase-js';
import type { Metadata, Viewport } from 'next';
import {
  DEFAULT_THEME_COLOR,
  THEME_COLOR_HEX,
  THEME_CONTRAST_TEXT,
  THEME_TEXT_COLORS_DARK,
  THEME_TEXT_COLORS_LIGHT,
  type ResolvedTheme,
  type ThemeColor,
  type ThemePreference,
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
  viewportFit: 'cover',
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
  let initialEntitlements: Entitlements | null = null;
  let subscriptionStatus: string | null = null;

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

      initialEntitlements = await getEntitlements(user.id);

      // Load subscription status for dunning banner
      const { data: sub } = await supabase
        .from('billing_subscriptions')
        .select('status')
        .eq('user_id', user.id)
        .in('status', ['active', 'trialing', 'past_due'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      subscriptionStatus = sub?.status ?? null;
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

  // Compute initial theme color CSS variables to prevent flash
  const initialColor = dbThemeColor ?? DEFAULT_THEME_COLOR;
  const textColorMap =
    resolved === 'dark' ? THEME_TEXT_COLORS_DARK : THEME_TEXT_COLORS_LIGHT;
  const themeStyles = {
    '--color-theme-primary': THEME_COLOR_HEX[initialColor],
    '--color-theme-text': textColorMap[initialColor],
    '--color-theme-primary-contrast': THEME_CONTRAST_TEXT[initialColor],
  } as React.CSSProperties;

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={resolved === 'dark' ? 'dark' : undefined}
      style={themeStyles}
    >
      <head>
        {/* Blocking script to apply theme color from localStorage before paint */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var c=localStorage.getItem('userThemeColor');if(c){var h={'blue':'#016cb8','yellow':'#f2d300','purple':'#4d2f93','red':'#e3000b','green':'#00b242'};var tl={'blue':'#016cb8','yellow':'#996f00','purple':'#4d2f93','red':'#c30009','green':'#008732'};var td={'blue':'#60a5fa','yellow':'#fbbf24','purple':'#a78bfa','red':'#f87171','green':'#4ade80'};var ct={'blue':'#ffffff','yellow':'#1a1600','purple':'#ffffff','red':'#ffffff','green':'#ffffff'};var d=document.documentElement.classList.contains('dark');var t=d?td:tl;if(h[c]){document.documentElement.style.setProperty('--color-theme-primary',h[c]);document.documentElement.style.setProperty('--color-theme-text',t[c]);document.documentElement.style.setProperty('--color-theme-primary-contrast',ct[c]);var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute('content',d?'#1f2937':h[c])}}}catch(e){}})()`,
          }}
        />
        <link rel="manifest" href="/manifest.json" />
        <meta
          name="theme-color"
          content={
            resolved === 'dark' ? '#1f2937' : THEME_COLOR_HEX[initialColor]
          }
        />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Brick Party" />
        <link rel="apple-touch-icon" href="/logo/brickparty_logo.png" />
        <meta
          name="color-scheme"
          content={resolved === 'dark' ? 'dark light' : 'light'}
        />
      </head>
      <body className="bg-background text-foreground antialiased">
        <AuthProvider initialUser={initialUser} initialHandle={initialHandle}>
          <EntitlementsProvider initialEntitlements={initialEntitlements}>
            <SentryUserContext />
            <DunningBanner subscriptionStatus={subscriptionStatus} />
            <SyncProvider>
              <ThemeProvider
                initialTheme={initialTheme}
                initialThemeColor={dbThemeColor ?? undefined}
              >
                <ReactQueryProvider>
                  <ErrorBoundary>{children}</ErrorBoundary>
                </ReactQueryProvider>
              </ThemeProvider>
            </SyncProvider>
          </EntitlementsProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
