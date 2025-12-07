import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { errorResponse } from '@/app/lib/api/responses';
import { extractCandidatePartNumbers, identifyWithBrickognize } from '@/app/lib/brickognize';
import { getSetsForPartLocal, getSetSummaryLocal } from '@/app/lib/catalog';
import { EXTERNAL, IMAGE, RATE_LIMIT } from '@/app/lib/constants';
import { fetchBLSupersetsFallback } from '@/app/lib/identify/blFallback';
import { ExternalCallBudget, isBudgetError } from '@/app/lib/identify/types';
import {
    getPartColorsForPart,
    getSetsForPart,
    getSetSummary,
    resolvePartIdToRebrickable,
    type PartAvailableColor,
    type PartInSet,
} from '@/app/lib/rebrickable';
import { logger } from '@/lib/metrics';

const ALLOWED_IMAGE_TYPES = new Set<string>(IMAGE.ALLOWED_TYPES);

const identifyBodySchema = z.object({
	image: z
		.instanceof(File)
		.refine(file => file.size > 0 && file.size <= IMAGE.MAX_SIZE_BYTES, {
			message: 'image_must_be_between_1b_and_5mb',
		})
		.refine(file => !file.type || ALLOWED_IMAGE_TYPES.has(file.type.toLowerCase()), {
			message: `image_type_must_be_one_of_${IMAGE.ALLOWED_TYPES.join(',')}`,
		}),
	colorHint: z
		.union([z.string(), z.number()])
		.optional()
		.transform(val => {
			if (val === undefined) return undefined;
			const num = typeof val === 'string' ? Number(val) : val;
			return Number.isFinite(num) ? num : undefined;
		}),
});

type RateLimitEntry = { count: number; resetAt: number };
const identifyRateLimitStore = new Map<string, RateLimitEntry>();

function getClientIdentifier(req: NextRequest): string {
	const forwarded = req.headers.get('x-forwarded-for');
	if (forwarded) {
		const [first] = forwarded.split(',');
		if (first?.trim()) return first.trim();
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
		return { limited: false as const };
	}

	if (entry.count >= RATE_LIMIT.IDENTIFY_MAX) {
		return {
			limited: true as const,
			retryAfter: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
		};
	}

	entry.count += 1;
	return { limited: false as const };
}

type ResolvedCandidate = {
	partNum: string;
	name: string;
	imageUrl: string | null;
	confidence: number;
	colorId?: number;
	colorName?: string;
	bricklinkId?: string;
};

async function resolveCandidates(raw: ReturnType<typeof extractCandidatePartNumbers>) {
	const resolved = await Promise.all(
		raw.map(async candidate => {
			const blId = typeof candidate.bricklinkId === 'string' ? candidate.bricklinkId : undefined;
			const base = await resolvePartIdToRebrickable(
				candidate.partNum,
				blId ? { bricklinkId: blId } : undefined
			);
			const resolvedPart = base ?? (await resolvePartIdToRebrickable(candidate.partNum));
			if (!resolvedPart) return null;
			return {
				partNum: resolvedPart.partNum,
				name: resolvedPart.name,
				imageUrl: resolvedPart.imageUrl,
				confidence: candidate.confidence ?? 0,
				colorId: candidate.colorId,
				colorName: candidate.colorName,
				bricklinkId: blId,
			};
		})
	);
	return resolved.filter(Boolean) as ResolvedCandidate[];
}

async function fetchCandidateSets(
	partNum: string,
	preferredColorId?: number
): Promise<PartInSet[]> {
	try {
		const local = await getSetsForPartLocal(
			partNum,
			typeof preferredColorId === 'number' ? preferredColorId : null
		);
		if (local.length) return local;
		if (typeof preferredColorId === 'number') {
			const localAll = await getSetsForPartLocal(partNum, null);
			if (localAll.length) return localAll;
		}
	} catch (err) {
		logger.warn('identify.fetch_candidate_sets_local_failed', {
			partNum,
			preferredColorId,
			error: err instanceof Error ? err.message : String(err),
		});
	}

	if (typeof preferredColorId === 'number') {
		try {
			const remoteWithColor = await getSetsForPart(partNum, preferredColorId);
			if (remoteWithColor.length) return remoteWithColor;
		} catch (err) {
			if (isBudgetError(err)) throw err;
		}
	}

	try {
		return await getSetsForPart(partNum, undefined);
	} catch (err) {
		if (isBudgetError(err)) throw err;
		return [];
	}
}

async function selectCandidateWithSets(
	candidates: ResolvedCandidate[],
	colorHint: number | undefined
): Promise<{
	chosen: ResolvedCandidate;
	sets: PartInSet[];
	selectedColorId: number | undefined;
	availableColors: PartAvailableColor[];
}> {
	let chosen = candidates[0]!;

	let availableColors: PartAvailableColor[] = [];
	try {
		availableColors = await getPartColorsForPart(chosen.partNum);
	} catch (err) {
		if (isBudgetError(err)) throw err;
	}

	let selectedColorId =
		(availableColors.length === 1 ? availableColors[0]!.id : undefined) ??
		colorHint ??
		chosen.colorId;

	let sets = await fetchCandidateSets(chosen.partNum, selectedColorId);
	if (!sets.length && candidates.length > 1) {
		for (let i = 1; i < Math.min(candidates.length, 5); i++) {
			const candidate = candidates[i]!;
			const nextColor = colorHint ?? candidate.colorId ?? undefined;
			const candidateSets = await fetchCandidateSets(candidate.partNum, nextColor);
			if (candidateSets.length) {
				chosen = candidate;
				selectedColorId = nextColor;
				sets = candidateSets;
				break;
			}
		}
	}

	if (sets.length) {
		sets = [...sets].sort((a, b) => {
			if (b.quantity !== a.quantity) return b.quantity - a.quantity;
			return b.year - a.year;
		});
	}

	return { chosen, sets, selectedColorId, availableColors };
}

