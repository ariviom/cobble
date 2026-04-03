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
