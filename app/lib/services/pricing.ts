import 'server-only';

import { blGetPartPriceGuide } from '@/app/lib/bricklink';
import {
  DEFAULT_PRICING_PREFERENCES,
  formatPricingScopeLabel,
  type PricingPreferences,
} from '@/app/lib/pricing';
import { incrementCounter, logger } from '@/lib/metrics';

export type PriceRequestItem = {
  key: string;
  partId: string;
  colorId: number;
  /** BrickLink part ID from identity resolution */
  blPartId?: string | undefined;
  /** BrickLink color ID from identity resolution */
  blColorId?: number | undefined;
  /** Item type from identity resolution */
  itemType?: 'PART' | 'MINIFIG' | undefined;
};

export type PriceResponseEntry = {
  unitPrice: number | null;
  minPrice: number | null;
  maxPrice: number | null;
  currency: string | null;
  bricklinkColorId: number | null;
  itemType: 'PART' | 'MINIFIG';
  scopeLabel: string | null;
  /** Source of pricing data */
  pricingSource: 'real_time' | 'historical' | 'unavailable';
  lastUpdatedAt: string | null;
  nextRefreshAt: string | null;
};

type FetchOptions = {
  batchSize?: number;
  logPrefix?: string;
};

/**
 * Fetch BrickLink prices for a batch of items using the shared BL price guide helper.
 * Returns a sparse map keyed by the caller-provided item key; unmapped items are skipped.
 */
export async function fetchBricklinkPrices(
  items: PriceRequestItem[],
  pricingPrefs?: PricingPreferences,
  options?: FetchOptions
): Promise<Record<string, PriceResponseEntry>> {
  const batchSize = options?.batchSize ?? 10;
  const logPrefix = options?.logPrefix ?? 'prices.bricklink';
  const prices: Record<string, PriceResponseEntry> = {};
  const effectivePrefs = pricingPrefs ?? DEFAULT_PRICING_PREFERENCES;
  const scopeLabel = formatPricingScopeLabel(effectivePrefs);

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    await Promise.all(
      batch.map(async item => {
        try {
          if (
            item.blPartId == null ||
            (item.blColorId == null && item.itemType !== 'MINIFIG')
          ) {
            // No BL IDs available — skip (all inventory items should have identity)
            return;
          }

          const itemNo = item.blPartId;
          const blColorId = item.blColorId;
          const itemType: 'PART' | 'MINIFIG' = item.itemType ?? 'PART';

          const pg = await blGetPartPriceGuide(
            itemNo,
            blColorId,
            itemType,
            effectivePrefs
          );

          const pricingSource: PriceResponseEntry['pricingSource'] =
            pg.__source === 'derived'
              ? 'historical'
              : pg.__source === 'quota_exhausted'
                ? 'unavailable'
                : 'real_time';

          prices[item.key] = {
            unitPrice: pg.unitPriceUsed,
            minPrice: pg.minPriceUsed,
            maxPrice: pg.maxPriceUsed,
            currency: pg.currencyCode,
            bricklinkColorId: blColorId ?? null,
            itemType,
            scopeLabel,
            pricingSource,
            lastUpdatedAt: null,
            nextRefreshAt: null,
          };
          incrementCounter(`${logPrefix}_fetched`);
        } catch (err) {
          incrementCounter(`${logPrefix}_item_failed`, {
            key: item.key,
            error: err instanceof Error ? err.message : String(err),
          });
          if (process.env.NODE_ENV !== 'production') {
            logger.error(`${logPrefix}.price_fetch_failed`, {
              key: item.key,
              partId: item.partId,
              colorId: item.colorId,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
      })
    );
  }

  return prices;
}
