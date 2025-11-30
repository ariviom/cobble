import crypto from 'crypto';
import 'server-only';

import {
  DEFAULT_PRICING_PREFERENCES,
  type PricingPreferences,
} from '@/app/lib/pricing';

const BL_STORE_BASE = 'https://api.bricklink.com/api/store/v1';
// BrickLink Store v1 uses uppercase type segments in the URI (e.g., /items/PART/{no})
const STORE_ITEM_TYPE_PART = 'PART';
const STORE_ITEM_TYPE_MINIFIG = 'MINIFIG';
const STORE_ITEM_TYPE_SET = 'SET';

function getEnv(name: string): string {
  const val = process.env[name] ?? '';
  if (!val) throw new Error(`Missing env ${name}`);
  return val;
}

function tryGetTokenSecret(): string {
  // Support a common misspelling BRICLINK_TOKEN_SECRET as a fallback
  return (
    process.env.BRICKLINK_TOKEN_SECRET ??
    process.env.BRICLINK_TOKEN_SECRET ??
    ''
  );
}

function rfc3986encode(str: string): string {
  return encodeURIComponent(str).replace(
    /[!'()*]/g,
    c => '%' + c.charCodeAt(0).toString(16).toUpperCase()
  );
}

function buildOAuthHeader(
  method: string,
  url: string,
  extraParams: Record<string, string | number>
): string {
  const consumerKey = getEnv('BRICKLINK_CONSUMER_KEY');
  const consumerSecret = getEnv('BRICKLINK_CONSUMER_SECRET');
  const token = getEnv('BRICKLINK_TOKEN_VALUE');
  const tokenSecret = tryGetTokenSecret();
  if (!tokenSecret) {
    throw new Error(
      'Missing BRICKLINK_TOKEN_SECRET (or BRICLINK_TOKEN_SECRET fallback)'
    );
  }

  const oauthParams: Record<string, string> = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: token,
    oauth_version: '1.0',
  };

  // Merge params for signature base string
  const sigParams: Record<string, string> = {};
  for (const [k, v] of Object.entries(oauthParams)) sigParams[k] = String(v);
  for (const [k, v] of Object.entries(extraParams || {})) {
    if (v === undefined || v === null) continue;
    sigParams[k] = String(v);
  }
  // Normalize and sort
  const norm = Object.keys(sigParams)
    .sort()
    .map(k => `${rfc3986encode(k)}=${rfc3986encode(sigParams[k])}`)
    .join('&');
  const baseString = [
    method.toUpperCase(),
    rfc3986encode(url),
    rfc3986encode(norm),
  ].join('&');
  const signingKey = `${rfc3986encode(consumerSecret)}&${rfc3986encode(
    tokenSecret
  )}`;
  const signature = crypto
    .createHmac('sha1', signingKey)
    .update(baseString)
    .digest('base64');

  const headerParams: Record<string, string> = {
    ...oauthParams,
    oauth_signature: signature,
  };
  const header =
    'OAuth ' +
    Object.keys(headerParams)
      .sort()
      .map(k => `${rfc3986encode(k)}="${rfc3986encode(headerParams[k]!)}"`)
      .join(', ');
  return header;
}

