import { errorResponse } from '@/app/lib/api/responses';
import {
	blGetPart,
	blGetPartColors,
	blGetPartSubsets,
	blGetPartSupersets,
	type BLColorEntry,
	type BLSupersetItem,
} from '@/app/lib/bricklink';
import { extractCandidatePartNumbers, identifyWithBrickognize } from '@/app/lib/brickognize';
import {
	getSetsForPartLocal,
	getSetSummaryLocal
} from '@/app/lib/catalog';
import { EXTERNAL, IMAGE, RATE_LIMIT } from '@/app/lib/constants';
import {
	getColors,
	getPartColorsForPart,
	getSetsForPart,
	getSetSummary,
	resolvePartIdToRebrickable,
	type PartAvailableColor,
	type PartInSet,
} from '@/app/lib/rebrickable';
import { logger } from '@/lib/metrics';
import { NextRequest, NextResponse } from 'next/server';

const ALLOWED_IMAGE_TYPES = new Set<string>(IMAGE.ALLOWED_TYPES);

type RateLimitEntry = { count: number; resetAt: number };
const identifyRateLimitStore = new Map<string, RateLimitEntry>();

class ExternalCallBudget {
	constructor(private remaining: number) {}

	tryConsume(cost = 1) {
		if (this.remaining < cost) {
			return false;
		}
		this.remaining -= cost;
		return true;
	}
}

async function withBudget<T>(
	budget: ExternalCallBudget,
	cb: () => Promise<T>
): Promise<T> {
	if (!budget.tryConsume()) {
		throw new Error('external_budget_exhausted');
	}
	return cb();
}

function isBudgetError(err: unknown): err is Error {
	return err instanceof Error && err.message === 'external_budget_exhausted';
}

function getClientIdentifier(req: NextRequest): string {
	const forwarded = req.headers.get('x-forwarded-for');
	if (forwarded) {
		const [first] = forwarded.split(',');
		if (first?.trim()) {
			return first.trim();
		}
	}
	const realIp = req.headers.get('x-real-ip');
	if (realIp) return realIp;
	// @ts-expect-error: NextRequest may provide ip in runtime environments
	return req.ip ?? 'anonymous';
}

function applyIdentifyRateLimit(identifier: string) {
	const now = Date.now();
	const entry = identifyRateLimitStore.get(identifier);
	if (!entry || entry.resetAt < now) {
		identifyRateLimitStore.set(identifier, {
			count: 1,
			resetAt: now + RATE_LIMIT.WINDOW_MS,
		});
		return { limited: false };
	}

	if (entry.count >= RATE_LIMIT.IDENTIFY_MAX) {
		return {
			limited: true,
			retryAfter: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
		};
	}

	entry.count += 1;
	return { limited: false };
}

function validateImageFile(file: File): { error: string; status?: number } | null {
	if (file.size <= 0) {
		return { error: 'empty_image', status: 400 };
	}
	if (file.size > IMAGE.MAX_SIZE_BYTES) {
		return { error: 'image_too_large', status: 413 };
	}
	const mime = file.type?.toLowerCase();
	if (mime && !ALLOWED_IMAGE_TYPES.has(mime)) {
		return { error: 'unsupported_image_type', status: 415 };
	}
	return null;
}


