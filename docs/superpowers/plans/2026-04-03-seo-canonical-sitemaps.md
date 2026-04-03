# SEO, Canonical Links & Sitemaps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add canonical URLs, Open Graph metadata, robots.txt, dynamic sitemaps, and JSON-LD structured data to improve search engine discoverability.

**Architecture:** Add `metadataBase` to root layout for canonical URLs. Create `robots.ts` and `sitemap.ts` at the app root using Next.js Metadata API. Add a shared `JsonLd` component rendered on catalog detail pages. Enhance `generateMetadata` on sets/parts/minifigs pages to include OG images from Rebrickable CDN.

**Tech Stack:** Next.js Metadata API, Supabase (catalog queries for sitemaps), React server components

**Spec:** `docs/superpowers/specs/2026-04-03-seo-canonical-sitemaps-design.md`

---

## File Structure

| Action | File                             | Responsibility                                              |
| ------ | -------------------------------- | ----------------------------------------------------------- |
| Modify | `app/layout.tsx`                 | Add `metadataBase`, `openGraph`, `twitter` to root metadata |
| Create | `app/robots.ts`                  | Crawler rules and sitemap reference                         |
| Create | `app/sitemap.ts`                 | Sitemap index with static/sets/minifigs/parts segments      |
| Create | `app/components/ui/JsonLd.tsx`   | Shared JSON-LD script renderer                              |
| Modify | `app/sets/[setNumber]/page.tsx`  | Add OG image + JSON-LD Product schema                       |
| Modify | `app/parts/[partNum]/page.tsx`   | Add OG image + JSON-LD Product schema                       |
| Modify | `app/lib/catalog/parts.ts`       | Add `image_url` to part select, add `getPartCategoryName`   |
| Modify | `app/minifigs/[figNum]/page.tsx` | Add OG image, description + JSON-LD Product schema          |

---

### Task 1: Root Metadata — `metadataBase` and Open Graph Defaults

**Files:**

- Modify: `app/layout.tsx:37-55`

- [ ] **Step 1: Update root metadata object**

In `app/layout.tsx`, replace the existing `metadata` export (lines 37-55) with:

```ts
export const metadata: Metadata = {
  metadataBase: new URL('https://brick-party.com'),
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

- [ ] **Step 2: Verify the dev server still renders without errors**

Run: `npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add app/layout.tsx
git commit -m "feat(seo): add metadataBase and Open Graph defaults to root layout"
```

---

### Task 2: Create `robots.ts`

**Files:**

- Create: `app/robots.ts`

- [ ] **Step 1: Create the robots file**

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

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add app/robots.ts
git commit -m "feat(seo): add robots.ts with crawler rules and sitemap reference"
```

---

### Task 3: Create Sitemap with Index Segments

**Files:**

- Create: `app/sitemap.ts`

- [ ] **Step 1: Create the sitemap file**

Create `app/sitemap.ts`. This file uses the `server-only` import guard because it queries Supabase directly. The `generateSitemaps` function returns segment IDs, and the default export generates URLs for each segment.

