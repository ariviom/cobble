import 'server-only';

import { blGetPartPriceGuide } from '@/app/lib/bricklink';
import { mapToBrickLink } from '@/app/lib/mappings/rebrickableToBricklink';
import {
	incrementCounter,
	logEvent,
	logger,
} from '@/lib/metrics';
import {
	DEFAULT_PRICING_PREFERENCES,
	formatPricingScopeLabel,
	type PricingPreferences,
} from '@/app/lib/pricing';

export type PriceRequestItem = {
	key: string;
	partId: string;
	colorId: number;
};

export type PriceResponseEntry = {
	unitPrice: number | null;
	minPrice: number | null;
	maxPrice: number | null;
	currency: string | null;
	bricklinkColorId: number | null;
	itemType: 'PART' | 'MINIFIG';
	scopeLabel: string | null;
	pricingSource: 'real_time' | 'historical' | 'unavailable';
	pricing_source: 'real_time' | 'historical' | 'unavailable';
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
		// eslint-disable-next-line no-await-in-loop
		await Promise.all(
			batch.map(async item => {
				try {
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

					const pg = await blGetPartPriceGuide(
						mapped.itemNo,
						mapped.colorId ?? undefined,
						mapped.itemType,
						effectivePrefs
					);

					prices[item.key] = {
						unitPrice: pg.unitPriceUsed,
						minPrice: pg.minPriceUsed,
						maxPrice: pg.maxPriceUsed,
						currency: pg.currencyCode,
						bricklinkColorId: mapped.colorId ?? null,
						itemType: mapped.itemType,
						scopeLabel,
						pricingSource: 'real_time',
						pricing_source: 'real_time',
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

