import 'server-only';

import { blGetPartColors, type BLColorEntry } from '@/app/lib/bricklink';
import { EXTERNAL } from '@/app/lib/constants';
import { getColors, getSetSummary } from '@/app/lib/rebrickable';
import { logger } from '@/lib/metrics';

import {
    ExternalCallBudget,
    isBudgetError,
    withBudget,
    type BLAvailableColor,
    type BLSet,
} from './types';

export async function buildBlAvailableColors(
	blPartId: string,
	budget: ExternalCallBudget
): Promise<BLAvailableColor[]> {
	let cols: BLColorEntry[] = [];
	try {
		cols = await withBudget(budget, () => blGetPartColors(blPartId));
	} catch (err) {
		if (isBudgetError(err)) throw err;
	}
	if (!cols.length) return [];

	// Map BL color ids to human-readable names via Rebrickable colors (cached in getColors()).
	const nameByBlId = new Map<number, string>();
	try {
		const rbColors = await getColors();
		for (const c of rbColors) {
			const bl = (c.external_ids as { BrickLink?: { ext_ids?: number[] } } | undefined)?.BrickLink;
			const ids: number[] | undefined = Array.isArray(bl?.ext_ids) ? bl.ext_ids : undefined;
			if (!ids) continue;
			for (const blId of ids) {
				if (!nameByBlId.has(blId)) {
					nameByBlId.set(blId, c.name);
				}
			}
		}
	} catch (err) {
		if (isBudgetError(err)) throw err;
		logger.warn('identify.rb_colors_mapping_failed', {
			error: err instanceof Error ? err.message : String(err),
		});
	}

	return cols.map(c => ({
		id: c.color_id,
		name: nameByBlId.get(c.color_id) ?? String(c.color_id),
	}));
}

export async function enrichSetsWithRebrickable(
	sets: BLSet[],
	budget: ExternalCallBudget,
	limit: number = EXTERNAL.ENRICH_LIMIT
): Promise<BLSet[]> {
	const top = sets.slice(0, limit);
	const enriched = await Promise.all(
		top.map(async set => {
			try {
				const summary = await withBudget(budget, () => getSetSummary(set.setNumber));
				return {
					...set,
					year: summary.year ?? set.year,
					imageUrl: summary.imageUrl ?? set.imageUrl,
					numParts: summary.numParts ?? set.numParts ?? null,
					themeId: summary.themeId ?? set.themeId ?? null,
					themeName: summary.themeName ?? set.themeName ?? null,
				};
			} catch (err) {
				if (isBudgetError(err)) throw err;
				return set;
			}
		})
	);
	return [...enriched, ...sets.slice(top.length)];
}
