import type { NextConfig } from 'next';

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
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'cdn.rebrickable.com',
        pathname: '/media/**',
      },
      {
        protocol: 'https',
        hostname: 'storage.googleapis.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'img.bricklink.com',
        pathname: '/**',
      },
    ],
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
        ],
      },
    ];
  },
};

export default nextConfig;
