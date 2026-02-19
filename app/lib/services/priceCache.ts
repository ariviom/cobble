import 'server-only';

import type { BLPriceGuide } from '@/app/lib/bricklink';
import { PRICING } from '@/app/lib/constants';
import { getCatalogWriteClient } from '@/app/lib/db/catalogAccess';
import { logger } from '@/lib/metrics';

// =============================================================================
// Types
// =============================================================================

export type PriceCacheKey = {
  itemId: string;
  itemType: 'PART' | 'MINIFIG' | 'SET';
  colorId: number;
  condition: 'N' | 'U';
  currencyCode: string;
  countryCode: string;
};

export type PriceCacheEntry = {
  itemId: string;
  itemType: string;
  colorId: number;
  condition: string;
  currencyCode: string;
  countryCode: string;
  avgPrice: number | null;
  minPrice: number | null;
  maxPrice: number | null;
  qtyAvgPrice: number | null;
  unitQuantity: number | null;
  totalQuantity: number | null;
  fetchedAt: string;
};

export type DerivedPriceEntry = {
  itemId: string;
  itemType: string;
  colorId: number;
  condition: string;
  currencyCode: string;
  countryCode: string;
  derivedAvg: number;
  derivedMin: number | null;
  derivedMax: number | null;
  observationCount: number;
  firstObservedAt: string;
  lastObservedAt: string;
  computedAt: string;
};

// =============================================================================
// Helpers
// =============================================================================

function keyToFilter(key: PriceCacheKey) {
  return {
    item_id: key.itemId,
    item_type: key.itemType,
    color_id: key.colorId,
    condition: key.condition,
    currency_code: key.currencyCode,
    country_code: key.countryCode,
  };
}

function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

// =============================================================================
// Cache functions (bl_price_cache)
// =============================================================================

export async function getCachedPrice(
  key: PriceCacheKey,
  ttlHours: number = PRICING.BL_CACHE_TTL_HOURS
): Promise<PriceCacheEntry | null> {
  const db = getCatalogWriteClient();
  const filter = keyToFilter(key);
  const cutoff = hoursAgo(ttlHours);

  const { data, error } = await db
    .from('bl_price_cache')
    .select('*')
    .match(filter)
    .gte('fetched_at', cutoff)
    .maybeSingle();

  if (error) {
    logger.warn('priceCache.getCachedPrice.error', { error: error.message });
    return null;
  }
  if (!data) return null;

  // Fire-and-forget hit count increment (safe if column doesn't exist yet)
  if ('hit_count' in data) {
    void db
      .from('bl_price_cache')
      .update({ hit_count: (data.hit_count ?? 0) + 1 })
      .match(filter)
      .then(({ error: hitErr }) => {
        if (hitErr)
          logger.warn('priceCache.hitCount.error', { error: hitErr.message });
      });
  }

  return {
    itemId: data.item_id,
    itemType: data.item_type,
    colorId: data.color_id,
    condition: data.condition,
    currencyCode: data.currency_code,
    countryCode: data.country_code,
    avgPrice: data.avg_price != null ? Number(data.avg_price) : null,
    minPrice: data.min_price != null ? Number(data.min_price) : null,
    maxPrice: data.max_price != null ? Number(data.max_price) : null,
    qtyAvgPrice: data.qty_avg_price != null ? Number(data.qty_avg_price) : null,
    unitQuantity: data.unit_quantity,
    totalQuantity: data.total_quantity,
    fetchedAt: data.fetched_at,
  };
}

export async function writePriceCache(entry: PriceCacheEntry): Promise<void> {
  const db = getCatalogWriteClient();
  const { error } = await db.from('bl_price_cache').upsert(
    {
      item_id: entry.itemId,
      item_type: entry.itemType,
      color_id: entry.colorId,
      condition: entry.condition,
      currency_code: entry.currencyCode,
      country_code: entry.countryCode,
      avg_price: entry.avgPrice,
      min_price: entry.minPrice,
      max_price: entry.maxPrice,
      qty_avg_price: entry.qtyAvgPrice,
      unit_quantity: entry.unitQuantity,
      total_quantity: entry.totalQuantity,
      fetched_at: entry.fetchedAt,
    },
    {
      onConflict:
        'item_id,item_type,color_id,condition,currency_code,country_code',
    }
  );
  if (error) {
    logger.warn('priceCache.writePriceCache.error', { error: error.message });
  }
}

