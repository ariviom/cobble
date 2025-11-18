import { NextRequest, NextResponse } from 'next/server';
import { getPart, getSetsForPart, getPartColorsForPart, type PartAvailableColor, type PartInSet, mapBrickLinkColorIdToRebrickableColorId, resolvePartIdToRebrickable } from '@/app/lib/rebrickable';

export async function GET(req: NextRequest) {
	const { searchParams } = new URL(req.url);
	const part = searchParams.get('part');
	const colorIdRaw = searchParams.get('colorId');
	const blColorIdRaw = searchParams.get('blColorId');
	if (!part) return NextResponse.json({ error: 'missing_part' });
	const colorId =
		colorIdRaw && colorIdRaw.trim() !== '' ? Number(colorIdRaw) : undefined;
	let rbPart = part;
	try {
		let selectedColorId = colorId;
		// Resolve BL part to RB if needed for colors + sets call
		try {
			await getPart(rbPart);
		} catch {
			try {
				const resolved = await resolvePartIdToRebrickable(part, { bricklinkId: part });
				if (resolved?.partNum) {
					rbPart = resolved.partNum;
				}
			} catch {
				// keep original
			}
		}
		let availableColors: PartAvailableColor[] = [];
		try {
			availableColors = await getPartColorsForPart(rbPart);
			if (selectedColorId == null && availableColors.length === 1) {
				selectedColorId = availableColors[0]!.id;
			}
		} catch {
			availableColors = [];
		}
		// Map BL color if provided and no RB color yet
		if (selectedColorId == null && blColorIdRaw && blColorIdRaw.trim() !== '') {
			try {
				const mapped = await mapBrickLinkColorIdToRebrickableColorId(Number(blColorIdRaw));
				if (typeof mapped === 'number') selectedColorId = mapped;
			} catch {}
		}
		let sets: PartInSet[] = [];
		try {
			sets = await getSetsForPart(rbPart, selectedColorId);
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			if (msg.includes('Rebrickable error 404')) {
				// Retry without color filter if not found
				try {
					sets = await getSetsForPart(rbPart, undefined);
				} catch {
					sets = [];
				}
			} else {
				sets = [];
			}
		}
		let partMetaName = '';
		let partMetaImage: string | null = null;
		try {
			const partMeta = await getPart(rbPart);
			partMetaName = partMeta.name;
			partMetaImage = partMeta.part_img_url;
		} catch {
			// tolerate missing metadata
		}
		if (process.env.NODE_ENV !== 'production') {
			try {
				console.log('identify/sets', { inputPart: part, resolvedPart: rbPart, selectedColorId, setsCount: sets.length });
			} catch {}
		}
		// Sort: most parts descending, then year descending
		const sorted = [...sets].sort((a, b) => {
			if (b.quantity !== a.quantity) return b.quantity - a.quantity;
			return b.year - a.year;
		});
		return NextResponse.json({
			part: {
				partNum: rbPart,
				name: partMetaName,
				imageUrl: partMetaImage,
			},
			availableColors,
			selectedColorId: selectedColorId ?? null,
			sets: sorted,
		});
	} catch (err) {
		if (process.env.NODE_ENV !== 'production') {
			try {
				console.log('identify/sets failed', {
					part,
					error: err instanceof Error ? err.message : String(err),
				});
			} catch {}
		}
		// Always-200: return empty sets with minimal part info
		return NextResponse.json({ error: 'identify_sets_failed', part: { partNum: part, name: '', imageUrl: null }, sets: [] });
	}
}


