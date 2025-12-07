import { logger } from '@/lib/metrics';
// Color mapping cache - populated from API endpoint
// Keys are Rebrickable color IDs; values are BrickLink color IDs from external_ids
let colorMappingCache: Record<number, number> | null = null;
// Part mapping cache - only caches successful mappings (not null)
const partMappingCache = new Map<string, string>();

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
      logger.debug('map_to_bricklink.loaded_color_mapping', {
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
        // Use default caching - the API handles mapping lookups and suffix fallbacks
        cache: 'default',
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
  // Only return cached values if they're not null - allows re-lookup after fixes
  const cached = partMappingCache.get(partId);
  if (cached) return cached;

  // The API handles suffix stripping and mapping table lookups
  const mapped = await fetchBrickLinkItemNo(partId);

  // Only cache successful mappings - don't cache null to allow re-lookup
  if (mapped) {
    partMappingCache.set(partId, mapped);
  }

  return mapped;
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
      logger.debug('map_to_bricklink.no_color_mapping', {
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
