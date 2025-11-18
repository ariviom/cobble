import 'server-only';

export type BrickognizeCandidate = {
	partNum?: string;
	rebrickable_part_num?: string;
	bricklink_part_num?: string | number;
	external_sites?: Array<{ name?: string; url?: string }>;
	confidence?: number;
	colorId?: number;
	color_id?: number;
	colorName?: string;
	color_name?: string;
	imageUrl?: string;
	image_url?: string;
	// Allow arbitrary fields for forward compatibility
	[key: string]: unknown;
};

export type BrickognizeResponse = {
	candidates?: BrickognizeCandidate[];
	// Some APIs might return a single best match field
	partNum?: string;
	rebrickable_part_num?: string;
	bricklink_part_num?: string | number;
	confidence?: number;
	[key: string]: unknown;
};

function buildEndpointCandidates(): string[] {
	// Allow override via env; try both with/without trailing slash
	const configured = process.env.BRICKOGNIZE_ENDPOINT;
	const defaults = ['https://api.brickognize.com/predict/parts/', 'https://api.brickognize.com/predict/'];
	if (!configured) return defaults;
	const trimmed = configured.trim();
	// If explicitly configured, try that first, then add variant with/without slash
	const variants = new Set<string>();
	variants.add(trimmed);
	if (trimmed.endsWith('/')) variants.add(trimmed.slice(0, -1));
	else variants.add(`${trimmed}/`);
	// Fall back to defaults after configured variants
	for (const d of defaults) variants.add(d);
	return Array.from(variants);
}

export async function identifyWithBrickognize(image: Blob): Promise<BrickognizeResponse> {
	const endpoints = buildEndpointCandidates();
	let lastStatus: number | undefined;
	let lastBody: string | undefined;
	for (const endpoint of endpoints) {
		const form = new FormData();
		// Per docs: legacy predict expects ONLY "query_image"
		form.append('query_image', image, 'image.jpg');
		try {
			const res = await fetch(endpoint, {
				method: 'POST',
				body: form,
				cache: 'no-store',
				headers: {
					accept: 'application/json',
				},
			});
			if (!res.ok) {
				lastStatus = res.status;
				// Capture response body for diagnostics
				try {
					lastBody = await res.text();
				} catch {
					// ignore
				}
				if (process.env.NODE_ENV !== 'production') {
					const preview = (lastBody ?? '').slice(0, 1000);
					console.log('Brickognize NON-200', { endpoint, status: res.status, body: preview });
				}
				// If 404, try the next candidate path
				if (res.status === 404) continue;
				// For other errors, stop early
				break;
			}
			const text = await res.text();
			if (process.env.NODE_ENV !== 'production') {
				console.log('Brickognize 200 OK', {
					endpoint,
					bytes: text.length,
					preview: text.slice(0, 1000),
				});
			}
			let data: BrickognizeResponse;
			try {
				data = JSON.parse(text) as BrickognizeResponse;
			} catch {
				// If JSON parse fails, surface minimal error
				throw new Error('Brickognize returned non-JSON response');
			}
			return data ?? {};
		} catch {
			// Network or parsing errors: try next endpoint
			continue;
		}
	}
	const hint =
		'Set BRICKOGNIZE_ENDPOINT per docs, e.g., https://api.brickognize.com/predict/parts/ or /predict/.';
	throw new Error(
		`Brickognize failed: ${lastStatus ?? 'unknown'}${lastBody ? ` - ${lastBody.slice(0, 200)}` : ''}. ${hint}`
	);
}