```ts
import 'server-only';

import type { MetadataRoute } from 'next';
import { getCatalogReadClient } from '@/app/lib/db/catalogAccess';

const BASE_URL = 'https://brick-party.com';

export async function generateSitemaps() {
  return [
    { id: 'static' },
    { id: 'sets' },
    { id: 'minifigs' },
    { id: 'parts' },
  ];
}

function staticPages(): MetadataRoute.Sitemap {
  return [
    { url: BASE_URL, priority: 1.0, changeFrequency: 'weekly' },
    { url: `${BASE_URL}/search`, priority: 0.5, changeFrequency: 'weekly' },
    { url: `${BASE_URL}/identify`, priority: 0.5, changeFrequency: 'monthly' },
    { url: `${BASE_URL}/pricing`, priority: 0.5, changeFrequency: 'monthly' },
    { url: `${BASE_URL}/privacy`, priority: 0.3, changeFrequency: 'yearly' },
    { url: `${BASE_URL}/terms`, priority: 0.3, changeFrequency: 'yearly' },
  ];
}

async function setsPages(): Promise<MetadataRoute.Sitemap> {
  const supabase = getCatalogReadClient();
  const { data } = await supabase
    .from('rb_sets')
    .select('set_num')
    .order('set_num');

  if (!data) return [];

  return data.map(row => ({
    url: `${BASE_URL}/sets/${row.set_num}`,
    priority: 0.8,
    changeFrequency: 'monthly' as const,
  }));
}

async function minifigsPages(): Promise<MetadataRoute.Sitemap> {
  const supabase = getCatalogReadClient();
  const { data } = await supabase
    .from('rb_minifigs')
    .select('fig_num')
    .order('fig_num');

  if (!data) return [];

  return data.map(row => ({
    url: `${BASE_URL}/minifigs/${row.fig_num}`,
    priority: 0.7,
    changeFrequency: 'monthly' as const,
  }));
}

async function partsPages(): Promise<MetadataRoute.Sitemap> {
  const supabase = getCatalogReadClient();

  // Get the top ~5000 parts by number of sets they appear in.
  // rb_part_rarity has one row per (part_num, color_id) with set_count.
  // We take the max set_count per part_num to rank by popularity.
  const { data: rarityRows } = await supabase
    .from('rb_part_rarity')
    .select('part_num, set_count');

  if (!rarityRows?.length) return [];

  // Aggregate max set_count per part_num
  const partMaxCount = new Map<string, number>();
  for (const row of rarityRows) {
    const current = partMaxCount.get(row.part_num) ?? 0;
    if (row.set_count > current) {
      partMaxCount.set(row.part_num, row.set_count);
    }
  }

  // Sort by set_count descending, take top 5000
  const topParts = [...partMaxCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5000)
    .map(([partNum]) => partNum);

  return topParts.map(partNum => ({
    url: `${BASE_URL}/parts/${partNum}`,
    priority: 0.6,
    changeFrequency: 'monthly' as const,
  }));
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

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add app/sitemap.ts
git commit -m "feat(seo): add dynamic sitemap with sets, minifigs, and top parts"
```

---

### Task 4: Create `JsonLd` Component

**Files:**

- Create: `app/components/ui/JsonLd.tsx`

- [ ] **Step 1: Create the component**

Create `app/components/ui/JsonLd.tsx`. The data prop is always constructed server-side from trusted database values (not user input), so this is safe — it's the standard Next.js pattern for JSON-LD injection.

```tsx
type JsonLdProps = {
  data: Record<string, unknown>;
};

/**
 * Renders a JSON-LD structured data script tag.
 * Data must be constructed from trusted server-side sources only.
 */
export function JsonLd({ data }: JsonLdProps) {
  return (
    <script
      type="application/ld+json"
      // eslint-disable-next-line react/no-danger -- server-constructed JSON-LD from DB values
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add app/components/ui/JsonLd.tsx
git commit -m "feat(seo): add shared JsonLd component for structured data"
```

---

### Task 5: Add OG Image and JSON-LD to Set Detail Page

**Files:**

- Modify: `app/sets/[setNumber]/page.tsx`

- [ ] **Step 1: Update `generateMetadata` to include Open Graph**

In `app/sets/[setNumber]/page.tsx`, replace the return block in `generateMetadata` (lines 39-43) with:

```ts
const description = `View ${summary.name} (${summary.setNumber}) — ${summary.numParts} pieces, ${summary.year}. Browse parts, minifigures, and related sets.`;

return {
  title: `${summary.name} (${summary.setNumber}) — Brick Party`,
  description,
  openGraph: {
    title: `${summary.name} (${summary.setNumber})`,
    description,
    ...(summary.imageUrl ? { images: [{ url: summary.imageUrl }] } : {}),
  },
};
```

- [ ] **Step 2: Add JSON-LD import and structured data to page component**

