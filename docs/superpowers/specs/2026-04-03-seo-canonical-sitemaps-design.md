# SEO, Canonical Links & Sitemaps Design

**Date:** 2026-04-03
**Domain:** brick-party.com

## Overview

Foundation SEO work for Brick Party: canonical URLs, Open Graph metadata, robots.txt, dynamic sitemaps, and JSON-LD structured data on catalog pages. Neither BrickLink nor Rebrickable currently use JSON-LD — this is a differentiator for rich search results.

## 1. Canonical URLs & `metadataBase`

Add `metadataBase` to root layout so Next.js generates absolute canonical URLs automatically:

```ts
// app/layout.tsx
export const metadata: Metadata = {
  metadataBase: new URL('https://brick-party.com'),
  // ...existing metadata
};
```

Add `NEXT_PUBLIC_APP_URL=https://brick-party.com` to environment variables for use in sitemaps and other non-metadata contexts.

No per-page canonical overrides needed — Next.js derives canonical from `metadataBase` + current path.

## 2. Root Metadata & Open Graph Defaults

Enhance root layout metadata with OG and Twitter card defaults inherited by all pages:

```ts
export const metadata: Metadata = {
  metadataBase: new URL('https://brick-party.com'),
  title: 'Brick Party — LEGO Set Piece Picker',
  description: 'Search LEGO sets, track owned pieces, and export missing parts lists...',
  keywords: ['LEGO', 'sets', 'pieces', 'inventory', ...],
  authors: [{ name: 'Brick Party' }],
  robots: { index: true, follow: true },
  openGraph: {
    type: 'website',
    siteName: 'Brick Party',
    images: [{ url: '/og-default.png', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
  },
};
```

- Static `og-default.png` (1200x630, branded Brick Party logo + tagline) in `/public`
- Dynamic catalog pages override `openGraph.images` with the item's Rebrickable CDN image URL
- Rebrickable ToS explicitly permits hotlinking their CDN images on external sites

## 3. `robots.ts`

Create `app/robots.ts`:

```ts
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
    sitemap: 'https://brick-party.com/sitemap.xml',
  };
}
```

### Indexable Pages

- `/` — Landing page
- `/sets/[setNumber]` — Set detail pages
- `/parts/[partNum]` — Part detail pages
- `/minifigs/[figNum]` — Minifig detail pages
- `/search` — Search landing page (static metadata, not per-query)
- `/identify` — Part identification landing page
- `/pricing` — Pricing page
- `/privacy`, `/terms` — Legal pages

### Blocked Pages

- `/api/*` — All API routes
- `/login`, `/signup`, `/forgot-password`, `/reset-password` — Auth flows
- `/account`, `/account/billing` — User-specific
- `/billing/*` — Stripe callbacks
- `/group/*`, `/join` — Group sessions
- `/collection/*` — User collections

## 4. Sitemaps

Use Next.js sitemap index support via `generateSitemaps()` + `sitemap()`:

```ts
// app/sitemap.ts
import type { MetadataRoute } from 'next';

const BASE_URL = 'https://brick-party.com';

export async function generateSitemaps() {
  return [
    { id: 'static' },
    { id: 'sets' },
    { id: 'minifigs' },
    { id: 'parts' },
  ];
}

export default async function sitemap({
  id,
}: {
  id: string;
}): Promise<MetadataRoute.Sitemap> {
  switch (id) {
    case 'static':
      return staticPages();
    case 'sets':
      return setsPages();
    case 'minifigs':
      return minifigsPages();
    case 'parts':
      return partsPages();
    default:
      return [];
  }
}
```

### Sitemap Segments

| Segment    | Source                                                                            | Approx URLs | Priority                 |
| ---------- | --------------------------------------------------------------------------------- | ----------- | ------------------------ |
| `static`   | Hardcoded list: `/`, `/search`, `/identify`, `/pricing`, `/privacy`, `/terms`     | 6           | 1.0 (home), 0.5 (others) |
| `sets`     | `rb_sets` table, all rows                                                         | ~20k        | 0.8                      |
| `minifigs` | `rb_minifigs` table, all rows                                                     | ~15k        | 0.7                      |
| `parts`    | `rb_parts` joined with inventory data, ordered by set appearance count, limit ~5k | ~5k         | 0.6                      |