export function extractCandidatePartNumbers(payload: BrickognizeResponse): Array<{
	partNum: string;
	confidence: number;
	colorId?: number;
	colorName?: string;
	imageUrl?: string;
	bricklinkId?: string;
}> {
	const out: Array<{
		partNum: string;
		confidence: number;
		colorId?: number;
		colorName?: string;
		imageUrl?: string;
		bricklinkId?: string;
	}> = [];

	// Common arrays observed: candidates, results, matches
	const arrays: unknown[] = [];
	const payloadWithArrays = payload as {
		candidates?: unknown[];
		results?: unknown[];
		matches?: unknown[];
		items?: unknown[];
	};
	if (Array.isArray(payloadWithArrays.candidates)) arrays.push(...payloadWithArrays.candidates);
	if (Array.isArray(payloadWithArrays.results)) arrays.push(...payloadWithArrays.results);
	if (Array.isArray(payloadWithArrays.matches)) arrays.push(...payloadWithArrays.matches);
	// Legacy predict shape: items[]
	if (Array.isArray(payloadWithArrays.items)) arrays.push(...payloadWithArrays.items);

	if (arrays.length) {
		for (const anyC of arrays) {
			const c = anyC as BrickognizeCandidate & {
				part_num?: string;
				partNumber?: string;
				score?: number;
				id?: string;
				img_url?: string;
			};
			const partNum =
				(typeof c.partNum === 'string' && c.partNum) ||
				(typeof c.id === 'string' && c.id) ||
				(typeof c.part_num === 'string' && c.part_num) ||
				(typeof c.partNumber === 'string' && c.partNumber) ||
				(typeof c.rebrickable_part_num === 'string' && c.rebrickable_part_num) ||
				(typeof c.bricklink_part_num === 'string' && c.bricklink_part_num) ||
				(typeof c.bricklink_part_num === 'number' && String(c.bricklink_part_num)) ||
				'';
			if (!partNum) continue;
			const confidence =
				typeof c.confidence === 'number'
					? c.confidence
					: typeof c.score === 'number'
					? c.score
					: 0;
			const colorId = (c.colorId as number) ?? (c.color_id as number) ?? undefined;
			const colorName = (c.colorName as string) ?? (c.color_name as string) ?? undefined;
			const imageUrl =
				(c.imageUrl as string) ?? (c.image_url as string) ?? (c.img_url as string) ?? undefined;
			// Try to extract BrickLink ID from explicit field or external_sites url param P=.
			// Prefer entries explicitly named "bricklink" (case/whitespace-insensitive), then fallback to URL host.
			let bricklinkId: string | undefined = undefined;
			const blField =
				(typeof c.bricklink_part_num === 'string' && c.bricklink_part_num) ||
				(typeof c.bricklink_part_num === 'number' && String(c.bricklink_part_num)) ||
				'';
			if (blField) {
				bricklinkId = blField;
			} else if (Array.isArray(c.external_sites)) {
				// First pass: prefer sites clearly labeled as BrickLink
				const sites = c.external_sites as Array<{ name?: string; url?: string }>;
				const normalized = sites.map(s => {
					const name =
						typeof s?.name === 'string'
							? s.name.trim().toLowerCase()
							: '';
					return { name, url: typeof s?.url === 'string' ? s.url : '' };
				});
				const byName = normalized.find(s => s.name.replace(/\s+/g, '') === 'bricklink');
				const candidatesForParse = byName ? [byName] : normalized;
				for (const s of candidatesForParse) {
					const url = s.url ?? '';
					const isBrickLink =
						(byName && s === byName) || (typeof url === 'string' && url.includes('bricklink.com'));
					if (!isBrickLink) continue;
					const m = url.match(/[?&]P=([^&]+)/i);
					if (m && m[1]) {
						bricklinkId = decodeURIComponent(m[1]);
						break;
					}
				}
			}
			out.push({ partNum, confidence, colorId, colorName, imageUrl, bricklinkId });
		}
	}

	// Some responses might provide a single best match
	const single =
		(typeof payload.partNum === 'string' && payload.partNum) ||
		(typeof payload.rebrickable_part_num === 'string' && payload.rebrickable_part_num) ||
		(typeof payload.bricklink_part_num === 'string' && payload.bricklink_part_num) ||
		(typeof payload.bricklink_part_num === 'number' && String(payload.bricklink_part_num)) ||
		'';
	if (single) {
		out.push({
			partNum: single,
			confidence: typeof payload.confidence === 'number' ? payload.confidence : 0,
		});
	}

	// De-duplicate by partNum keeping highest confidence
	const bestByPart = new Map<string, { partNum: string; confidence: number; colorId?: number; colorName?: string; imageUrl?: string }>();
	for (const cand of out) {
		const prev = bestByPart.get(cand.partNum);
		if (!prev || cand.confidence > prev.confidence) {
			bestByPart.set(cand.partNum, cand);
		}
	}
	return [...bestByPart.values()];
}