Add the import at the top of the file:

```ts
import { JsonLd } from '@/app/components/ui/JsonLd';
```

In the `SetPage` component, wrap the return in a fragment and add `JsonLd` before `PageLayout`:

```tsx
const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Product',
  name: summary.name,
  productID: summary.setNumber,
  description: `${summary.numParts} pieces · ${summary.year}${summary.themeName ? ` · ${summary.themeName}` : ''}`,
  ...(summary.imageUrl ? { image: summary.imageUrl } : {}),
  brand: { '@type': 'Brand', name: 'LEGO' },
  ...(summary.themeName ? { category: summary.themeName } : {}),
};

return (
  <>
    <JsonLd data={jsonLd} />
    <PageLayout noTopOffset>
      <SetOverviewClient
        setNumber={summary.setNumber}
        name={summary.name}
        year={summary.year}
        imageUrl={summary.imageUrl}
        numParts={summary.numParts}
        themeId={summary.themeId}
        themeName={summary.themeName}
        uniqueParts={stats?.uniqueParts ?? null}
        uniqueColors={stats?.uniqueColors ?? null}
        minifigs={minifigs}
        initialRelatedSets={relatedResult.sets}
        relatedSetsTotal={relatedResult.total}
      />
    </PageLayout>
  </>
);
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 4: Commit**

```bash
git add app/sets/[setNumber]/page.tsx
git commit -m "feat(seo): add OG image and JSON-LD Product schema to set detail page"
```

---

### Task 6: Add OG Image and JSON-LD to Part Detail Page

**Files:**

- Modify: `app/parts/[partNum]/page.tsx`
- Modify: `app/lib/catalog/parts.ts`

- [ ] **Step 1: Add `image_url` to `getPartByPartNum` select**

In `app/lib/catalog/parts.ts`, line 11, change the select:

From:

```ts
    .select('part_num, name, part_cat_id, bl_part_id')
```

To:

```ts
    .select('part_num, name, part_cat_id, bl_part_id, image_url')
```

- [ ] **Step 2: Add `getPartCategoryName` function**

In `app/lib/catalog/parts.ts`, add this function after `getPartByPartNum`:

```ts
export async function getPartCategoryName(
  catId: number
): Promise<string | null> {
  const supabase = getCatalogReadClient();
  const { data } = await supabase
    .from('rb_part_categories')
    .select('name')
    .eq('id', catId)
    .maybeSingle();
  return data?.name ?? null;
}
```

- [ ] **Step 3: Update `generateMetadata` in part detail page**

In `app/parts/[partNum]/page.tsx`, replace the return block in `generateMetadata` (lines 18-21) with:

```ts
const description = `View details, colors, and sets containing LEGO part ${part.part_num} — ${part.name}`;

return {
  title: `${part.name} (${part.part_num}) — Brick Party`,
  description,
  openGraph: {
    title: `${part.name} (${part.part_num})`,
    description,
    ...(part.image_url ? { images: [{ url: part.image_url }] } : {}),
  },
};
```

- [ ] **Step 4: Add JSON-LD to the page component**

Add imports at the top of `app/parts/[partNum]/page.tsx`:

```ts
import { JsonLd } from '@/app/components/ui/JsonLd';
import {
  getPartByPartNum,
  getPartColors,
  getPartSetCount,
  getPartCategoryName,
} from '@/app/lib/catalog/parts';
```

(This replaces the existing destructured import of `getPartByPartNum`, `getPartColors`, `getPartSetCount` — just add `getPartCategoryName` to the existing import.)

Update the `PartDetailPage` component:

```tsx
export default async function PartDetailPage({ params }: Props) {
  const { partNum } = await params;
  const part = await getPartByPartNum(partNum);
  if (!part) notFound();

  const [colors, rarityData, categoryName] = await Promise.all([
    getPartColors(partNum),
    getPartSetCount(partNum),
    part.part_cat_id ? getPartCategoryName(part.part_cat_id) : null,
  ]);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: part.name,
    productID: part.part_num,
    ...(part.image_url ? { image: part.image_url } : {}),
    brand: { '@type': 'Brand', name: 'LEGO' },
    ...(categoryName ? { category: categoryName } : {}),
  };

  return (
    <>
      <JsonLd data={jsonLd} />
      <PageLayout>
        <PartDetailClient part={part} colors={colors} rarityData={rarityData} />
      </PageLayout>
    </>
  );
}
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 6: Commit**

