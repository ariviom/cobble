import { NextRequest, NextResponse } from 'next/server';
import { getPart, getSetsForPart } from '@/app/lib/rebrickable';

export async function GET(req: NextRequest) {
	const { searchParams } = new URL(req.url);
	const part = searchParams.get('part');
	const colorIdRaw = searchParams.get('colorId');
	if (!part) return NextResponse.json({ error: 'missing_part' }, { status: 400 });
	const colorId =
		colorIdRaw && colorIdRaw.trim() !== '' ? Number(colorIdRaw) : undefined;
	try {
		let sets = [];
		try {
			sets = await getSetsForPart(part, colorId);
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			if (msg.includes('Rebrickable error 404')) {
				// Retry without color filter if not found
				try {
					sets = await getSetsForPart(part, undefined);
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
			const partMeta = await getPart(part);
			partMetaName = partMeta.name;
			partMetaImage = partMeta.part_img_url;
		} catch {
			// tolerate missing metadata
		}
		// Sort: most parts descending, then year descending
		const sorted = [...sets].sort((a, b) => {
			if (b.quantity !== a.quantity) return b.quantity - a.quantity;
			return b.year - a.year;
		});
		return NextResponse.json({
			part: {
				partNum: part,
				name: partMetaName,
				imageUrl: partMetaImage,
			},
			sets: sorted,
		});
	} catch (err) {
		console.error('Identify sets failed:', {
			part,
			error: err instanceof Error ? err.message : String(err),
			stack: err instanceof Error ? err.stack : undefined,
		});
		// Simplest working path: return empty sets with minimal part info
		return NextResponse.json({ part: { partNum: part, name: '', imageUrl: null }, sets: [] });
	}
}