function needsEnrichment(sets: PartInSet[]): boolean {
	return sets.some(
		s =>
			!s.name ||
			s.name.trim() === '' ||
			s.year === 0 ||
			s.numParts == null ||
			s.themeName == null
	);
}

export async function POST(req: NextRequest) {
	try {
		const clientIdentifier = getClientIdentifier(req);
		const rateLimitResult = applyIdentifyRateLimit(clientIdentifier);
		if (rateLimitResult.limited) {
			const details = rateLimitResult.retryAfter
				? { headers: { 'Retry-After': String(rateLimitResult.retryAfter) } }
				: undefined;
			return errorResponse(
				'rate_limited',
				details ? { status: 429, details } : { status: 429 }
			);
		}

		const form = await req.formData();
		const parsed = identifyBodySchema.safeParse({
			image: form.get('image'),
			colorHint: form.get('colorHint'),
		});
		if (!parsed.success) {
			return errorResponse('validation_failed', {
				details: parsed.error.flatten(),
			});
		}
		const { image, colorHint } = parsed.data;

		const externalBudget = new ExternalCallBudget(EXTERNAL.EXTERNAL_CALL_BUDGET);

		const brickognizePayload = await identifyWithBrickognize(image as unknown as Blob);
		if (process.env.NODE_ENV !== 'production') {
			const payloadDiag = brickognizePayload as {
				listing_id?: unknown;
				items?: unknown[];
			};
			logger.debug('identify.brickognize_payload', {
				listing_id: payloadDiag.listing_id,
				items_len: Array.isArray(payloadDiag.items) ? payloadDiag.items.length : undefined,
			});
		}

		const candidates = extractCandidatePartNumbers(brickognizePayload).sort(
			(a, b) => (b.confidence ?? 0) - (a.confidence ?? 0)
		);
		if (candidates.length === 0) {
			return errorResponse('no_match');
		}

		const resolved = await resolveCandidates(candidates);
		if (!resolved.length) {
			const blCand = candidates.find(c => typeof c.bricklinkId === 'string');
			if (blCand?.bricklinkId) {
				const fallback = await fetchBLSupersetsFallback(blCand.bricklinkId, externalBudget, {
					initialImage: typeof blCand.imageUrl === 'string' ? blCand.imageUrl : null,
				});
				if (fallback.sets.length) {
					return NextResponse.json({
						part: {
							partNum: blCand.partNum,
							name: fallback.partName,
							imageUrl: fallback.partImage,
							confidence: blCand.confidence ?? 0,
							colorId: null,
							colorName: null,
						},
						blPartId: blCand.bricklinkId,
						blAvailableColors: fallback.blAvailableColors,
						candidates: [],
						availableColors: [],
						selectedColorId: null,
						sets: fallback.sets,
					});
				}
			}
			return errorResponse('no_valid_candidate');
		}

		const { chosen, sets, selectedColorId, availableColors } = await selectCandidateWithSets(
			resolved,
			colorHint
		);

		if (!sets.length) {
			const blCand = resolved.find(c => c.bricklinkId);
			if (blCand?.bricklinkId) {
				const fallback = await fetchBLSupersetsFallback(blCand.bricklinkId, externalBudget, {
					initialImage: chosen.imageUrl,
					initialName: chosen.name,
				});
				if (fallback.sets.length) {
					return NextResponse.json({
						part: {
							partNum: chosen.partNum,
							name: fallback.partName,
							imageUrl: fallback.partImage,
							confidence: chosen.confidence,
							colorId: null,
							colorName: null,
						},
						blPartId: blCand.bricklinkId,
						blAvailableColors: fallback.blAvailableColors,
						candidates: resolved.slice(0, 5),
						availableColors: [],
						selectedColorId: null,
						sets: fallback.sets,
					});
				}
			}
			return errorResponse('no_valid_candidate');
		}

		let finalSets = sets;
		if (needsEnrichment(sets)) {
			const summaries = await Promise.all(
				sets.slice(0, EXTERNAL.ENRICH_LIMIT).map(async set => {
					try {
						const summary =
							(await getSetSummaryLocal(set.setNumber)) ??
							(await getSetSummary(set.setNumber));
						return { setNumber: set.setNumber.toLowerCase(), summary };
					} catch (err) {
						logger.warn('identify.enrichment_failed', {
							set: set.setNumber,
							error: err instanceof Error ? err.message : String(err),
						});
						return null;
					}
				})
			);

			const summaryBySet = new Map<string, Awaited<ReturnType<typeof getSetSummary>>>();
			for (const entry of summaries) {
				if (entry?.summary) summaryBySet.set(entry.setNumber, entry.summary);
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
				colorId: selectedColorId ?? null,
				colorName: chosen.colorName ?? null,
			},
			candidates: resolved.slice(0, 5),
			availableColors,
			selectedColorId: selectedColorId ?? null,
			sets: finalSets,
		});
	} catch (err) {
		if (err instanceof Error && err.message === 'external_budget_exhausted') {
			return errorResponse('budget_exceeded', { status: 429 });
		}
		logger.error('identify.failed', {
			error: err instanceof Error ? err.message : String(err),
		});
		return errorResponse('identify_failed');
	}
}


