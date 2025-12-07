import 'server-only';

import {
    blGetPart,
    blGetPartColors,
    blGetPartSubsets,
    blGetPartSupersets,
    type BLSupersetItem,
} from '@/app/lib/bricklink';
import { EXTERNAL } from '@/app/lib/constants';
import { logger } from '@/lib/metrics';

import { buildBlAvailableColors, enrichSetsWithRebrickable } from './enrichment';
import {
    ExternalCallBudget,
    isBudgetError,
    withBudget,
    type BLFallbackResult,
    type BLSet,
} from './types';

type FetchOptions = {
	initialImage?: string | null;
	initialName?: string;
	colorVariantLimit?: number;
	supersetLimit?: number;
	enrichLimit?: number;
};

function toBLSet(entries: BLSupersetItem[]): BLSet[] {
	return entries.map(s => ({
		setNumber: s.setNumber,
		name: s.name,
		year: 0,
		imageUrl: s.imageUrl,
		quantity: s.quantity,
		numParts: null,
		themeId: null,
		themeName: null,
	}));
}

function dedupeSets(sets: BLSet[]): BLSet[] {
	const seen = new Set<string>();
	return sets.filter(s => {
		if (seen.has(s.setNumber)) return false;
		seen.add(s.setNumber);
		return true;
	});
}

async function fetchSupersetsWithColorFallback(
	blId: string,
	budget: ExternalCallBudget,
	colorVariantLimit: number,
	supersetLimit: number
): Promise<BLSet[]> {
	let setsFromBL = toBLSet(await withBudget(budget, () => blGetPartSupersets(blId)));
	if (setsFromBL.length >= supersetLimit) return setsFromBL.slice(0, supersetLimit);

	try {
		const colors = await withBudget(budget, () => blGetPartColors(blId));
		for (const c of (colors ?? []).slice(0, colorVariantLimit)) {
			if (typeof c?.color_id !== 'number') continue;
			const supByColor = await withBudget(budget, () => blGetPartSupersets(blId, c.color_id));
			setsFromBL = setsFromBL.concat(toBLSet(supByColor));
			if (setsFromBL.length >= supersetLimit) break;
		}
		if (setsFromBL.length >= supersetLimit) return setsFromBL.slice(0, supersetLimit);

		const subsets = await withBudget(budget, () => blGetPartSubsets(blId));
		const uniqColorIds = new Map<number, string | undefined>();
		for (const entry of subsets ?? []) {
			if (typeof entry?.color_id === 'number' && !uniqColorIds.has(entry.color_id)) {
				uniqColorIds.set(entry.color_id, entry.color_name);
			}
		}
		for (const [colorId] of uniqColorIds) {
			const supByColor = await withBudget(budget, () => blGetPartSupersets(blId, colorId));
			setsFromBL = setsFromBL.concat(toBLSet(supByColor));
			if (setsFromBL.length >= supersetLimit) break;
		}
	} catch (err) {
		if (isBudgetError(err)) throw err;
		logger.warn('identify.bl_supersets_fallback_failed', {
			blId,
			error: err instanceof Error ? err.message : String(err),
		});
	}

	return dedupeSets(setsFromBL).slice(0, supersetLimit);
}

export async function fetchBLSupersetsFallback(
	blId: string,
	budget: ExternalCallBudget,
	options?: FetchOptions
): Promise<BLFallbackResult> {
	const colorVariantLimit = options?.colorVariantLimit ?? EXTERNAL.BL_COLOR_VARIANT_LIMIT;
	const supersetLimit = options?.supersetLimit ?? EXTERNAL.BL_SUPERSET_TOTAL_LIMIT;
	const enrichLimit = options?.enrichLimit ?? EXTERNAL.ENRICH_LIMIT;

	let setsFromBL: BLSet[] = [];
	let partImage: string | null = options?.initialImage ?? null;
	let partName = options?.initialName ?? '';

	try {
		setsFromBL = await fetchSupersetsWithColorFallback(
			blId,
			budget,
			colorVariantLimit,
			supersetLimit
		);
	} catch (err) {
		if (isBudgetError(err)) throw err;
	}

	try {
		const meta = await withBudget(budget, () => blGetPart(blId));
		partName = meta?.name ?? partName;
		const metaWithImage = meta as { image_url?: unknown };
		partImage = typeof metaWithImage.image_url === 'string' ? metaWithImage.image_url : partImage;
	} catch (err) {
		if (isBudgetError(err)) throw err;
	}

	let blAvailableColors: BLFallbackResult['blAvailableColors'] = [];
	try {
		blAvailableColors = await buildBlAvailableColors(blId, budget);
	} catch (err) {
		if (isBudgetError(err)) throw err;
	}

	if (setsFromBL.length) {
		try {
			setsFromBL = await enrichSetsWithRebrickable(setsFromBL, budget, enrichLimit);
		} catch (err) {
			if (isBudgetError(err)) throw err;
		}
	}

	if (process.env.NODE_ENV !== 'production') {
		logger.debug('identify.bl_fallback', {
			blPart: blId,
			colorCount: blAvailableColors.length,
			setCount: setsFromBL.length,
		});
	}

	return {
		sets: setsFromBL,
		partName,
		partImage,
		blAvailableColors,
	};
}