```bash
git add app/parts/[partNum]/page.tsx app/lib/catalog/parts.ts
git commit -m "feat(seo): add OG image and JSON-LD Product schema to part detail page"
```

---

### Task 7: Add OG Image, Description, and JSON-LD to Minifig Detail Page

**Files:**

- Modify: `app/minifigs/[figNum]/page.tsx`

- [ ] **Step 1: Update `generateMetadata` to include description and Open Graph**

In `app/minifigs/[figNum]/page.tsx`, replace the `generateMetadata` function (lines 158-178) with:

```ts
export async function generateMetadata({
  params,
}: {
  params: Promise<RouteParams>;
}): Promise<Metadata> {
  const resolved = await params;
  const blMinifigNo = resolved?.figNum?.trim();

  if (!blMinifigNo) {
    return { title: 'Minifig' };
  }

  const meta = await getServerMinifigMeta(blMinifigNo);
  const baseTitle = meta.name ?? blMinifigNo;
  const description = meta.name
    ? `View ${meta.name} minifigure — appears in ${meta.setsCount} set${meta.setsCount !== 1 ? 's' : ''}${meta.themeName ? ` · ${meta.themeName}` : ''}`
    : `View LEGO minifigure ${blMinifigNo}`;

  return {
    title: `${baseTitle} – Minifig | Brick Party`,
    description,
    openGraph: {
      title: baseTitle,
      description,
      ...(meta.imageUrl ? { images: [{ url: meta.imageUrl }] } : {}),
    },
  };
}
```

- [ ] **Step 2: Add JSON-LD to the page component**

Add the import at the top of the file:

```ts
import { JsonLd } from '@/app/components/ui/JsonLd';
```

Replace the `MinifigPage` component (lines 180-205) with:

```tsx
export default async function MinifigPage({ params }: MinifigPageProps) {
  const { figNum } = await params;

  if (!figNum) {
    notFound();
  }

  const initialMeta = await getServerMinifigMeta(figNum);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: initialMeta.name ?? figNum,
    productID: figNum,
    ...(initialMeta.imageUrl ? { image: initialMeta.imageUrl } : {}),
    brand: { '@type': 'Brand', name: 'LEGO' },
  };

  return (
    <>
      <JsonLd data={jsonLd} />
      <PageLayout>
        <MinifigPageClient
          figNum={figNum}
          initialName={initialMeta.name}
          initialImageUrl={initialMeta.imageUrl}
          initialYear={initialMeta.year}
          initialThemeName={initialMeta.themeName}
          initialNumParts={initialMeta.numParts}
          initialBlId={initialMeta.blId}
          initialSetsCount={initialMeta.setsCount}
          initialMinSubpartSetCount={initialMeta.minSubpartSetCount}
        />
      </PageLayout>
    </>
  );
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 4: Commit**

```bash
git add app/minifigs/[figNum]/page.tsx
git commit -m "feat(seo): add OG image, description, and JSON-LD to minifig detail page"
```

---

### Task 8: Final Type-Check and Verification

**Files:** (none — verification only)

- [ ] **Step 1: Run full type-check**

Run: `npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 2: Run linter**

Run: `npm run lint`
Expected: No lint errors

- [ ] **Step 3: Run existing tests to ensure no regressions**

Run: `npm test -- --run`
Expected: All tests pass

- [ ] **Step 4: Final commit if any formatting/lint fixes were needed**

```bash
npm run format
git add -A
git commit -m "chore: lint and format fixes for SEO changes"
```
