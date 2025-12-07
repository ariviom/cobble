import crypto from 'crypto';
import 'server-only';

import { LRUCache } from '@/app/lib/cache/lru';
import { CACHE } from '@/app/lib/constants';
import { hasProperty, isRecord } from '@/app/lib/domain/guards';
import {
    DEFAULT_PRICING_PREFERENCES,
    type PricingPreferences,
} from '@/app/lib/pricing';
import { logger } from '@/lib/metrics';

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

const BL_REQUEST_TIMEOUT_MS =
  Number.parseInt(process.env.BL_REQUEST_TIMEOUT_MS ?? '', 10) || 30_000;
const BL_MAX_CONCURRENCY =
  Number.parseInt(process.env.BL_MAX_CONCURRENCY ?? '', 10) || 8;
const BL_BREAKER_THRESHOLD =
  Number.parseInt(process.env.BL_BREAKER_THRESHOLD ?? '', 10) || 5;
const BL_BREAKER_COOLDOWN_MS =
  Number.parseInt(process.env.BL_BREAKER_COOLDOWN_MS ?? '', 10) || 60_000;

let activeRequests = 0;
const waitQueue: Array<() => void> = [];
let consecutiveFailures = 0;
let breakerOpenUntil = 0;

async function acquireSlot(): Promise<void> {
  if (activeRequests < BL_MAX_CONCURRENCY) {
    activeRequests += 1;
    return;
  }
  await new Promise<void>(resolve => {
    waitQueue.push(() => {
      activeRequests += 1;
      resolve();
    });
  });
}

function releaseSlot(): void {
  activeRequests = Math.max(0, activeRequests - 1);
  const next = waitQueue.shift();
  if (next) next();
}

function assertBreakerOpen(): void {
  const now = Date.now();
  if (breakerOpenUntil > now) {
    throw new Error('bricklink_circuit_open');
  }
}

function recordSuccess(): void {
  consecutiveFailures = 0;
}

function recordFailure(): void {
  consecutiveFailures += 1;
  if (consecutiveFailures >= BL_BREAKER_THRESHOLD) {
    breakerOpenUntil = Date.now() + BL_BREAKER_COOLDOWN_MS;
    consecutiveFailures = 0;
  }
}

async function blGet<T>(
  path: string,
  params?: Record<string, string | number>
): Promise<T> {
  assertBreakerOpen();
  await acquireSlot();
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
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, BL_REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: authHeader,
        Accept: 'application/json',
      },
      signal: controller.signal,
      next: { revalidate: 60 * 60 },
    });
  } finally {
    clearTimeout(timeout);
  }
  if (process.env.NODE_ENV !== 'production') {
    logger.debug('bricklink.store_get', {
      path: url.pathname,
      query: url.search,
    });
  }
  try {
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      recordFailure();
      throw new Error(`BrickLink ${res.status}: ${text.slice(0, 200)}`);
    }
    type BLResponse = { meta?: { code?: number; message?: string }; data: T };
    const json = (await res.json()) as BLResponse;
    if (json?.meta && json.meta.code && json.meta.code !== 200) {
      recordFailure();
      throw new Error(
        `BrickLink meta ${json.meta.code}: ${json.meta.message ?? 'error'}`
      );
    }
    recordSuccess();
    return json.data;
  } finally {
    releaseSlot();
  }
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
  /** Internal marker to indicate a miss (all prices null) for negative caching */
  __miss?: boolean;
};

// LRU caches with TTL for BrickLink API responses
const subsetsCache = new LRUCache<string, BLSubsetItem[]>(CACHE.MAX_ENTRIES, CACHE.TTL_MS.DEFAULT);
const supersetsCache = new LRUCache<string, BLSupersetItem[]>(CACHE.MAX_ENTRIES, CACHE.TTL_MS.DEFAULT);
const colorsCache = new LRUCache<string, BLColorEntry[]>(CACHE.MAX_ENTRIES, CACHE.TTL_MS.DEFAULT);
const priceGuideCache = new LRUCache<string, BLPriceGuide>(CACHE.MAX_ENTRIES, CACHE.TTL_MS.PRICE_GUIDE);
const priceGuideInFlight = new Map<string, Promise<BLPriceGuide>>();

