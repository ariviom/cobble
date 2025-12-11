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
    const csp = [
      "default-src 'self'",
      "connect-src 'self' https://*.supabase.co https://api.brickognize.com",
      "img-src 'self' https://cdn.rebrickable.com https://img.bricklink.com https://storage.googleapis.com data: blob:",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "font-src 'self' https://fonts.gstatic.com data:",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; ');

    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            // Allow camera/mic for /identify flows while disabling other sensors.
            key: 'Permissions-Policy',
            value:
              "camera=(self), microphone=(self), geolocation=(), payment=(), fullscreen=(self), autoplay=(), usb=()",
          },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
    ];
  },
};

export default nextConfig;
