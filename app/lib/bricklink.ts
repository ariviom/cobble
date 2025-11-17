import 'server-only';
import crypto from 'crypto';

const BL_BASE = 'https://api.bricklink.com/api/store/v1';

function getEnv(name: string): string {
	const val = process.env[name] ?? '';
	if (!val) throw new Error(`Missing env ${name}`);
	return val;
}

function tryGetTokenSecret(): string {
	// Support a common misspelling BRICLINK_TOKEN_SECRET as a fallback
	return process.env.BRICKLINK_TOKEN_SECRET ?? process.env.BRICLINK_TOKEN_SECRET ?? '';
}

function rfc3986encode(str: string): string {
	return encodeURIComponent(str)
		.replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

function buildOAuthHeader(method: string, url: string, extraParams: Record<string, string | number>): string {
	const consumerKey = getEnv('BRICKLINK_CONSUMER_KEY');
	const consumerSecret = getEnv('BRICKLINK_CONSUMER_SECRET');
	const token = getEnv('BRICKLINK_TOKEN_VALUE');
	const tokenSecret = tryGetTokenSecret();
	if (!tokenSecret) throw new Error('Missing BRICKLINK_TOKEN_SECRET (or BRICLINK_TOKEN_SECRET fallback)');

	const oauthParams: Record<string, string> = {
		oauth_consumer_key: consumerKey,
		oauth_nonce: crypto.randomBytes(16).toString('hex'),
		oauth_signature_method: 'HMAC-SHA1',
		oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
		oauth_token: token,
		oauth_version: '1.0',
	};

	// Merge params for signature base string
	const sigParams: Record<string, string> = {};
	for (const [k, v] of Object.entries(oauthParams)) sigParams[k] = String(v);
	for (const [k, v] of Object.entries(extraParams || {})) {
		if (v === undefined || v === null) continue;
		sigParams[k] = String(v);
	}
	// Normalize and sort
	const norm = Object.keys(sigParams)
		.sort()
		.map(k => `${rfc3986encode(k)}=${rfc3986encode(sigParams[k])}`)
		.join('&');
	const baseString = [
		method.toUpperCase(),
		rfc3986encode(url),
		rfc3986encode(norm),
	].join('&');
	const signingKey = `${rfc3986encode(consumerSecret)}&${rfc3986encode(tokenSecret)}`;
	const signature = crypto.createHmac('sha1', signingKey).update(baseString).digest('base64');

	const headerParams = {
		...oauthParams,
		oauth_signature: signature,
	};
	const header = 'OAuth ' + Object.keys(headerParams)
		.sort()
		.map(k => `${rfc3986encode(k)}="${rfc3986encode(headerParams[k]!)}"`)
		.join(', ');
	return header;
}

async function blGet<T>(path: string, params?: Record<string, string | number>): Promise<T> {
	const url = new URL(`${BL_BASE}${path}`);
	if (params) {
		for (const [k, v] of Object.entries(params)) {
			if (v === undefined || v === null) continue;
			url.searchParams.set(k, String(v));
		}
	}
	const authHeader = buildOAuthHeader('GET', url.origin + url.pathname, Object.fromEntries(url.searchParams.entries()));
	const res = await fetch(url, {
		method: 'GET',
		headers: {
			Authorization: authHeader,
			Accept: 'application/json',
		},
		next: { revalidate: 60 * 60 },
	});
	if (!res.ok) {
		const text = await res.text().catch(() => '');
		throw new Error(`BrickLink ${res.status}: ${text.slice(0, 200)}`);
	}
	type BLResponse = { meta?: { code?: number; message?: string }; data: T };
	const json = (await res.json()) as BLResponse;
	if (json?.meta && json.meta.code && json.meta.code !== 200) {
		throw new Error(`BrickLink meta ${json.meta.code}: ${json.meta.message ?? 'error'}`);
	}
	return json.data;
}

export type BLPart = {
	no: string; // BrickLink part no, e.g., 6129c03
	name?: string;
	category_id?: number;
	image_url?: string;
	// Additional fields ignored
};

export type BLSubsetItem = {
	inv_item_id?: number;
	color_id?: number;
	color_name?: string;
	item: { no: string; type: string; name?: string; image_url?: string };
	quantity: number;
	appear_as: 'A' | 'P' | string; // assembly or part
};

export async function blGetPart(no: string): Promise<BLPart> {
	return blGet<BLPart>(`/items/part/${encodeURIComponent(no)}`);
}

export async function blGetPartSubsets(no: string, colorId?: number): Promise<BLSubsetItem[]> {
	const data = await blGet<{ entries: BLSubsetItem[] }>(
		`/items/part/${encodeURIComponent(no)}/subsets`,
		colorId ? { color_id: colorId } : {}
	);
	return Array.isArray((data as any)?.entries) ? (data as any).entries : [];
}