function makeKey(no: string, colorId?: number): string {
  return `${no.trim().toLowerCase()}::${
    typeof colorId === 'number' ? colorId : ''
  }`;
}

export async function blGetPart(no: string): Promise<BLPart> {
  return blGet<BLPart>(
    `/items/${STORE_ITEM_TYPE_PART}/${encodeURIComponent(no)}`
  );
}

type BLSubsetResponse =
  | { entries?: BLSubsetItem[]; [k: string]: unknown }
  | BLSubsetItem
  | BLSubsetItem[];

function normalizeSubsetEntries(raw: BLSubsetResponse[]): BLSubsetItem[] {
  const result: BLSubsetItem[] = [];
  for (const group of raw) {
    if (isRecord(group) && hasProperty(group, 'entries') && Array.isArray(group.entries)) {
      const entries = (group.entries ?? []) as BLSubsetItem[];
      for (const e of entries) {
        if (e && typeof e === 'object') {
          result.push(e);
        }
      }
      continue;
    }
    if (isRecord(group)) {
      result.push(group as BLSubsetItem);
    }
  }
  return result;
}

async function fetchSubsets(
  no: string,
  colorId?: number
): Promise<BLSubsetItem[]> {
  const data = await blGet<BLSubsetResponse[] | { entries?: BLSubsetResponse[] }>(
    `/items/${STORE_ITEM_TYPE_PART}/${encodeURIComponent(no)}/subsets`,
    colorId ? { color_id: colorId } : {}
  );
  const raw: BLSubsetResponse[] = Array.isArray(data)
    ? data
    : Array.isArray((data as { entries?: BLSubsetResponse[] }).entries)
      ? ((data as { entries?: BLSubsetResponse[] }).entries ?? [])
      : [];
  return normalizeSubsetEntries(raw);
}

export async function blGetPartSubsets(
  no: string,
  colorId?: number
): Promise<BLSubsetItem[]> {
  const key = makeKey(no, colorId);
  const cached = subsetsCache.get(key);
  if (cached) return cached;
  const list = await fetchSubsets(no, colorId);
  if (process.env.NODE_ENV !== 'production') {
    logger.debug('bricklink.subsets', {
      no,
      colorId: typeof colorId === 'number' ? colorId : null,
      count: Array.isArray(list) ? list.length : 0,
    });
  }
  subsetsCache.set(key, list);
  return list;
}

type BLSupersetResponse =
  | { entries?: BLSupersetItem[]; item?: { no?: string; name?: string; image_url?: string; quantity?: number }; quantity?: number }
  | BLSupersetItem
  | BLSupersetItem[];

function normalizeSupersetEntries(raw: BLSupersetResponse[]): BLSupersetItem[] {
  const result: BLSupersetItem[] = [];
  for (const group of raw) {
    if (isRecord(group) && hasProperty(group, 'entries') && Array.isArray(group.entries)) {
      const entries = (group.entries ?? []) as BLSupersetItem[];
      for (const e of entries) {
        if (isRecord(e) && typeof (e as { setNumber?: string }).setNumber === 'string') {
          result.push(e);
        }
      }
      continue;
    }

    if (isRecord(group)) {
      const record: Record<string, unknown> = group;
      const item =
        hasProperty(record, 'item') && isRecord(record.item) ? record.item : record;
      const setNumber = typeof (item as { no?: unknown }).no === 'string' ? (item as { no: string }).no : '';
      if (!setNumber) continue;
      const name = typeof (item as { name?: unknown }).name === 'string' ? (item as { name: string }).name : '';
      const imageUrl =
        typeof (item as { image_url?: unknown }).image_url === 'string'
          ? (item as { image_url: string }).image_url
          : null;
      const quantity =
        typeof record.quantity === 'number'
          ? record.quantity
          : typeof (item as { quantity?: unknown }).quantity === 'number'
            ? (item as { quantity: number }).quantity
            : 1;
      result.push({ setNumber, name, imageUrl, quantity });
    }
  }
  return result;
}