export async function writePriceCacheBatch(
  entries: PriceCacheEntry[]
): Promise<void> {
  if (entries.length === 0) return;
  const db = getCatalogWriteClient();

  for (let i = 0; i < entries.length; i += PRICING.WRITE_BATCH_SIZE) {
    const chunk = entries.slice(i, i + PRICING.WRITE_BATCH_SIZE);
    const rows = chunk.map(e => ({
      item_id: e.itemId,
      item_type: e.itemType,
      color_id: e.colorId,
      condition: e.condition,
      currency_code: e.currencyCode,
      country_code: e.countryCode,
      avg_price: e.avgPrice,
      min_price: e.minPrice,
      max_price: e.maxPrice,
      qty_avg_price: e.qtyAvgPrice,
      unit_quantity: e.unitQuantity,
      total_quantity: e.totalQuantity,
      fetched_at: e.fetchedAt,
    }));

    const { error } = await db.from('bl_price_cache').upsert(rows, {
      onConflict:
        'item_id,item_type,color_id,condition,currency_code,country_code',
    });
    if (error) {
      logger.warn('priceCache.writePriceCacheBatch.error', {
        error: error.message,
        batch: i,
      });
    }
  }
}

// =============================================================================
// Observation functions (bl_price_observations)
// =============================================================================

export async function recordObservation(
  entry: PriceCacheEntry,
  source: string = 'api'
): Promise<void> {
  const db = getCatalogWriteClient();
  const { error } = await db.from('bl_price_observations').insert({
    item_id: entry.itemId,
    item_type: entry.itemType,
    color_id: entry.colorId,
    condition: entry.condition,
    currency_code: entry.currencyCode,
    country_code: entry.countryCode,
    avg_price: entry.avgPrice,
    min_price: entry.minPrice,
    max_price: entry.maxPrice,
    qty_avg_price: entry.qtyAvgPrice,
    unit_quantity: entry.unitQuantity,
    total_quantity: entry.totalQuantity,
    source,
    observed_at: entry.fetchedAt,
  });
  if (error) {
    logger.warn('priceCache.recordObservation.error', {
      error: error.message,
    });
  }
}

export async function recordObservationsBatch(
  entries: PriceCacheEntry[],
  source: string = 'api'
): Promise<void> {
  if (entries.length === 0) return;
  const db = getCatalogWriteClient();

  for (let i = 0; i < entries.length; i += PRICING.WRITE_BATCH_SIZE) {
    const chunk = entries.slice(i, i + PRICING.WRITE_BATCH_SIZE);
    const rows = chunk.map(e => ({
      item_id: e.itemId,
      item_type: e.itemType,
      color_id: e.colorId,
      condition: e.condition,
      currency_code: e.currencyCode,
      country_code: e.countryCode,
      avg_price: e.avgPrice,
      min_price: e.minPrice,
      max_price: e.maxPrice,
      qty_avg_price: e.qtyAvgPrice,
      unit_quantity: e.unitQuantity,
      total_quantity: e.totalQuantity,
      source,
      observed_at: e.fetchedAt,
    }));

    const { error } = await db.from('bl_price_observations').insert(rows);
    if (error) {
      logger.warn('priceCache.recordObservationsBatch.error', {
        error: error.message,
        batch: i,
      });
    }
  }
}

// =============================================================================
// Derived pricing functions (bp_derived_prices)
// =============================================================================

export async function getDerivedPrice(
  key: PriceCacheKey
): Promise<DerivedPriceEntry | null> {
  const db = getCatalogWriteClient();
  const filter = keyToFilter(key);
  const cutoff = daysAgo(PRICING.DERIVED_TTL_DAYS);

  const { data, error } = await db
    .from('bp_derived_prices')
    .select('*')
    .match(filter)
    .gte('computed_at', cutoff)
    .maybeSingle();

  if (error) {
    logger.warn('priceCache.getDerivedPrice.error', { error: error.message });
    return null;
  }
  if (!data) return null;

  return {
    itemId: data.item_id,
    itemType: data.item_type,
    colorId: data.color_id,
    condition: data.condition,
    currencyCode: data.currency_code,
    countryCode: data.country_code,
    derivedAvg: Number(data.derived_avg),
    derivedMin: data.derived_min != null ? Number(data.derived_min) : null,
    derivedMax: data.derived_max != null ? Number(data.derived_max) : null,
    observationCount: data.observation_count,
    firstObservedAt: data.first_observed_at,
    lastObservedAt: data.last_observed_at,
    computedAt: data.computed_at,
  };
}

