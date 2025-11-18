import { NextRequest, NextResponse } from 'next/server';
import { identifyWithBrickognize, extractCandidatePartNumbers } from '@/app/lib/brickognize';
import { getSetsForPart, resolvePartIdToRebrickable, type PartInSet, getPartColorsForPart, type PartAvailableColor, getSetSummary } from '@/app/lib/rebrickable';
import { blGetPart, blGetPartSupersets, blGetPartColors, blGetPartSubsets, type BLSupersetItem } from '@/app/lib/bricklink';

export async function POST(req: NextRequest) {
	try {
		const form = await req.formData();
		const file = form.get('image');
		if (!(file instanceof File)) {
			return NextResponse.json({ error: 'missing_image' });
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
				const payloadDiag = brickognizePayload as {
					listing_id?: unknown;
					items?: unknown[];
				};
				console.log('identify: brickognize payload', {
					listing_id: payloadDiag.listing_id,
					items_len: Array.isArray(payloadDiag.items)
						? payloadDiag.items.length
						: undefined,
				});
			} catch {}
		}
		const candidates = extractCandidatePartNumbers(brickognizePayload)
			// Prefer higher confidence first
			.sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));

		if (candidates.length === 0) {
			return NextResponse.json({ error: 'no_match' });
		}
		if (process.env.NODE_ENV !== 'production') {
			try {
				console.log('identify: candidates', candidates.slice(0, 5));
			} catch {}
		}

		// RB-first flow; BL supersets only as fallback. No component list.

		// Resolve each candidate to a Rebrickable part (name + image) using resolver
		const resolved = await Promise.all(
			candidates.map(async (c) => {
				// Prefer BrickLink-based resolution when BL id exists
				const blId = typeof c.bricklinkId === 'string' ? c.bricklinkId : undefined;
				let part = await resolvePartIdToRebrickable(
					c.partNum,
					blId ? { bricklinkId: blId } : undefined
				);
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
			bricklinkId?: string;
		}>;
		if (valid.length === 0) {
			// BL supersets fallback if we have a BL-backed candidate
			const blCand = candidates.find(c => typeof c.bricklinkId === 'string');
			if (blCand && blCand.bricklinkId) {
				const blId = blCand.bricklinkId as string;
				let setsFromBL: Array<{ setNumber: string; name: string; year: number; imageUrl: string | null; quantity: number }> = [];
				let partImage: string | null = blCand.imageUrl ?? null;
				let partName = '';
				try {
					const supersets: BLSupersetItem[] = await blGetPartSupersets(blId);
					if (Array.isArray(supersets) && supersets.length > 0) {
						setsFromBL = supersets.map(s => ({
							setNumber: s.setNumber,
							name: s.name,
							year: 0,
							imageUrl: s.imageUrl,
							quantity: s.quantity,
						}));
					} else {
						// Try supersets by color variants to improve match rate
						try {
							const colors = await blGetPartColors(blId);
							for (const c of (colors ?? []).slice(0, 10)) {
								if (typeof c?.color_id !== 'number') continue;
								const supByColor = await blGetPartSupersets(blId, c.color_id);
								for (const s of supByColor) {
									setsFromBL.push({
										setNumber: s.setNumber,
										name: s.name,
										year: 0,
										imageUrl: s.imageUrl,
										quantity: s.quantity,
									});
								}
								if (setsFromBL.length >= 50) break;
							}
							// If still empty, infer color ids from subsets entries
							if (setsFromBL.length === 0) {
								try {
									const subs = await blGetPartSubsets(blId);
									const uniq = new Map<number, string | undefined>();
									for (const s of subs ?? []) {
										if (typeof s?.color_id === 'number') {
											if (!uniq.has(s.color_id)) uniq.set(s.color_id, s.color_name);
										}
									}
									for (const [cid] of uniq) {
										if (process.env.NODE_ENV !== 'production') {
											try {
												console.log('identify: BL supersets by inferred subset color', {
													bl: blId,
													colorId: cid,
												});
											} catch {}
										}
										const supByColor = await blGetPartSupersets(blId, cid);
										for (const s of supByColor) {
											setsFromBL.push({
												setNumber: s.setNumber,
												name: s.name,
												year: 0,
												imageUrl: s.imageUrl,
												quantity: s.quantity,
											});
										}
										if (setsFromBL.length >= 50) break;
									}
								} catch {}
							}
							// Deduplicate by setNumber
							if (setsFromBL.length) {
								const seen = new Set<string>();
								setsFromBL = setsFromBL.filter(s => {
									if (seen.has(s.setNumber)) return false;
									seen.add(s.setNumber);
									return true;
								});
							}
						} catch {}
					}
				} catch (e) {
					if (process.env.NODE_ENV !== 'production') {
						try {
							console.log('identify: bl supersets fetch failed', {
								bl: blId,
								error: e instanceof Error ? e.message : String(e),
							});
						} catch {}
					}
				}
				// Try to enrich part meta from BL
				try {
					const meta = await blGetPart(blId);
					partName = meta?.name ?? partName;
					const metaWithImage = meta as { image_url?: unknown };
					partImage =
						typeof metaWithImage.image_url === 'string'
							? metaWithImage.image_url
							: partImage;
				} catch {}
				// Include available BL colors for UI dropdown
				let blAvailableColors: Array<{ id: number; name: string }> = [];
				try {
					const cols = await blGetPartColors(blId);
					blAvailableColors = (cols ?? []).map(c => ({
						id: c.color_id,
						name: c.color_name ?? String(c.color_id),
					}));
				} catch {}
				// If still no sets from BL paths, fall back to RB resolution for this BL id
				// Enrich BL-derived sets with RB images (and year) when possible
				try {
					const top = setsFromBL.slice(0, 20);
					const enriched = await Promise.all(
						top.map(async set => {
							try {
								const summary = await getSetSummary(set.setNumber);
								return {
									...set,
									year: summary.year ?? set.year,
									imageUrl: summary.imageUrl ?? set.imageUrl,
								};
							} catch {
								return set;
							}
						})
					);
					setsFromBL = [...enriched, ...setsFromBL.slice(top.length)];
				} catch {}
				if (process.env.NODE_ENV !== 'production') {
					try {
						console.log('identify: BL fallback (no RB candidates)', {
							blPart: blId,
							colorCount: blAvailableColors.length,
							setCount: setsFromBL.length,
						});
					} catch {}
				}
				return NextResponse.json({
					part: {
						partNum: blCand.partNum,
						name: partName,
						imageUrl: partImage,
						confidence: blCand.confidence ?? 0,
						colorId: null,
						colorName: null,
					},
					blPartId: blId,
					blAvailableColors,
					candidates: [],
					availableColors: [],
					selectedColorId: null,
					sets: setsFromBL,
				});
			}
			return NextResponse.json({ error: 'no_valid_candidate' });
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
		// No component list
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
		} else {
			if (process.env.NODE_ENV !== 'production') {
				try {
					console.log('identify: no RB sets found across candidates', {
						tried: valid.slice(0, 5).map(v => v.partNum),
					});
				} catch {}
			}
			// Fallback to BL supersets for the best BL-backed original candidate
			const blCand = candidates.find(c => typeof c.bricklinkId === 'string');
			if (blCand && blCand.bricklinkId) {
				const blId = blCand.bricklinkId as string;
				let setsFromBL: Array<{ setNumber: string; name: string; year: number; imageUrl: string | null; quantity: number }> = [];
				let partImage: string | null = chosen.imageUrl ?? null;
				let partName: string = chosen.name ?? '';
				try {
					const supersets: BLSupersetItem[] = await blGetPartSupersets(blId);
					if (Array.isArray(supersets) && supersets.length > 0) {
						setsFromBL = supersets.map(s => ({
							setNumber: s.setNumber,
							name: s.name,
							year: 0,
							imageUrl: s.imageUrl,
							quantity: s.quantity,
						}));
					} else {
						// Try supersets by color variants as a fallback
						try {
							const colors = await blGetPartColors(blId);
							for (const c of (colors ?? []).slice(0, 10)) {
								if (typeof c?.color_id !== 'number') continue;
								if (process.env.NODE_ENV !== 'production') {
									try {
										console.log('identify: BL supersets by color', {
											bl: blId,
											colorId: c.color_id,
											colorName: c.color_name ?? null,
										});
									} catch {}
								}
								const supByColor = await blGetPartSupersets(blId, c.color_id);
								for (const s of supByColor) {
									setsFromBL.push({
										setNumber: s.setNumber,
										name: s.name,
										year: 0,
										imageUrl: s.imageUrl,
										quantity: s.quantity,
									});
								}
								if (setsFromBL.length >= 50) break;
							}
							if (setsFromBL.length === 0) {
								try {
									const subs = await blGetPartSubsets(blId);
									const uniq = new Map<number, string | undefined>();
									for (const s of subs ?? []) {
										if (typeof s?.color_id === 'number') {
											if (!uniq.has(s.color_id)) uniq.set(s.color_id, s.color_name);
										}
									}
									for (const [cid] of uniq) {
										if (process.env.NODE_ENV !== 'production') {
											try {
												console.log('identify: BL supersets by inferred subset color', {
													bl: blId,
													colorId: cid,
												});
											} catch {}
										}
										const supByColor = await blGetPartSupersets(blId, cid);
										for (const s of supByColor) {
											setsFromBL.push({
												setNumber: s.setNumber,
												name: s.name,
												year: 0,
												imageUrl: s.imageUrl,
												quantity: s.quantity,
											});
										}
										if (setsFromBL.length >= 50) break;
									}
								} catch {}
							}
							// Deduplicate
							if (setsFromBL.length) {
								const seen = new Set<string>();
								setsFromBL = setsFromBL.filter(s => {
									if (seen.has(s.setNumber)) return false;
									seen.add(s.setNumber);
									return true;
								});
							}
						} catch {}
					}
				} catch {}
				try {
					const meta = await blGetPart(blId);
					partName = meta?.name ?? partName;
					const metaWithImage = meta as { image_url?: unknown };
					partImage =
						typeof metaWithImage.image_url === 'string'
							? metaWithImage.image_url
							: partImage;
				} catch {}
				let blAvailableColors: Array<{ id: number; name: string }> = [];
				try {
					const cols = await blGetPartColors(blId);
					blAvailableColors = (cols ?? []).map(c => ({
						id: c.color_id,
						name: c.color_name ?? String(c.color_id),
					}));
				} catch {}
				// Enrich BL-derived sets with RB images (and year) when possible
				try {
					const top = setsFromBL.slice(0, 20);
					const enriched = await Promise.all(
						top.map(async set => {
							try {
								const summary = await getSetSummary(set.setNumber);
								return {
									...set,
									year: summary.year ?? set.year,
									imageUrl: summary.imageUrl ?? set.imageUrl,
								};
							} catch {
								return set;
							}
						})
					);
					setsFromBL = [...enriched, ...setsFromBL.slice(top.length)];
				} catch {}
				if (process.env.NODE_ENV !== 'production') {
					try {
						console.log('identify: BL fallback (RB sets empty)', {
							blPart: blId,
							colorCount: blAvailableColors.length,
							setCount: setsFromBL.length,
						});
					} catch {}
				}
				return NextResponse.json({
					part: {
						partNum: chosen.partNum,
						name: partName,
						imageUrl: partImage,
						confidence: chosen.confidence,
						colorId: null,
						colorName: null,
					},
					blPartId: blId,
					blAvailableColors,
					candidates: valid.slice(0, 5),
					availableColors: [],
					selectedColorId: null,
					sets: setsFromBL,
				});
			}
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
			availableColors,
			selectedColorId: chosenColorId ?? null,
			sets,
		});
	} catch (err) {
		if (process.env.NODE_ENV !== 'production') {
			try {
				console.log('identify failed', {
					error: err instanceof Error ? err.message : String(err),
				});
			} catch {}
		}
		return NextResponse.json({ error: 'identify_failed' });
	}
}


