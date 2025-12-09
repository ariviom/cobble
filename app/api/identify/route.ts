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

export const POST = withCsrfProtection(async (req: NextRequest) => {
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