export async function tryComputeDerivedPrice(
  key: PriceCacheKey
): Promise<DerivedPriceEntry | null> {
  const db = getCatalogWriteClient();
  const filter = keyToFilter(key);
  const retentionCutoff = daysAgo(PRICING.OBSERVATION_RETENTION_DAYS);

  // Query all observations within retention window
  const { data: observations, error } = await db
    .from('bl_price_observations')
    .select('avg_price, min_price, max_price, observed_at')
    .match(filter)
    .gte('observed_at', retentionCutoff)
    .order('observed_at', { ascending: true });

  if (error) {
    logger.warn('priceCache.tryComputeDerivedPrice.queryError', {
      error: error.message,
    });
    return null;
  }

  if (!observations || observations.length < PRICING.DERIVED_MIN_OBSERVATIONS) {
    return null;
  }

  // Check time span
  const first = new Date(observations[0]!.observed_at).getTime();
  const last = new Date(
    observations[observations.length - 1]!.observed_at
  ).getTime();
  const spanDays = (last - first) / (1000 * 60 * 60 * 24);

  if (spanDays < PRICING.DERIVED_MIN_SPAN_DAYS) {
    return null;
  }

  // Compute averages from observations that have avg_price
  let sumAvg = 0;
  let countAvg = 0;
  let globalMin: number | null = null;
  let globalMax: number | null = null;

  for (const obs of observations) {
    const avg = obs.avg_price != null ? Number(obs.avg_price) : null;
    if (avg != null && Number.isFinite(avg)) {
      sumAvg += avg;
      countAvg++;
    }
    const min = obs.min_price != null ? Number(obs.min_price) : null;
    if (min != null && Number.isFinite(min)) {
      globalMin = globalMin == null ? min : Math.min(globalMin, min);
    }
    const max = obs.max_price != null ? Number(obs.max_price) : null;
    if (max != null && Number.isFinite(max)) {
      globalMax = globalMax == null ? max : Math.max(globalMax, max);
    }
  }

  if (countAvg === 0) return null;

  const derivedAvg = sumAvg / countAvg;
  const now = new Date().toISOString();

  const entry: DerivedPriceEntry = {
    itemId: key.itemId,
    itemType: key.itemType,
    colorId: key.colorId,
    condition: key.condition,
    currencyCode: key.currencyCode,
    countryCode: key.countryCode,
    derivedAvg,
    derivedMin: globalMin,
    derivedMax: globalMax,
    observationCount: countAvg,
    firstObservedAt: new Date(first).toISOString(),
    lastObservedAt: new Date(last).toISOString(),
    computedAt: now,
  };

  // Upsert into bp_derived_prices
  const { error: upsertError } = await db.from('bp_derived_prices').upsert(
    {
      item_id: entry.itemId,
      item_type: entry.itemType,
      color_id: entry.colorId,
      condition: entry.condition,
      currency_code: entry.currencyCode,
      country_code: entry.countryCode,
      derived_avg: entry.derivedAvg,
      derived_min: entry.derivedMin,
      derived_max: entry.derivedMax,
      observation_count: entry.observationCount,
      first_observed_at: entry.firstObservedAt,
      last_observed_at: entry.lastObservedAt,
      computed_at: entry.computedAt,
    },
    {
      onConflict:
        'item_id,item_type,color_id,condition,currency_code,country_code',
    }
  );

  if (upsertError) {
    logger.warn('priceCache.tryComputeDerivedPrice.upsertError', {
      error: upsertError.message,
    });
    return null;
  }

  return entry;
}

// =============================================================================
// Conversion helpers
// =============================================================================

export function cacheEntryToPriceGuide(
  usedEntry: PriceCacheEntry | null,
  newEntry?: PriceCacheEntry | null
): BLPriceGuide {
  return {
    unitPriceUsed: usedEntry?.avgPrice ?? usedEntry?.qtyAvgPrice ?? null,
    unitPriceNew: newEntry?.avgPrice ?? newEntry?.qtyAvgPrice ?? null,
    minPriceUsed: usedEntry?.minPrice ?? null,
    maxPriceUsed: usedEntry?.maxPrice ?? null,
    currencyCode: usedEntry?.currencyCode ?? newEntry?.currencyCode ?? null,
  };
}

export function derivedEntryToPriceGuide(
  usedEntry: DerivedPriceEntry | null,
  newEntry?: DerivedPriceEntry | null
): BLPriceGuide {
  return {
    unitPriceUsed: usedEntry?.derivedAvg ?? null,
    unitPriceNew: newEntry?.derivedAvg ?? null,
    minPriceUsed: usedEntry?.derivedMin ?? null,
    maxPriceUsed: usedEntry?.derivedMax ?? null,
    currencyCode: usedEntry?.currencyCode ?? newEntry?.currencyCode ?? null,
  };
}

export function priceGuideToCacheEntry(
  pg: {
    unitPriceUsed: number | null;
    minPriceUsed: number | null;
    maxPriceUsed: number | null;
    currencyCode: string | null;
  },
  itemId: string,
  itemType: 'PART' | 'MINIFIG' | 'SET',
  colorId: number,
  condition: 'N' | 'U',
  currencyCode: string,
  countryCode: string
): PriceCacheEntry {
  return {
    itemId,
    itemType,
    colorId,
    condition,
    currencyCode,
    countryCode,
    avgPrice: pg.unitPriceUsed,
    minPrice: pg.minPriceUsed,
    maxPrice: pg.maxPriceUsed,
    qtyAvgPrice: null,
    unitQuantity: null,
    totalQuantity: null,
    fetchedAt: new Date().toISOString(),
  };
}
