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
};

export default nextConfig;