async function blGet<T>(
  path: string,
  params?: Record<string, string | number>
): Promise<T> {
  const url = new URL(`${BL_STORE_BASE}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null) continue;
      url.searchParams.set(k, String(v));
    }
  }
  const authHeader = buildOAuthHeader(
    'GET',
    url.origin + url.pathname,
    Object.fromEntries(url.searchParams.entries())
  );
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: authHeader,
      Accept: 'application/json',
    },
    next: { revalidate: 60 * 60 },
  });
  if (process.env.NODE_ENV !== 'production') {
    try {
      console.log('BL store GET', {
        path: url.pathname,
        query: url.search,
      });
    } catch {}
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`BrickLink ${res.status}: ${text.slice(0, 200)}`);
  }
  type BLResponse = { meta?: { code?: number; message?: string }; data: T };
  const json = (await res.json()) as BLResponse;
  if (json?.meta && json.meta.code && json.meta.code !== 200) {
    throw new Error(
      `BrickLink meta ${json.meta.code}: ${json.meta.message ?? 'error'}`
    );
  }
  return json.data;
}

export type BLPart = {
  no: string; // BrickLink part no, e.g., 6129c03
  name?: string;
  category_id?: number;
  image_url?: string;
  // Additional fields ignored
};

export type BLSubsetItem = {
  inv_item_id?: number;
  color_id?: number;
  color_name?: string;
  item: { no: string; type: string; name?: string; image_url?: string };
  quantity: number;
  appear_as: 'A' | 'P' | string; // assembly or part
};

// Normalized superset entry (set or other item that includes the part)
export type BLSupersetItem = {
  setNumber: string;
  name: string;
  imageUrl: string | null;
  quantity: number;
};

export type BLColorEntry = {
  color_id: number;
  color_name?: string;
};

export type BLPriceGuide = {
  unitPriceUsed: number | null;
  unitPriceNew: number | null;
  minPriceUsed: number | null;
  maxPriceUsed: number | null;
  currencyCode: string | null;
};

type CacheEntry<T> = { at: number; value: T };
const ONE_HOUR_MS = 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 500;

const subsetsCache = new Map<string, CacheEntry<BLSubsetItem[]>>();
const supersetsCache = new Map<string, CacheEntry<BLSupersetItem[]>>();
const colorsCache = new Map<string, CacheEntry<BLColorEntry[]>>();
const priceGuideCache = new Map<string, CacheEntry<BLPriceGuide>>();

function makeKey(no: string, colorId?: number): string {
  return `${no.trim().toLowerCase()}::${
    typeof colorId === 'number' ? colorId : ''
  }`;
}

function cacheGet<T>(map: Map<string, CacheEntry<T>>, key: string): T | null {
  const now = Date.now();
  const entry = map.get(key);
  if (entry && now - entry.at < ONE_HOUR_MS) return entry.value;
  return null;
}

function cacheSet<T>(
  map: Map<string, CacheEntry<T>>,
  key: string,
  value: T
): void {
  const now = Date.now();
  map.set(key, { at: now, value });
  // naive cap eviction: delete oldest when over cap
  if (map.size > MAX_CACHE_ENTRIES) {
    let oldestKey: string | null = null;
    let oldestAt = Number.MAX_SAFE_INTEGER;
    for (const [k, v] of map.entries()) {
      if (v.at < oldestAt) {
        oldestAt = v.at;
        oldestKey = k;
      }
    }
    if (oldestKey) map.delete(oldestKey);
  }
}

export async function blGetPart(no: string): Promise<BLPart> {
  return blGet<BLPart>(
    `/items/${STORE_ITEM_TYPE_PART}/${encodeURIComponent(no)}`
  );
}

export async function blGetPartSubsets(
  no: string,
  colorId?: number
): Promise<BLSubsetItem[]> {
  const key = makeKey(no, colorId);
  const cached = cacheGet(subsetsCache, key);
  if (cached) return cached;
  // BrickLink returns "data" as an array of groups: { match_no, entries: BLSubsetItem[] }.
  const data = await blGet<unknown[] | { entries: unknown[] }>(
    `/items/${STORE_ITEM_TYPE_PART}/${encodeURIComponent(no)}/subsets`,
    colorId ? { color_id: colorId } : {}
  );
  const raw: unknown[] = Array.isArray(data)
    ? data
    : Array.isArray((data as { entries?: unknown[] }).entries)
      ? ((data as { entries?: unknown[] }).entries ?? [])
      : [];
  const list: BLSubsetItem[] = raw
    .flatMap(group => {
      if (
        group &&
        typeof group === 'object' &&
        Array.isArray((group as { entries?: unknown[] }).entries)
      ) {
        return (group as { entries: BLSubsetItem[] }).entries;
      }
      return [group as BLSubsetItem];
    })
    .filter(Boolean) as BLSubsetItem[];
  if (process.env.NODE_ENV !== 'production') {
    try {
      console.log('BL subsets', {
        no,
        colorId: typeof colorId === 'number' ? colorId : null,
        count: Array.isArray(list) ? list.length : 0,
      });
    } catch {}
  }
  cacheSet(subsetsCache, key, list);
  return list;
}

export async function blGetPartSupersets(
  no: string,
  colorId?: number
): Promise<BLSupersetItem[]> {
  const key = makeKey(no, colorId);
  const cached = cacheGet(supersetsCache, key);
  if (cached) return cached;
  // "data" is an array; keep a fallback for potential { entries } wrappers.
  const data = await blGet<unknown[] | { entries: unknown[] }>(
    `/items/${STORE_ITEM_TYPE_PART}/${encodeURIComponent(no)}/supersets`,
    colorId ? { color_id: colorId } : {}
  );
  const raw: unknown[] = Array.isArray(data)
    ? data
    : Array.isArray((data as { entries?: unknown[] }).entries)
      ? ((data as { entries?: unknown[] }).entries ?? [])
      : [];
  // Each element is either a group { color_id, entries: [...] } or a direct entry.
  const flatEntries: unknown[] = raw.flatMap(group => {
    if (
      group &&
      typeof group === 'object' &&
      Array.isArray((group as { entries?: unknown[] }).entries)
    ) {
      return (group as { entries: unknown[] }).entries;
    }
    return [group];
  });
  const list: BLSupersetItem[] = flatEntries
    .map((r): BLSupersetItem | null => {
      if (!r || typeof r !== 'object') return null;
      type ItemLike = {
        no?: unknown;
        name?: unknown;
        image_url?: unknown;
        quantity?: unknown;
      };
      const record = r as {
        item?: ItemLike;
        quantity?: unknown;
      } & ItemLike;
      const item: ItemLike = record.item ?? record;
      const setNumber = item && typeof item.no === 'string' ? item.no : '';
      if (!setNumber) return null;
      const name = item && typeof item.name === 'string' ? item.name : '';
      const imageUrl =
        item && typeof item.image_url === 'string' ? item.image_url : null;
      // Supersets entries always imply at least one occurrence in a set; default missing quantity to 1.
      const quantity =
        typeof record.quantity === 'number'
          ? record.quantity
          : item && typeof item.quantity === 'number'
            ? item.quantity
            : 1;
      return { setNumber, name, imageUrl, quantity };
    })
    .filter(Boolean) as BLSupersetItem[];
  if (process.env.NODE_ENV !== 'production') {
    try {
      console.log('BL supersets', {
        no,
        colorId: typeof colorId === 'number' ? colorId : null,
        count: Array.isArray(list) ? list.length : 0,
      });
    } catch {}
  }
  cacheSet(supersetsCache, key, list);
  return list;
}

export async function blGetSetSubsets(
  setNum: string
): Promise<BLSubsetItem[]> {
  // Reuse the same shape/logic as blGetPartSubsets, but for SET items with no color.
  const key = makeKey(setNum, undefined);
  const cached = cacheGet(subsetsCache, key);
  if (cached) return cached;
  const data = await blGet<unknown[] | { entries: unknown[] }>(
    `/items/${STORE_ITEM_TYPE_SET}/${encodeURIComponent(setNum)}/subsets`,
    {}
  );
  const raw: unknown[] = Array.isArray(data)
    ? data
    : Array.isArray((data as { entries?: unknown[] }).entries)
      ? ((data as { entries?: unknown[] }).entries ?? [])
      : [];
  const list: BLSubsetItem[] = raw
    .flatMap(group => {
      if (
        group &&
        typeof group === 'object' &&
        Array.isArray((group as { entries?: unknown[] }).entries)
      ) {
        return (group as { entries: BLSubsetItem[] }).entries;
      }
      return [group as BLSubsetItem];
    })
    .filter(Boolean) as BLSubsetItem[];
  if (process.env.NODE_ENV !== 'production') {
    try {
      console.log('BL set subsets', {
        setNum,
        count: Array.isArray(list) ? list.length : 0,
      });
    } catch {}
  }
  cacheSet(subsetsCache, key, list);
  return list;
}

export async function blGetPartColors(no: string): Promise<BLColorEntry[]> {
  const key = makeKey(no, undefined);
  const cached = cacheGet(colorsCache, key);
  if (cached) return cached;
  // This endpoint lists the colors a part appears in; shape mirrors other catalog lists
  const data = await blGet<BLColorEntry[] | { entries: BLColorEntry[] }>(
    `/items/${STORE_ITEM_TYPE_PART}/${encodeURIComponent(no)}/colors`
  );
  let list: BLColorEntry[] = [];
  if (Array.isArray(data)) {
    list = data;
  } else if (Array.isArray((data as { entries?: BLColorEntry[] }).entries)) {
    list = (data as { entries: BLColorEntry[] }).entries ?? [];
  }
  if (process.env.NODE_ENV !== 'production') {
    try {
      console.log('BL colors', {
        no,
        count: Array.isArray(list) ? list.length : 0,
      });
    } catch {}
  }
  cacheSet(colorsCache, key, list);
  return list;
}

export async function blGetColor(
  colorId: number
): Promise<{ color_id: number; color_name?: string }> {
  const data = await blGet<{ color_id: number; color_name?: string }>(
    `/colors/${encodeURIComponent(colorId)}`
  );
  if (process.env.NODE_ENV !== 'production') {
    try {
      console.log('BL color', {
        colorId,
        name: typeof data.color_name === 'string' ? data.color_name : null,
      });
    } catch {}
  }
  return data;
}

export async function blGetPartImageUrl(
  no: string,
  colorId: number
): Promise<{ thumbnail_url?: string | null; type?: string; no?: string }> {
  const data = await blGet<{
    thumbnail_url?: string | null;
    type?: string;
    no?: string;
  }>(
    `/items/${STORE_ITEM_TYPE_PART}/${encodeURIComponent(
      no
    )}/images/${encodeURIComponent(colorId)}`
  );
  if (process.env.NODE_ENV !== 'production') {
    try {
      console.log('BL image', {
        no,
        colorId,
        thumbnail:
          typeof data.thumbnail_url === 'string' || data.thumbnail_url === null
            ? data.thumbnail_url
            : null,
      });
    } catch {}
  }
  return data;
}

type BLPriceGuideDetail = {
  new_or_used?: string;
  unit_price?: number | string;
  quantity?: number | string;
};

type BLPriceGuideRaw = {
  currency_code?: string;
  avg_price?: number | string;
  qty_avg_price?: number | string;
  unit_price?: number | string;
  min_price?: number | string;
  max_price?: number | string;
  price_detail?: BLPriceGuideDetail[];
};

function parsePriceValue(
  ...values: Array<number | string | undefined>
): number | null {
  for (const v of values) {
    if (v == null) continue;
    const n = typeof v === 'number' ? v : Number(v);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return null;
}

/**
 * Fetch BrickLink price guide for a part/color.
 *
 * - guide_type: 'stock' (current store listings) to better reflect "current" prices.
 * - new_or_used: 'U' (used) to align with current CSV export default.
 * - currency / country: configurable via preferences; defaults to USD / global.
 */
async function fetchPriceGuide(
  no: string,
  colorId: number | null | undefined,
  itemType: 'PART' | 'MINIFIG' | 'SET',
  guideType: 'stock' | 'sold',
  prefs?: PricingPreferences
): Promise<BLPriceGuide> {
  const effectivePrefs = prefs ?? DEFAULT_PRICING_PREFERENCES;
  const currencyKey = (effectivePrefs.currencyCode || 'USD').toLowerCase();
  const countryKey = (effectivePrefs.countryCode || 'WORLD').toLowerCase();
  const key = makeKey(
    `${itemType}::${no}::price-${guideType}-used-${currencyKey}-${countryKey}`,
    typeof colorId === 'number' ? colorId : undefined
  );
  const cached = cacheGet(priceGuideCache, key);
  if (cached) return cached;

  const typeSegment =
    itemType === 'MINIFIG'
      ? STORE_ITEM_TYPE_MINIFIG
      : itemType === 'SET'
        ? STORE_ITEM_TYPE_SET
        : STORE_ITEM_TYPE_PART;
  const data = await blGet<BLPriceGuideRaw>(
    `/items/${typeSegment}/${encodeURIComponent(no)}/price`,
    {
      ...(typeof colorId === 'number' ? { color_id: colorId } : {}),
      guide_type: guideType,
      new_or_used: 'U',
      currency_code: effectivePrefs.currencyCode,
      ...(effectivePrefs.countryCode ? { country_code: effectivePrefs.countryCode } : {}),
    }
  );

  if (process.env.NODE_ENV !== 'production') {
    try {
      console.log('BL price guide raw', {
        no,
        colorId: typeof colorId === 'number' ? colorId : null,
        itemType,
        guideType,
        currency_code: data.currency_code ?? null,
        topLevelAvg: data.avg_price ?? null,
        detailCount: Array.isArray(data.price_detail)
          ? data.price_detail.length
          : 0,
      });
    } catch {}
  }

  let unitPriceUsed = parsePriceValue(
    data.avg_price,
    data.qty_avg_price,
    data.unit_price,
    data.min_price
  );
  let minPriceUsed = parsePriceValue(data.min_price);
  let maxPriceUsed = parsePriceValue(data.max_price);

  if (
    unitPriceUsed == null &&
    Array.isArray(data.price_detail) &&
    data.price_detail.length > 0
  ) {
    let sum = 0;
    let count = 0;
    for (const entry of data.price_detail) {
      const val = parsePriceValue(entry.unit_price);
      if (val != null) {
        sum += val;
        count += 1;
      }
    }
    if (count > 0) {
      unitPriceUsed = sum / count;
    }
  }

  if (Array.isArray(data.price_detail) && data.price_detail.length > 0) {
    for (const entry of data.price_detail) {
      const val = parsePriceValue(entry.unit_price);
      if (val == null) continue;
      if (minPriceUsed == null || val < minPriceUsed) {
        minPriceUsed = val;
      }
      if (maxPriceUsed == null || val > maxPriceUsed) {
        maxPriceUsed = val;
      }
    }
  }

  const unitPriceNew = null;
  const pg: BLPriceGuide = {
    unitPriceUsed,
    unitPriceNew,
    minPriceUsed,
    maxPriceUsed,
    currencyCode: data.currency_code ?? effectivePrefs.currencyCode,
  };

  cacheSet(priceGuideCache, key, pg);
  return pg;
}

export async function blGetPartPriceGuide(
  no: string,
  colorId: number | null | undefined,
  itemType: 'PART' | 'MINIFIG' | 'SET' = 'PART',
  prefs?: PricingPreferences
): Promise<BLPriceGuide> {
  const primary = await fetchPriceGuide(no, colorId, itemType, 'stock', prefs);
  if (primary.unitPriceUsed != null) return primary;
  const fallback = await fetchPriceGuide(no, colorId, itemType, 'sold', prefs);
  if (fallback.unitPriceUsed == null && process.env.NODE_ENV !== 'production') {
    console.warn('BL price guide missing even after fallback', {
      no,
      colorId,
      itemType,
    });
  }
  return fallback;
}

export async function blGetSetPriceGuide(
  setNumber: string,
  prefs?: PricingPreferences
): Promise<BLPriceGuide> {
  // Sets do not use color scoping for price guides.
  return blGetPartPriceGuide(setNumber, null, 'SET', prefs);
}
