import { ReactQueryProvider } from '@/app/components/providers/react-query-provider';
import type { Metadata, Viewport } from 'next';
import './styles/globals.css';

export const metadata: Metadata = {
  title: 'Cobble — LEGO Set Piece Picker',
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
  authors: [{ name: 'Cobble' }],
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
      </head>
      <body className="bg-background text-foreground antialiased">
        <ReactQueryProvider>
          <div className="mx-auto flex min-h-screen w-full max-w-screen-2xl flex-col">
            {children}
          </div>
        </ReactQueryProvider>
        <svg
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
        </svg>
      </body>
    </html>
  );
}