async function buildBlAvailableColors(
	blPartId: string,
	budget: ExternalCallBudget
): Promise<Array<{ id: number; name: string }>> {
	let cols: BLColorEntry[] = [];
	try {
		cols = await withBudget(budget, () => blGetPartColors(blPartId));
	} catch (err) {
		if (isBudgetError(err)) throw err;
		// ignore BL colors failures; fall back to ids only
	}
	if (!cols.length) return [];

	// Map BL color ids to human-readable names via Rebrickable colors (cached in getColors()).
	const nameByBlId = new Map<number, string>();
	try {
		const rbColors = await getColors();
		for (const c of rbColors) {
			const bl = (c.external_ids as { BrickLink?: { ext_ids?: number[] } } | undefined)
				?.BrickLink;
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
		// ignore RB color mapping failures; we'll fall back to ids
	}

	return cols.map(c => ({
		id: c.color_id,
		name: nameByBlId.get(c.color_id) ?? String(c.color_id),
	}));
}

export async function POST(req: NextRequest) {
	try {
		const clientIdentifier = getClientIdentifier(req);
		const rateLimitResult = applyIdentifyRateLimit(clientIdentifier);
		if (rateLimitResult.limited) {
			const init: ResponseInit = { status: 429 };
			if (rateLimitResult.retryAfter) {
				init.headers = {
					'Retry-After': String(rateLimitResult.retryAfter),
				};
			}
			const headersRecord =
				init.headers != null
					? Object.fromEntries(new Headers(init.headers))
					: undefined;
			if (headersRecord) {
				return errorResponse('rate_limited', {
					status: init.status ?? 429,
					details: { headers: headersRecord },
				});
			}
			return errorResponse('rate_limited', { status: init.status ?? 429 });
		}

		const externalBudget = new ExternalCallBudget(EXTERNAL.EXTERNAL_CALL_BUDGET);
		const form = await req.formData();
		const file = form.get('image');
		if (!(file instanceof File)) {
			return errorResponse('validation_failed', { message: 'missing_image' });
		}
		const imageValidation = validateImageFile(file);
		if (imageValidation) {
			return errorResponse('validation_failed', {
				message: imageValidation.error,
				status: imageValidation.status ?? 400,
			});
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
				logger.debug('identify.brickognize_payload', {
					listing_id: payloadDiag.listing_id,
					items_len: Array.isArray(payloadDiag.items)
						? payloadDiag.items.length
						: undefined,
				});
			} catch (err) {
				if (isBudgetError(err)) throw err;
			}
		}
		const candidates = extractCandidatePartNumbers(brickognizePayload)
			// Prefer higher confidence first
			.sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));

		if (candidates.length === 0) {
			return errorResponse('no_match');
		}
		if (process.env.NODE_ENV !== 'production') {
			try {
				logger.debug('identify.candidates', { candidates: candidates.slice(0, 5) });
			} catch (err) {
				if (isBudgetError(err)) throw err;
			}
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
				let setsFromBL: Array<{
					setNumber: string;
					name: string;
					year: number;
					imageUrl: string | null;
					quantity: number;
					numParts?: number | null;
					themeId?: number | null;
					themeName?: string | null;
				}> = [];
				let partImage: string | null = blCand.imageUrl ?? null;
				let partName = '';
				try {
					const supersets: BLSupersetItem[] = await withBudget(
						externalBudget,
						() => blGetPartSupersets(blId)
					);
					if (Array.isArray(supersets) && supersets.length > 0) {
						setsFromBL = supersets.map(s => ({
							setNumber: s.setNumber,
							name: s.name,
							year: 0,
							imageUrl: s.imageUrl,
							quantity: s.quantity,
							numParts: null,
							themeId: null,
							themeName: null,
						}));
					} else {
						// Try supersets by color variants to improve match rate
						try {
							const colors = await withBudget(externalBudget, () =>
								blGetPartColors(blId)
							);
							for (const c of (colors ?? []).slice(0, EXTERNAL.BL_COLOR_VARIANT_LIMIT)) {
								if (typeof c?.color_id !== 'number') continue;
								const supByColor = await withBudget(externalBudget, () =>
									blGetPartSupersets(blId, c.color_id)
								);
								for (const s of supByColor) {
									setsFromBL.push({
										setNumber: s.setNumber,
										name: s.name,
										year: 0,
										imageUrl: s.imageUrl,
										quantity: s.quantity,
										numParts: null,
										themeId: null,
										themeName: null,
									});
								}
								if (setsFromBL.length >= EXTERNAL.BL_SUPERSET_TOTAL_LIMIT) break;
							}
							// If still empty, infer color ids from subsets entries
							if (setsFromBL.length === 0) {
								try {
									const subs = await withBudget(externalBudget, () =>
										blGetPartSubsets(blId)
									);
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
											} catch (err) {
												if (isBudgetError(err)) throw err;
											}
										}
										const supByColor = await withBudget(externalBudget, () =>
											blGetPartSupersets(blId, cid)
										);
										for (const s of supByColor) {
											setsFromBL.push({
												setNumber: s.setNumber,
												name: s.name,
												year: 0,
												imageUrl: s.imageUrl,
												quantity: s.quantity,
												numParts: null,
												themeId: null,
												themeName: null,
											});
										}
										if (setsFromBL.length >= EXTERNAL.BL_SUPERSET_TOTAL_LIMIT) break;
									}
								} catch (err) {
									if (isBudgetError(err)) throw err;
								}
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
						} catch (err) {
							if (isBudgetError(err)) throw err;
						}
					}
				} catch (e) {
					if (isBudgetError(e)) throw e;
					if (process.env.NODE_ENV !== 'production') {
						try {
							console.log('identify: bl supersets fetch failed', {
								bl: blId,
								error: e instanceof Error ? e.message : String(e),
							});
						} catch (err) {
							if (isBudgetError(err)) throw err;
						}
					}
				}
				// Try to enrich part meta from BL
				try {
					const meta = await withBudget(externalBudget, () => blGetPart(blId));
					partName = meta?.name ?? partName;
					const metaWithImage = meta as { image_url?: unknown };
					partImage =
						typeof metaWithImage.image_url === 'string'
							? metaWithImage.image_url
							: partImage;
				} catch (err) {
					if (isBudgetError(err)) throw err;
				}
				// Include available BL colors for UI dropdown
				let blAvailableColors: Array<{ id: number; name: string }> = [];
				try {
					blAvailableColors = await buildBlAvailableColors(blId, externalBudget);
				} catch (err) {
					if (isBudgetError(err)) throw err;
				}
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
					setsFromBL = [...enriched, ...setsFromBL.slice(top.length)];
				} catch (err) {
					if (isBudgetError(err)) throw err;
				}
				if (process.env.NODE_ENV !== 'production') {
					try {
						console.log('identify: BL fallback (no RB candidates)', {
							blPart: blId,
							colorCount: blAvailableColors.length,
							setCount: setsFromBL.length,
						});
					} catch (err) {
						if (isBudgetError(err)) throw err;
					}
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
			// Catalog-first (Supabase) lookup
			try {
				const local = await getSetsForPartLocal(
					partNum,
					typeof preferredColorId === 'number' ? preferredColorId : null
				);
				if (local.length) return local;
				// If color-specific lookup is empty, try without color to broaden results.
				if (typeof preferredColorId === 'number') {
					const localAll = await getSetsForPartLocal(partNum, null);
					if (localAll.length) return localAll;
				}
			} catch (err) {
				console.error('identify fetchCandidateSets local lookup failed', {
					partNum,
					preferredColorId,
					error: err instanceof Error ? err.message : String(err),
				});
			}
			// Try with preferred color if provided, then without color
			if (typeof preferredColorId === 'number') {
				try {
					const s = await getSetsForPart(partNum, preferredColorId);
					if (s.length) return s;
				} catch (err) {
					if (isBudgetError(err)) throw err;
					// ignore; fall through
				}
			}
			try {
				return await getSetsForPart(partNum, undefined);
			} catch (err) {
				if (isBudgetError(err)) throw err;
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
		} catch (err) {
			if (isBudgetError(err)) throw err;
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
					} catch (err) {
						if (isBudgetError(err)) throw err;
					}
				}
			// Fallback to BL supersets for the best BL-backed original candidate
			const blCand = candidates.find(c => typeof c.bricklinkId === 'string');
			if (blCand && blCand.bricklinkId) {
				const blId = blCand.bricklinkId as string;
				let setsFromBL: Array<{
					setNumber: string;
					name: string;
					year: number;
					imageUrl: string | null;
					quantity: number;
					numParts?: number | null;
					themeId?: number | null;
					themeName?: string | null;
				}> = [];
				let partImage: string | null = chosen.imageUrl ?? null;
				let partName: string = chosen.name ?? '';
				try {
					const supersets: BLSupersetItem[] = await withBudget(
						externalBudget,
						() => blGetPartSupersets(blId)
					);
					if (Array.isArray(supersets) && supersets.length > 0) {
						setsFromBL = supersets.map(s => ({
							setNumber: s.setNumber,
							name: s.name,
							year: 0,
							imageUrl: s.imageUrl,
							quantity: s.quantity,
							numParts: null,
							themeId: null,
							themeName: null,
						}));
					} else {
						// Try supersets by color variants as a fallback
						try {
							const colors = await withBudget(externalBudget, () =>
								blGetPartColors(blId)
							);
							for (const c of (colors ?? []).slice(0, EXTERNAL.BL_COLOR_VARIANT_LIMIT)) {
								if (typeof c?.color_id !== 'number') continue;
								if (process.env.NODE_ENV !== 'production') {
									try {
										console.log('identify: BL supersets by color', {
											bl: blId,
											colorId: c.color_id,
											colorName: c.color_name ?? null,
										});
									} catch (err) {
										if (isBudgetError(err)) throw err;
									}
								}
								const supByColor = await withBudget(externalBudget, () =>
									blGetPartSupersets(blId, c.color_id)
								);
								for (const s of supByColor) {
									setsFromBL.push({
										setNumber: s.setNumber,
										name: s.name,
										year: 0,
										imageUrl: s.imageUrl,
										quantity: s.quantity,
										numParts: null,
										themeId: null,
										themeName: null,
									});
								}
								if (setsFromBL.length >= EXTERNAL.BL_SUPERSET_TOTAL_LIMIT) break;
							}
							if (setsFromBL.length === 0) {
								try {
									const subs = await withBudget(externalBudget, () =>
										blGetPartSubsets(blId)
									);
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
											} catch (err) {
												if (isBudgetError(err)) throw err;
											}
										}
										const supByColor = await withBudget(externalBudget, () =>
											blGetPartSupersets(blId, cid)
										);
										for (const s of supByColor) {
											setsFromBL.push({
												setNumber: s.setNumber,
												name: s.name,
												year: 0,
												imageUrl: s.imageUrl,
												quantity: s.quantity,
												numParts: null,
												themeId: null,
												themeName: null,
											});
										}
										if (setsFromBL.length >= EXTERNAL.BL_SUPERSET_TOTAL_LIMIT) break;
									}
								} catch (err) {
									if (isBudgetError(err)) throw err;
								}
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
						} catch (err) {
							if (isBudgetError(err)) throw err;
						}
					}
				} catch (err) {
					if (isBudgetError(err)) throw err;
				}
				try {
					const meta = await withBudget(externalBudget, () => blGetPart(blId));
					partName = meta?.name ?? partName;
					const metaWithImage = meta as { image_url?: unknown };
					partImage =
						typeof metaWithImage.image_url === 'string'
							? metaWithImage.image_url
							: partImage;
				} catch (err) {
					if (isBudgetError(err)) throw err;
				}
				let blAvailableColors: Array<{ id: number; name: string }> = [];
				try {
					blAvailableColors = await buildBlAvailableColors(blId, externalBudget);
				} catch (err) {
					if (isBudgetError(err)) throw err;
				}
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
					setsFromBL = [...enriched, ...setsFromBL.slice(top.length)];
				} catch (err) {
					if (isBudgetError(err)) throw err;
				}
				if (process.env.NODE_ENV !== 'production') {
					try {
						console.log('identify: BL fallback (RB sets empty)', {
							blPart: blId,
							colorCount: blAvailableColors.length,
							setCount: setsFromBL.length,
						});
					} catch (err) {
						if (isBudgetError(err)) throw err;
					}
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

		const needsEnrichment = sets.some(
			s =>
				!s.name ||
				s.name.trim() === '' ||
				s.year === 0 ||
				s.numParts == null ||
				s.themeName == null
		);

		let finalSets = sets;

		if (needsEnrichment) {
			// Enrich with set summary metadata for parity with set search cards.
			const ENRICH_LIMIT = 30;
			const enrichTargets = sets.slice(0, ENRICH_LIMIT);
		const summaries = await Promise.all(
			enrichTargets.map(async set => {
				try {
					const summary =
						(await getSetSummaryLocal(set.setNumber)) ??
						(await getSetSummary(set.setNumber));
					return { setNumber: set.setNumber.toLowerCase(), summary };
				} catch (err) {
					if (process.env.NODE_ENV !== 'production') {
						console.log('identify enrichment failed', {
							set: set.setNumber,
							error: err instanceof Error ? err.message : String(err),
						});
					}
					return null;
				}
			})
		);
			const summaryBySet = new Map<string, Awaited<ReturnType<typeof getSetSummary>>>();
			for (const item of summaries) {
				if (item?.summary) summaryBySet.set(item.setNumber, item.summary);
			}
			finalSets = sets.map(s => {
				const summary = summaryBySet.get(s.setNumber.toLowerCase());
				return {
					...s,
					name: summary?.name ?? s.name ?? s.setNumber,
					year: summary?.year ?? s.year,
					imageUrl: summary?.imageUrl ?? s.imageUrl,
					numParts: summary?.numParts ?? s.numParts ?? null,
					themeId: summary?.themeId ?? s.themeId ?? null,
					themeName: summary?.themeName ?? s.themeName ?? null,
				};
			});
		}

		// Final safety: ensure name is always present (fallback to setNumber).
		finalSets = finalSets.map(s => ({
			...s,
			name: s.name && s.name.trim() ? s.name : s.setNumber,
		}));

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
			sets: finalSets,
		});
	} catch (err) {
		if (err instanceof Error && err.message === 'external_budget_exhausted') {
			return errorResponse('budget_exceeded', { status: 429 });
		}
		if (process.env.NODE_ENV !== 'production') {
			try {
				logger.error('identify.failed', {
					error: err instanceof Error ? err.message : String(err),
				});
			} catch (logErr) {
				if (isBudgetError(logErr)) throw logErr;
			}
		}
		return errorResponse('identify_failed');
	}
}


