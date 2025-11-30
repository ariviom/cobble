// Color mapping cache - populated from API endpoint
// Keys are Rebrickable color IDs; values are BrickLink color IDs from external_ids
let colorMappingCache: Record<number, number> | null = null;
const partMappingCache = new Map<string, string | null>();
const PART_SUFFIX_PATTERN = /^\d+[a-z]$/i;

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

async function fetchBrickLinkItemNo(partId: string): Promise<string | null> {
  const base = getApiBaseUrl();
  try {
    const res = await fetch(
      `${base}/api/parts/bricklink?part=${encodeURIComponent(partId)}`,
      {
        cache: 'force-cache',
      }
    );
    if (!res.ok) {
      return null;
    }
    const data = (await res.json()) as { itemNo?: string | null };
    return typeof data.itemNo === 'string' && data.itemNo.trim().length > 0
      ? data.itemNo.trim()
      : null;
  } catch {
    return null;
  }
}

async function fetchPartMapping(partId: string): Promise<string | null> {
  if (partMappingCache.has(partId)) return partMappingCache.get(partId)!;

  let mapped = await fetchBrickLinkItemNo(partId);

  if (!mapped && PART_SUFFIX_PATTERN.test(partId)) {
    const baseId = partId.slice(0, -1);
    if (baseId) {
      mapped = await fetchBrickLinkItemNo(baseId);
      if (mapped) {
        partMappingCache.set(baseId, mapped);
        if (process.env.NODE_ENV !== 'production') {
          console.warn('[mapToBrickLink] stripped suffix for part', {
            partId,
            fallback: baseId,
          });
        }
      }
    }
  }

  partMappingCache.set(partId, mapped ?? null);
  return mapped ?? null;
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
