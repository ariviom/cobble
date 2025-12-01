import { ErrorBoundary } from '@/app/components/ErrorBoundary';
import { ReactQueryProvider } from '@/app/components/providers/react-query-provider';
import { ThemeProvider } from '@/app/components/providers/theme-provider';
import { ThemeScript } from '@/app/components/theme/theme-script';
import type { ThemePreference } from '@/app/components/theme/constants';
import { getSupabaseAuthServerClient } from '@/app/lib/supabaseAuthServerClient';
import type { Metadata, Viewport } from 'next';
import './styles/globals.css';

export const metadata: Metadata = {
  title: 'Quarry — LEGO Set Piece Picker',
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
  authors: [{ name: 'Quarry' }],
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
  let initialTheme: ThemePreference | null = null;

  try {
    const supabase = await getSupabaseAuthServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

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
          initialTheme = preferences.theme;
        }
      }
    }
  } catch {
    // Swallow errors and fall back to client-side theme handling.
  }

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <ThemeScript initialTheme={initialTheme ?? undefined} />
      </head>
      <body className="bg-background text-foreground antialiased">
        <ThemeProvider initialTheme={initialTheme ?? undefined}>
          <ReactQueryProvider>
            <ErrorBoundary>{children}</ErrorBoundary>
          </ReactQueryProvider>
        </ThemeProvider>
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
