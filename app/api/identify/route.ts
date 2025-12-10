import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { errorResponse } from '@/app/lib/api/responses';
import { extractCandidatePartNumbers, identifyWithBrickognize } from '@/app/lib/brickognize';
import { EXTERNAL, IMAGE, RATE_LIMIT } from '@/app/lib/constants';
import { ExternalCallBudget } from '@/app/lib/identify/types';
import { withCsrfProtection } from '@/app/lib/middleware/csrf';
import {
	resolveCandidates,
	resolveIdentifyResult,
} from '@/app/lib/services/identify';
import { logger } from '@/lib/metrics';
import { consumeRateLimit, getClientIp } from '@/lib/rateLimit';

const ALLOWED_IMAGE_TYPES = new Set<string>(IMAGE.ALLOWED_TYPES);

function isFileLike(value: unknown): value is Blob {
	if (!value || typeof value !== 'object') return false;
	return value instanceof Blob || value instanceof File;
}

const identifyBodySchema = z.object({
	image: z
		.custom<Blob>(isFileLike, { message: 'image_file_required' })
		.refine(file => typeof file.size === 'number' && file.size > 0 && file.size <= IMAGE.MAX_SIZE_BYTES, {
			message: 'image_must_be_between_1b_and_5mb',
		})
		.refine(file => {
			const type = (file as { type?: string }).type;
			return !type || ALLOWED_IMAGE_TYPES.has(type.toLowerCase());
		}, {
			message: `image_type_must_be_one_of_${IMAGE.ALLOWED_TYPES.join(',')}`,
		}),
	colorHint: z.preprocess(
		val => {
			if (val === null || val === undefined || val === '') return undefined;
			if (typeof val === 'number') return val;
			if (typeof val === 'string') {
				const num = Number(val);
				return Number.isFinite(num) ? num : undefined;
			}
			return undefined;
		},
		z.number().optional()
	),
});

export const POST = withCsrfProtection(async (req: NextRequest) => {
	try {
		const clientIp = (await getClientIp(req)) ?? 'unknown';
		const ipLimit = await consumeRateLimit(`identify:ip:${clientIp}`, {
			windowMs: RATE_LIMIT.WINDOW_MS,
			maxHits: RATE_LIMIT.IDENTIFY_MAX,
		});
		if (!ipLimit.allowed) {
			const retryAfterSeconds = ipLimit.retryAfterSeconds;
			return errorResponse('rate_limited', {
				status: 429,
				headers: { 'Retry-After': String(retryAfterSeconds) },
				details: { retryAfterSeconds },
			});
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
		logger.debug('identify.candidates_extracted', {
			count: candidates.length,
			sample: candidates.slice(0, 3),
		});
		if (candidates.length === 0) {
			return errorResponse('no_match');
		}

		const resolved = await resolveCandidates(candidates);
		logger.debug('identify.candidates_resolved', {
			count: resolved.length,
			sample: resolved.slice(0, 3).map(c => ({
				partNum: c.partNum,
				bricklinkId: c.bricklinkId,
				confidence: c.confidence,
				colorId: c.colorId,
			})),
		});
		if (!resolved.length) {
			return errorResponse('no_valid_candidate');
		}

		const result = await resolveIdentifyResult({
			candidates: resolved,
			...(colorHint !== undefined ? { colorHint } : {}),
			budget: externalBudget,
		});

		if (result.status === 'no_match') {
			return errorResponse('no_match');
		}
		if (result.status === 'no_valid_candidate') {
			return errorResponse('no_valid_candidate');
		}
		if (result.status === 'fallback') {
			return NextResponse.json({
				part: result.payload.part,
				blPartId: result.payload.blPartId,
				blAvailableColors: result.payload.blAvailableColors,
				source: result.payload.source,
				candidates: result.payload.candidates,
				availableColors: result.payload.availableColors,
				selectedColorId: result.payload.selectedColorId,
				sets: result.payload.sets,
			});
		}

		return NextResponse.json(result.payload);
	} catch (err) {
		if (err instanceof Error && err.message === 'external_budget_exhausted') {
			return errorResponse('budget_exceeded', { status: 429 });
		}
		logger.error('identify.failed', {
			error: err instanceof Error ? err.message : String(err),
		});
		return errorResponse('identify_failed');
	}
});


