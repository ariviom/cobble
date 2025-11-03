// Color mapping cache - populated from API endpoint
// Keys are Rebrickable color IDs; values are BrickLink color IDs from external_ids
let colorMappingCache: Record<number, number> | null = null;

async function fetchColorMapping(): Promise<Record<number, number>> {
  if (colorMappingCache) return colorMappingCache;

  try {
    const res = await fetch('/api/colors/mapping', { cache: 'force-cache' });
    if (!res.ok) throw new Error('Failed to fetch color mapping');
    const data = (await res.json()) as { mapping: Record<number, number> };
    colorMappingCache = data.mapping;
    return data.mapping;
  } catch (err) {
    console.error('Failed to fetch color mapping:', err);
    // Return empty mapping if fetch fails - will result in unmapped items
    return {};
  }
}

export async function mapToBrickLink(
  partId: string,
  colorId: number
): Promise<{ itemNo: string; colorId: number } | null> {
  const mapping = await fetchColorMapping();
  const blColor = mapping[colorId];
  if (blColor == null) return null;
  // Assume part numbers map 1:1 initially
  return { itemNo: partId, colorId: blColor };
}
