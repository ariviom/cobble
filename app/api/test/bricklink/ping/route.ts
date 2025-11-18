import { NextRequest, NextResponse } from 'next/server';
import {
	blGetPart,
	blGetPartColors,
	blGetPartSubsets,
	blGetPartSupersets,
	blGetPartImageUrl,
	type BLColorEntry,
	type BLSupersetItem,
} from '@/app/lib/bricklink';

export async function GET(req: NextRequest) {
	const { searchParams } = new URL(req.url);
	const part = (searchParams.get('part') ?? '3001').trim();
	const colorIdParam = searchParams.get('colorId');
	const colorId = colorIdParam && colorIdParam.trim() !== '' ? Number(colorIdParam) : undefined;

	const result: Record<string, unknown> = {
		inputs: { part, colorId: typeof colorId === 'number' ? colorId : null },
	};

	// 1) Item
	try {
		const item = await blGetPart(part);
		result.partOk = true;
		result.partName = item?.name ?? '';
		result.partImageUrl = (item as any)?.image_url ?? null;
	} catch (e) {
		result.partOk = false;
		result.partError = e instanceof Error ? e.message : String(e);
	}

	// 2) Colors
	let colors: BLColorEntry[] = [];
	try {
		colors = await blGetPartColors(part);
		result.colorsCount = colors.length;
		result.colorsSample = colors.length ? colors[0] : null;
	} catch (e) {
		result.colorsError = e instanceof Error ? e.message : String(e);
	}

	// 3) Subsets (unscoped)
	try {
		const subsets = await blGetPartSubsets(part);
		result.subsetsCount = Array.isArray(subsets) ? subsets.length : 0;
		result.subsetsSample = Array.isArray(subsets) && subsets.length ? subsets[0] : null;
	} catch (e) {
		result.subsetsError = e instanceof Error ? e.message : String(e);
	}

	// 4) Supersets (unscoped)
	let supersets: BLSupersetItem[] = [];
	try {
		supersets = await blGetPartSupersets(part);
		result.supersetsCount = Array.isArray(supersets) ? supersets.length : 0;
		result.supersetsSample = Array.isArray(supersets) && supersets.length ? supersets[0] : null;
	} catch (e) {
		result.supersetsError = e instanceof Error ? e.message : String(e);
	}

	// 5) Supersets by color (explicit param or first known color)
	let effectiveColorId: number | undefined = colorId;
	if (typeof effectiveColorId !== 'number' && colors.length > 0) {
		effectiveColorId = colors[0]!.color_id;
	}
	if (typeof effectiveColorId === 'number') {
		try {
			const supByColor = await blGetPartSupersets(part, effectiveColorId);
			result.supersetsByColorTried = effectiveColorId;
			result.supersetsByColorCount = Array.isArray(supByColor) ? supByColor.length : 0;
			result.supersetsByColorSample =
				Array.isArray(supByColor) && supByColor.length ? supByColor[0] : null;
		} catch (e) {
			result.supersetsByColorTried = effectiveColorId;
			result.supersetsByColorError = e instanceof Error ? e.message : String(e);
		}
		// 6) Image for that color
		try {
			const img = await blGetPartImageUrl(part, effectiveColorId);
			result.imageForColor = {
				colorId: effectiveColorId,
				thumbnailUrl: (img as any)?.thumbnail_url ?? null,
			};
		} catch (e) {
			result.imageForColorError = e instanceof Error ? e.message : String(e);
		}
	}

	return NextResponse.json(result);
}


