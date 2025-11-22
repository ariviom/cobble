// Color mapping cache - populated from API endpoint
// Keys are Rebrickable color IDs; values are BrickLink color IDs from external_ids
let colorMappingCache: Record<number, number> | null = null;
const partMappingCache = new Map<string, string | null>();

function getApiBaseUrl(): string {
  // In the browser, a relative URL is fine
  if (typeof window !== 'undefined') return '';

  // On the server, Node's fetch requires an absolute URL
  const explicit =
    process.env.NEXT_PUBLIC_APP_ORIGIN ??
    process.env.APP_ORIGIN ??
    process.env.VERCEL_URL;
  if (explicit) {
    const url = explicit.startsWith('http') ? explicit : `https://${explicit}`;
    return url.replace(/\/$/, '');
  }
  // Reasonable dev default
  return 'http://localhost:3000';
}

async function fetchColorMapping(): Promise<Record<number, number>> {
  if (colorMappingCache) return colorMappingCache;

  const base = getApiBaseUrl();

  try {
    const res = await fetch(`${base}/api/colors/mapping`, {
      cache: 'force-cache',
    });
    if (!res.ok)
      throw new Error(`Failed to fetch color mapping: ${res.status}`);
    const data = (await res.json()) as { mapping: Record<number, number> };
    colorMappingCache = data.mapping;
    if (process.env.NODE_ENV !== 'production') {
      console.log('[mapToBrickLink] loaded color mapping', {
        count: Object.keys(data.mapping ?? {}).length,
      });
    }
    return data.mapping;
  } catch (err) {
    console.error('Failed to fetch color mapping:', err);
    // Return empty mapping if fetch fails - will result in unmapped items
    return {};
  }
}

async function fetchPartMapping(partId: string): Promise<string | null> {
  if (partMappingCache.has(partId)) return partMappingCache.get(partId)!;
  const base = getApiBaseUrl();
  try {
    const res = await fetch(
      `${base}/api/parts/bricklink?part=${encodeURIComponent(partId)}`,
      { cache: 'force-cache' }
    );
    if (!res.ok) {
      throw new Error(`part_map_${res.status}`);
    }
    const data = (await res.json()) as { itemNo: string | null };
    const normalized =
      typeof data.itemNo === 'string' && data.itemNo.trim().length > 0
        ? data.itemNo.trim()
        : null;
    partMappingCache.set(partId, normalized);
    return normalized;
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[mapToBrickLink] part mapping failed', {
        partId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    partMappingCache.set(partId, null);
    return null;
  }
}

type BrickLinkMapResult = {
  itemNo: string;
  colorId: number | null;
  itemType: 'PART' | 'MINIFIG';
};

export async function mapToBrickLink(
  partId: string,
  colorId: number
): Promise<BrickLinkMapResult | null> {
  // Minifig rows use a special prefix, e.g., "fig:fig-006572"
  if (partId.startsWith('fig:')) {
    const cleanId = partId.replace(/^fig:/, '');
    return {
      itemNo: cleanId,
      colorId: null,
      itemType: 'MINIFIG',
    };
  }

  const mapping = await fetchColorMapping();
  const blColor = mapping[colorId];
  if (blColor == null) {
    if (process.env.NODE_ENV !== 'production') {
      console.log('[mapToBrickLink] no mapping for color', {
        partId,
        colorId,
      });
    }
    return null;
  }
  const mappedPartId = (await fetchPartMapping(partId)) ?? partId;
  if (mappedPartId === partId && process.env.NODE_ENV !== 'production') {
    console.warn('[mapToBrickLink] using fallback part id', { partId });
  }
  return { itemNo: mappedPartId, colorId: blColor, itemType: 'PART' };
}
