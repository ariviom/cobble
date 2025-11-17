import { NextRequest, NextResponse } from 'next/server';
import { identifyWithBrickognize, extractCandidatePartNumbers } from '@/app/lib/brickognize';
import { getSetsForPart, resolvePartIdToRebrickable, type PartInSet, getPartColorsForPart, type PartAvailableColor } from '@/app/lib/rebrickable';
import { blGetPart, blGetPartSubsets, type BLSubsetItem } from '@/app/lib/bricklink';

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
		if (process.env.NODE_ENV !== 'production') {
			try {
				console.log('identify: candidates', candidates.slice(0, 5));
			} catch {}
		}

		// EARLY: If top BrickLink candidate is an assembly, return its components immediately for user selection.
		try {
			const blTop = candidates.find(c => (c as any).bricklinkId) as any;
			if (blTop && blTop.bricklinkId) {
				const subsets: BLSubsetItem[] = await blGetPartSubsets(blTop.bricklinkId);
				if (Array.isArray(subsets) && subsets.length > 0) {
					const assemblyComponents = await Promise.all(
						subsets.map(async (s) => {
							let rbPartNum: string | undefined;
							try {
								const childResolved = await resolvePartIdToRebrickable(s.item.no, { bricklinkId: s.item.no });
								rbPartNum = childResolved?.partNum ?? undefined;
							} catch {}
							return {
								blPartNo: s.item.no,
								name: s.item.name,
								imageUrl: s.item.image_url,
								quantity: s.quantity,
								blColorId: s.color_id,
								blColorName: s.color_name,
								rbPartNum,
							};
						})
					);
					if (process.env.NODE_ENV !== 'production') {
						try {
							console.log('identify: early assembly detected', { bl: blTop.bricklinkId, count: assemblyComponents.length });
						} catch {}
					}
					return NextResponse.json({
						part: {
							partNum: blTop.partNum,
							name: blTop.name ?? '',
							imageUrl: blTop.imageUrl ?? null,
							confidence: blTop.confidence ?? 0,
							colorId: null,
							colorName: null,
						},
						candidates: [],
						assembly: assemblyComponents,
						availableColors: [],
						selectedColorId: null,
						sets: [],
					});
				}
			}
		} catch (e) {
			if (process.env.NODE_ENV !== 'production') {
				try {
					console.log('identify: assembly check failed', { error: e instanceof Error ? e.message : String(e) });
				} catch {}
			}
		}

		// Resolve each candidate to a Rebrickable part (name + image) using resolver
		const resolved = await Promise.all(
			candidates.map(async (c) => {
				// Prefer BrickLink-based resolution when BL id exists
				const blId: string | undefined = (c as any).bricklinkId;
				let part = await resolvePartIdToRebrickable(c.partNum, { bricklinkId: blId });
				if (!part) {
					// fallback to text-only resolution last
					part = await resolvePartIdToRebrickable(c.partNum);
				}
				if (!part) return null;
				return {
					partNum: part.partNum,
					name: part.name,
					imageUrl: part.imageUrl,
					confidence: c.confidence ?? 0,
					colorId: c.colorId,
					colorName: c.colorName,
					bricklinkId: blId,
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
			// Fallback: if we have a BrickLink candidate, try to return assembly components for UI
			const blCand = candidates.find(c => (c as any).bricklinkId) as any;
			if (blCand && blCand.bricklinkId) {
				let assemblyComponents: Array<{
					blPartNo: string;
					name?: string;
					imageUrl?: string | null;
					quantity: number;
					blColorId?: number;
					blColorName?: string;
					rbPartNum?: string;
				}> = [];
				try {
					const subsets: BLSubsetItem[] = await blGetPartSubsets(blCand.bricklinkId);
					if (Array.isArray(subsets) && subsets.length > 0) {
						assemblyComponents = await Promise.all(
							subsets.map(async (s) => {
								let rbPartNum: string | undefined;
								try {
									const childResolved = await resolvePartIdToRebrickable(s.item.no, { bricklinkId: s.item.no });
									rbPartNum = childResolved?.partNum ?? undefined;
								} catch {}
								return {
									blPartNo: s.item.no,
									name: s.item.name,
									imageUrl: s.item.image_url,
									quantity: s.quantity,
									blColorId: s.color_id,
									blColorName: s.color_name,
									rbPartNum,
								};
							})
						);
					}
				} catch {
					// ignore
				}
				if (assemblyComponents.length > 0) {
					if (process.env.NODE_ENV !== 'production') {
						try {
							console.log('identify: assembly fallback used', {
								blPart: blCand.bricklinkId,
								components: assemblyComponents.length,
							});
						} catch {}
					}
					return NextResponse.json({
						part: {
							partNum: blCand.partNum,
							name: blCand.name ?? '',
							imageUrl: blCand.imageUrl ?? null,
							confidence: blCand.confidence ?? 0,
							colorId: null,
							colorName: null,
						},
						candidates: [],
						assembly: assemblyComponents,
						availableColors: [],
						selectedColorId: null,
						sets: [],
					});
				}
			}
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
		// If chosen has a BrickLink ID, check for assembly components
		let assemblyComponents: Array<{
			blPartNo: string;
			name?: string;
			imageUrl?: string | null;
			quantity: number;
			blColorId?: number;
			blColorName?: string;
			rbPartNum?: string;
		}> = [];
		if ((chosen as any).bricklinkId) {
			try {
				const subsets: BLSubsetItem[] = await blGetPartSubsets((chosen as any).bricklinkId);
				if (Array.isArray(subsets) && subsets.length > 0) {
					assemblyComponents = await Promise.all(
						subsets.map(async (s) => {
							// Resolve each child to RB part if possible using its BL part no
							let rbPartNum: string | undefined;
							try {
								const childResolved = await resolvePartIdToRebrickable(s.item.no, { bricklinkId: s.item.no });
								rbPartNum = childResolved?.partNum ?? undefined;
							} catch {}
							return {
								blPartNo: s.item.no,
								name: s.item.name,
								imageUrl: s.item.image_url,
								quantity: s.quantity,
								blColorId: s.color_id,
								blColorName: s.color_name,
								rbPartNum,
							};
						})
					);
				}
			} catch {
				// ignore subsets failures
			}
		}
		// Determine available colors for the chosen part to auto-select if only one
		let availableColors: PartAvailableColor[] = [];
		try {
			availableColors = await getPartColorsForPart(chosen.partNum);
		} catch {
			availableColors = [];
		}
		// Prefer the sole available RB color (if any), then explicit hint, then the candidate-provided color
		let chosenColorId = (availableColors.length === 1 ? availableColors[0]!.id : undefined) ?? colorHint ?? chosen.colorId;
		let sets: PartInSet[] = await fetchCandidateSets(chosen.partNum, chosenColorId);
		if (process.env.NODE_ENV !== 'production') {
			try {
				console.log('identify: chosen', { partNum: chosen.partNum, colors: availableColors.length, chosenColorId, sets: sets.length });
			} catch {}
		}
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
			assembly: assemblyComponents,
			availableColors,
			selectedColorId: chosenColorId ?? null,
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


