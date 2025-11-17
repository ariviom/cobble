import { NextRequest, NextResponse } from 'next/server';
import { identifyWithBrickognize, extractCandidatePartNumbers } from '@/app/lib/brickognize';
import { getSetsForPart, resolvePartIdToRebrickable, type PartInSet } from '@/app/lib/rebrickable';

export async function POST(req: NextRequest) {
	try {
		const form = await req.formData();
		const file = form.get('image');
		if (!(file instanceof File)) {
			return NextResponse.json({ error: 'missing_image' }, { status: 400 });
		}
		const colorHintRaw = form.get('colorHint');
		const colorHint =
			typeof colorHintRaw === 'string' && colorHintRaw.trim() !== ''
				? Number(colorHintRaw)
				: undefined;

		// Call Brickognize
		const brickognizePayload = await identifyWithBrickognize(file as unknown as Blob);
		if (process.env.NODE_ENV !== 'production') {
			try {
				console.log('identify: brickognize raw payload', {
					keys: Object.keys(brickognizePayload ?? {}),
					listing_id: (brickognizePayload as any).listing_id,
					items_len: Array.isArray((brickognizePayload as any).items)
						? (brickognizePayload as any).items.length
						: undefined,
					candidates_len: Array.isArray((brickognizePayload as any).candidates)
						? (brickognizePayload as any).candidates.length
						: undefined,
				});
			} catch {
				// ignore
			}
		}
		const candidates = extractCandidatePartNumbers(brickognizePayload)
			// Prefer higher confidence first
			.sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));

		if (candidates.length === 0) {
			return NextResponse.json({ error: 'no_match' }, { status: 422 });
		}

		// Resolve each candidate to a Rebrickable part (name + image) using resolver
		const resolved = await Promise.all(
			candidates.map(async (c) => {
				const part = await resolvePartIdToRebrickable(c.partNum);
				if (!part) return null;
				return {
					partNum: part.partNum,
					name: part.name,
					imageUrl: part.imageUrl,
					confidence: c.confidence ?? 0,
					colorId: c.colorId,
					colorName: c.colorName,
				};
			})
		);
		const valid = resolved.filter(Boolean) as Array<{
			partNum: string;
			name: string;
			imageUrl: string | null;
			confidence: number;
			colorId?: number;
			colorName?: string;
		}>;
		if (valid.length === 0) {
			return NextResponse.json({ error: 'no_valid_candidate' }, { status: 422 });
		}

		// Try candidates in order until we find sets; avoid forcing color
		async function fetchCandidateSets(
			partNum: string,
			preferredColorId?: number
		): Promise<PartInSet[]> {
			// Try with preferred color if provided, then without color
			if (typeof preferredColorId === 'number') {
				try {
					const s = await getSetsForPart(partNum, preferredColorId);
					if (s.length) return s;
				} catch {
					// ignore; fall through
				}
			}
			try {
				return await getSetsForPart(partNum, undefined);
			} catch {
				return [];
			}
		}

		// Choose best candidate by sets found; if none, use the first candidate
		let chosen = valid[0]!;
		let chosenColorId = colorHint ?? chosen.colorId ?? undefined;
		let sets: PartInSet[] = await fetchCandidateSets(chosen.partNum, chosenColorId);
		if (!sets.length && valid.length > 1) {
			for (let i = 1; i < Math.min(valid.length, 5); i++) {
				const cand = valid[i]!;
				const s = await fetchCandidateSets(cand.partNum, colorHint ?? cand.colorId ?? undefined);
				if (s.length) {
					chosen = cand;
					chosenColorId = colorHint ?? cand.colorId ?? undefined;
					sets = s;
					break;
				}
			}
		}
		// Sort sets: most parts descending, then year descending
		if (sets.length) {
			sets = [...sets].sort((a, b) => {
				if (b.quantity !== a.quantity) return b.quantity - a.quantity;
				return b.year - a.year;
			});
		} else if (process.env.NODE_ENV !== 'production') {
			console.log('identify: no sets found for candidates', {
				tried: valid.slice(0, 5).map(v => v.partNum),
			});
		}

		return NextResponse.json({
			part: {
				partNum: chosen.partNum,
				name: chosen.name,
				imageUrl: chosen.imageUrl,
				confidence: chosen.confidence,
				colorId: chosenColorId ?? null,
				colorName: chosen.colorName ?? null,
			},
			candidates: valid.slice(0, 5),
			sets,
		});
	} catch (err) {
		console.error('Identify failed:', {
			error: err instanceof Error ? err.message : String(err),
			stack: err instanceof Error ? err.stack : undefined,
		});
		return NextResponse.json({ error: 'identify_failed' }, { status: 500 });
	}
}


