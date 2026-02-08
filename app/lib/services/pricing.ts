import 'server-only';

import { blGetPartPriceGuide } from '@/app/lib/bricklink';
import { mapToBrickLink } from '@/app/lib/mappings/rebrickableToBricklink';
import {
  DEFAULT_PRICING_PREFERENCES,
  formatPricingScopeLabel,
  type PricingPreferences,
} from '@/app/lib/pricing';
import { incrementCounter, logEvent, logger } from '@/lib/metrics';

export type PriceRequestItem = {
  key: string;
  partId: string;
  colorId: number;
  /** Pre-resolved BrickLink part ID from identity (skips mapToBrickLink) */
  blPartId?: string | undefined;
  /** Pre-resolved BrickLink color ID from identity */
  blColorId?: number | undefined;
  /** Pre-resolved item type from identity */
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
          // Fast path: use pre-resolved BL IDs from identity
          let itemNo: string;
          let blColorId: number | undefined;
          let itemType: 'PART' | 'MINIFIG';

          if (
            item.blPartId != null &&
            (item.blColorId != null || item.itemType === 'MINIFIG')
          ) {
            itemNo = item.blPartId;
            blColorId = item.blColorId;
            itemType = item.itemType ?? 'PART';
          } else {
            // Fallback: resolve via mapToBrickLink
            const mapped = await mapToBrickLink(item.partId, item.colorId);
            if (!mapped) {
              if (process.env.NODE_ENV !== 'production') {
                logEvent(`${logPrefix}.unmapped_item`, {
                  key: item.key,
                  partId: item.partId,
                  colorId: item.colorId,
                });
              }
              return;
            }
            itemNo = mapped.itemNo;
            blColorId = mapped.colorId ?? undefined;
            itemType = mapped.itemType;
          }

          const pg = await blGetPartPriceGuide(
            itemNo,
            blColorId,
            itemType,
            effectivePrefs
          );

          prices[item.key] = {
            unitPrice: pg.unitPriceUsed,
            minPrice: pg.minPriceUsed,
            maxPrice: pg.maxPriceUsed,
            currency: pg.currencyCode,
            bricklinkColorId: blColorId ?? null,
            itemType,
            scopeLabel,
            pricingSource: 'real_time',
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