async function fetchSupersets(
  no: string,
  colorId?: number
): Promise<BLSupersetItem[]> {
  const data = await blGet<BLSupersetResponse[] | { entries?: BLSupersetResponse[] }>(
    `/items/${STORE_ITEM_TYPE_PART}/${encodeURIComponent(no)}/supersets`,
    colorId ? { color_id: colorId } : {}
  );
  const raw: BLSupersetResponse[] = Array.isArray(data)
    ? data
    : Array.isArray((data as { entries?: BLSupersetResponse[] }).entries)
      ? ((data as { entries?: BLSupersetResponse[] }).entries ?? [])
      : [];
  return normalizeSupersetEntries(raw);
}

export async function blGetPartSupersets(
  no: string,
  colorId?: number
): Promise<BLSupersetItem[]> {
  const key = makeKey(no, colorId);
  const cached = supersetsCache.get(key);
  if (cached) return cached;
  const list = await fetchSupersets(no, colorId);
  if (process.env.NODE_ENV !== 'production') {
    logger.debug('bricklink.supersets', {
      no,
      colorId: typeof colorId === 'number' ? colorId : null,
      count: Array.isArray(list) ? list.length : 0,
    });
  }
  supersetsCache.set(key, list);
  return list;
}

export async function blGetSetSubsets(
  setNum: string
): Promise<BLSubsetItem[]> {
  // Reuse the same shape/logic as blGetPartSubsets, but for SET items with no color.
  const key = makeKey(setNum, undefined);
  const cached = subsetsCache.get(key);
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
    logger.debug('bricklink.set_subsets', {
      setNum,
      count: Array.isArray(list) ? list.length : 0,
    });
  }
  subsetsCache.set(key, list);
  return list;
}

export async function blGetPartColors(no: string): Promise<BLColorEntry[]> {
  const key = makeKey(no, undefined);
  const cached = colorsCache.get(key);
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
    logger.debug('bricklink.colors', {
      no,
      count: Array.isArray(list) ? list.length : 0,
    });
  }
  colorsCache.set(key, list);
  return list;
}

export async function blGetColor(
  colorId: number
): Promise<{ color_id: number; color_name?: string }> {
  const data = await blGet<{ color_id: number; color_name?: string }>(
    `/colors/${encodeURIComponent(colorId)}`
  );
  if (process.env.NODE_ENV !== 'production') {
    logger.debug('bricklink.color', {
      colorId,
      name: typeof data.color_name === 'string' ? data.color_name : null,
    });
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
    logger.debug('bricklink.image', {
      no,
      colorId,
      thumbnail:
        typeof data.thumbnail_url === 'string' || data.thumbnail_url === null
          ? data.thumbnail_url
          : null,
    });
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
  const cached = priceGuideCache.get(key);
  if (cached) return cached;

  const inFlight = priceGuideInFlight.get(key);
  if (inFlight) return inFlight;

  const promise = (async (): Promise<BLPriceGuide> => {
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
    logger.debug('bricklink.price_guide_raw', {
      no,
      colorId: typeof colorId === 'number' ? colorId : null,
      itemType,
      guideType,
      currency_code: data.currency_code ?? null,
      topLevelAvg: data.avg_price ?? null,
      detailCount: Array.isArray(data.price_detail) ? data.price_detail.length : 0,
    });
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

  if (
    pg.unitPriceUsed == null &&
    pg.minPriceUsed == null &&
    pg.maxPriceUsed == null
  ) {
    pg.__miss = true;
  }

  priceGuideCache.set(key, pg);
  return pg;
  })();

  priceGuideInFlight.set(key, promise);
  try {
    return await promise;
  } finally {
    priceGuideInFlight.delete(key);
  }
}

export async function blGetPartPriceGuide(
  no: string,
  colorId: number | null | undefined,
  itemType: 'PART' | 'MINIFIG' | 'SET' = 'PART',
  prefs?: PricingPreferences
): Promise<BLPriceGuide> {
  const primary = await fetchPriceGuide(no, colorId, itemType, 'stock', prefs);
  if (!primary.__miss) return primary;
  const fallback = await fetchPriceGuide(no, colorId, itemType, 'sold', prefs);
  if (fallback.unitPriceUsed == null && process.env.NODE_ENV !== 'production') {
    logger.warn('bricklink.price_guide_missing_after_fallback', {
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
