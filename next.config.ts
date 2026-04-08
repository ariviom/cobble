import { withSentryConfig } from '@sentry/nextjs';
import type { NextConfig } from 'next';
import withSerwistInit from '@serwist/next';

const withSerwist = withSerwistInit({
  swSrc: 'app/sw.ts',
  swDest: 'public/sw.js',
  disable: process.env.NODE_ENV === 'development',
});

const compiler =
  process.env.NODE_ENV === 'production'
    ? {
        removeConsole: {
          // Preserve info/warn/error so structured logs are kept in production.
          exclude: ['error', 'warn', 'info'],
        },
      }
    : undefined;

const nextConfig: NextConfig = {
  ...(compiler ? { compiler } : {}),
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Copy WASM files for server-side usage (imghash library)
      config.module.rules.push({
        test: /\.wasm$/,
        type: 'asset/resource',
        generator: {
          filename: 'static/wasm/[name].[hash][ext]',
        },
      });
    }
    return config;
  },
  images: {
    unoptimized: true,
  },
  async redirects() {
    return [
      // Legacy /sets/id/[setNumber] URLs redirect to /sets/[setNumber]
      {
        source: '/sets/id/:setNumber*',
        destination: '/sets/:setNumber*',
        permanent: true,
      },
      // Legacy /api/sets/id/[setNumber] URLs redirect to /api/sets/[setNumber]
      {
        source: '/api/sets/id/:path*',
        destination: '/api/sets/:path*',
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            // Allow camera/mic for /identify flows while disabling other sensors.
            key: 'Permissions-Policy',
            value:
              'camera=(self), microphone=(self), geolocation=(), payment=(), fullscreen=(self), autoplay=(), usb=()',
          },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
        ],
      },
    ];
  },
};

export default withSentryConfig(withSerwist(nextConfig), {
  org: 'brick-party',
  project: 'javascript-nextjs',
  ...(process.env.SENTRY_AUTH_TOKEN
    ? { authToken: process.env.SENTRY_AUTH_TOKEN }
    : {}),
  silent: !process.env.CI,
  widenClientFileUpload: true,
  tunnelRoute: '/monitoring',
  webpack: {
    treeshake: {
      removeDebugLogging: true,
    },
  },
});