### Data Sourcing

Each segment function queries Supabase `rb_*` tables directly using the catalog read client. All well within the 50k URL sitemap protocol limit per segment.

Parts are curated to the top ~5k by set appearances (following Rebrickable's approach of selective sitemapping rather than indexing the full 500k+ catalog). Remaining parts are discoverable via crawling from set inventory pages.

## 5. JSON-LD Structured Data

### Shared Component

Create a `JsonLd` component that accepts a typed data object and renders a script tag with `JSON.stringify`. The data is always constructed server-side from known database values (not user input), so XSS is not a concern.

### Sets (`/sets/[setNumber]`) — `Product` Schema

```json
{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "Millennium Falcon",
  "productID": "75192-1",
  "description": "7541 pieces · 2017 · Star Wars",
  "image": "https://cdn.rebrickable.com/media/sets/75192-1.jpg",
  "brand": { "@type": "Brand", "name": "LEGO" },
  "category": "Star Wars"
}
```

### Parts (`/parts/[partNum]`) — `Product` Schema

```json
{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "Brick 2 x 4",
  "productID": "3001",
  "image": "https://cdn.rebrickable.com/media/parts/ldraw/7/3001.png",
  "brand": { "@type": "Brand", "name": "LEGO" },
  "category": "Bricks"
}
```

### Minifigs (`/minifigs/[figNum]`) — `Product` Schema

```json
{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "Luke Skywalker - Jedi Master",
  "productID": "fig-000001",
  "image": "https://cdn.rebrickable.com/media/minifigs/fig-000001.jpg",
  "brand": { "@type": "Brand", "name": "LEGO" }
}
```

### Excluded

BreadcrumbList schema skipped — the catalog is flat with no deep hierarchy. Can be added later if sets are nested under theme pages.

## 6. Per-Page Metadata Enhancements

### `/sets/[setNumber]`

Already has `generateMetadata` with title + description. Add:

- `openGraph.images` pointing to Rebrickable CDN set image URL
- `openGraph.title` / `openGraph.description` with set name, pieces, year, theme

### `/parts/[partNum]`

Already has `generateMetadata` with title + description. Add:

- `openGraph.images` pointing to Rebrickable CDN part image URL

### `/minifigs/[figNum]`

Currently only has a basic title. Add:

- Full description (minifig name, set appearances)
- `openGraph.images` pointing to Rebrickable CDN minifig image URL

### `/search`

No metadata currently. Add static metadata:

- Title: "Search LEGO Sets — Brick Party"
- Description: "Search thousands of LEGO sets by name, number, or theme."

### `/identify`

No metadata currently. Add static metadata:

- Title: "Identify LEGO Parts by Photo — Brick Party"
- Description: "Upload a photo to identify LEGO parts using image recognition."

### No Changes Needed

`/pricing`, `/privacy`, `/terms` — already have adequate static metadata, will inherit root OG defaults.

## Out of Scope (Future Work)

- **Dynamic OG image generation** (`opengraph-image.tsx`) — composite images with set photo + name + stats overlaid. Deferred; direct CDN image URLs provide 90% of the value.
- **BreadcrumbList schema** — add when/if theme-based navigation hierarchy is introduced.
- **Parts sitemap expansion** — increase beyond top 5k as the site gains authority.
- **Structured data for collections** — if/when collection pages become indexable.

## Image Licensing Notes

- **Part LDraw renders**: Open — LDraw SteerCo says renders are not covered by library copyright (CC BY 2.0/4.0 for the library files themselves).
- **Set/minifig images**: LEGO IP. Rebrickable ToS permits external use. LEGO's Fair Play policy restricts commercial use but tolerates fan community sites. Current approach (hotlinking for display + OG) is consistent with industry practice.
- **Rebrickable CDN**: Explicitly permits hotlinking per their ToS (section 5.2). URLs may change in future updates.
