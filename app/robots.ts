import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          '/login',
          '/signup',
          '/forgot-password',
          '/reset-password',
          '/account',
          '/account/billing',
          '/billing/',
          '/group/',
          '/join',
          '/collection/',
        ],
      },
    ],
    sitemap: `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://brick-party.com'}/sitemap.xml`,
  };
}
