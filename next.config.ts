import type { NextConfig } from 'next';
import withPWAInit from 'next-pwa';

const withPWA = withPWAInit({
  dest: 'public',
  // Disable PWA in development to avoid service worker caching issues
  disable: process.env.NODE_ENV === 'development',
  register: true,
  skipWaiting: true,
  // Runtime caching for external image CDNs
  runtimeCaching: [
    {
      // Rebrickable images (part photos, set images)
      urlPattern: /^https:\/\/cdn\.rebrickable\.com\/.*/i,
      handler: 'CacheFirst',
      options: {
        cacheName: 'rebrickable-images',
        expiration: {
          maxEntries: 500,
          maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
        },
      },
    },
    {
      // BrickLink images (minifig photos)
      urlPattern: /^https:\/\/img\.bricklink\.com\/.*/i,
      handler: 'CacheFirst',
      options: {
        cacheName: 'bricklink-images',
        expiration: {
          maxEntries: 500,
          maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
        },
      },
    },
    {
      // Google Storage images (set thumbnails)
      urlPattern: /^https:\/\/storage\.googleapis\.com\/.*/i,
      handler: 'CacheFirst',
      options: {
        cacheName: 'google-storage-images',
        expiration: {
          maxEntries: 200,
          maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
        },
      },
    },
  ],
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
    qualities: [70, 75],
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
        ],
      },
    ];
  },
};

export default withPWA(nextConfig);
