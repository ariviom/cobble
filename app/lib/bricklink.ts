import 'server-only';
import crypto from 'crypto';

const BL_STORE_BASE = 'https://api.bricklink.com/api/store/v1';
const BL_CATALOG_BASE = 'https://api.bricklink.com/api/catalog/v1';
// BrickLink Store v1 uses uppercase type segments in the URI (e.g., /items/PART/{no})
const STORE_ITEM_TYPE_PART = 'PART';

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
	const url = new URL(`${BL_STORE_BASE}${path}`);
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
	if (process.env.NODE_ENV !== 'production') {
		try {
			console.log('BL store GET', {
				path: url.pathname,
				query: url.search,
			});
		} catch {}
	}
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

async function blCatalogGet<T>(path: string, params?: Record<string, string | number>): Promise<T> {
	const url = new URL(`${BL_CATALOG_BASE}${path}`);
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
	if (process.env.NODE_ENV !== 'production') {
		try {
			console.log('BL catalog GET', {
				path: url.pathname,
				query: url.search,
			});
		} catch {}
	}
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

// Normalized superset entry (set or other item that includes the part)
export type BLSupersetItem = {
	setNumber: string;
	name: string;
	imageUrl: string | null;
	quantity: number;
};

export type BLColorEntry = {
	color_id: number;
	color_name?: string;
};

type CacheEntry<T> = { at: number; value: T };
const ONE_HOUR_MS = 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 500;

const subsetsCache = new Map<string, CacheEntry<BLSubsetItem[]>>();
const supersetsCache = new Map<string, CacheEntry<BLSupersetItem[]>>();
const colorsCache = new Map<string, CacheEntry<BLColorEntry[]>>();

function makeKey(no: string, colorId?: number): string {
	return `${no.trim().toLowerCase()}::${typeof colorId === 'number' ? colorId : ''}`;
}

function cacheGet<T>(map: Map<string, CacheEntry<T>>, key: string): T | null {
	const now = Date.now();
	const entry = map.get(key);
	if (entry && now - entry.at < ONE_HOUR_MS) return entry.value;
	return null;
}

function cacheSet<T>(map: Map<string, CacheEntry<T>>, key: string, value: T): void {
	const now = Date.now();
	map.set(key, { at: now, value });
	// naive cap eviction: delete oldest when over cap
	if (map.size > MAX_CACHE_ENTRIES) {
		let oldestKey: string | null = null;
		let oldestAt = Number.MAX_SAFE_INTEGER;
		for (const [k, v] of map.entries()) {
			if (v.at < oldestAt) {
				oldestAt = v.at;
				oldestKey = k;
			}
		}
		if (oldestKey) map.delete(oldestKey);
	}
}

export async function blGetPart(no: string): Promise<BLPart> {
	return blGet<BLPart>(`/items/${STORE_ITEM_TYPE_PART}/${encodeURIComponent(no)}`);
}

export async function blGetPartSubsets(no: string, colorId?: number): Promise<BLSubsetItem[]> {
	const key = makeKey(no, colorId);
	const cached = cacheGet(subsetsCache, key);
	if (cached) return cached;
	// BrickLink returns "data" as an array of groups: { match_no, entries: BLSubsetItem[] }.
	const data = await blGet<unknown[] | { entries: unknown[] }>(
		`/items/${STORE_ITEM_TYPE_PART}/${encodeURIComponent(no)}/subsets`,
		colorId ? { color_id: colorId } : {}
	);
	const raw: unknown[] = Array.isArray(data)
		? data
		: Array.isArray((data as any)?.entries)
		? (data as any).entries
		: [];
	const list: BLSubsetItem[] = raw
		.flatMap((group: any) =>
			Array.isArray(group?.entries) ? (group.entries as BLSubsetItem[]) : ([group] as BLSubsetItem[])
		)
		.filter(Boolean) as BLSubsetItem[];
	if (process.env.NODE_ENV !== 'production') {
		try {
			console.log('BL subsets', {
				no,
				colorId: typeof colorId === 'number' ? colorId : null,
				count: Array.isArray(list) ? list.length : 0,
			});
		} catch {}
	}
	cacheSet(subsetsCache, key, list);
	return list;
}

export async function blGetPartSupersets(no: string, colorId?: number): Promise<BLSupersetItem[]> {
	const key = makeKey(no, colorId);
	const cached = cacheGet(supersetsCache, key);
	if (cached) return cached;
	// "data" is an array; keep a fallback for potential { entries } wrappers.
	const data = await blGet<unknown[] | { entries: unknown[] }>(
		`/items/${STORE_ITEM_TYPE_PART}/${encodeURIComponent(no)}/supersets`,
		colorId ? { color_id: colorId } : {}
	);
	const raw: unknown[] = Array.isArray(data)
		? data
		: Array.isArray((data as any)?.entries)
		? (data as any).entries
		: [];
	// Each element is either a group { color_id, entries: [...] } or a direct entry.
	const flatEntries: any[] = raw.flatMap((group: any) =>
		Array.isArray(group?.entries) ? group.entries : [group]
	);
	const list: BLSupersetItem[] = flatEntries
		.map((r: any): BLSupersetItem | null => {
			if (!r) return null;
			const item = r.item ?? r;
			const setNumber = typeof item?.no === 'string' ? item.no : '';
			if (!setNumber) return null;
			const name = typeof item?.name === 'string' ? item.name : '';
			const imageUrl =
				typeof item?.image_url === 'string' ? item.image_url : null;
			// Supersets entries always imply at least one occurrence in a set; default missing quantity to 1.
			const quantity =
				typeof r.quantity === 'number'
					? r.quantity
					: typeof item?.quantity === 'number'
					? item.quantity
					: 1;
			return { setNumber, name, imageUrl, quantity };
		})
		.filter(Boolean) as BLSupersetItem[];
	if (process.env.NODE_ENV !== 'production') {
		try {
			console.log('BL supersets', {
				no,
				colorId: typeof colorId === 'number' ? colorId : null,
				count: Array.isArray(list) ? list.length : 0,
			});
		} catch {}
	}
	cacheSet(supersetsCache, key, list);
	return list;
}

export async function blGetPartColors(no: string): Promise<BLColorEntry[]> {
	const key = makeKey(no, undefined);
	const cached = cacheGet(colorsCache, key);
	if (cached) return cached;
	// This endpoint lists the colors a part appears in; shape mirrors other catalog lists
	const data = await blGet<BLColorEntry[] | { entries: BLColorEntry[] }>(
		`/items/${STORE_ITEM_TYPE_PART}/${encodeURIComponent(no)}/colors`
	);
	let list: BLColorEntry[] = [];
	if (Array.isArray(data)) {
		list = data;
	} else if (Array.isArray((data as any)?.entries)) {
		list = (data as any).entries;
	}
	if (process.env.NODE_ENV !== 'production') {
		try {
			console.log('BL colors', {
				no,
				count: Array.isArray(list) ? list.length : 0,
			});
		} catch {}
	}
	cacheSet(colorsCache, key, list);
	return list;
}

export async function blGetColor(colorId: number): Promise<{ color_id: number; color_name?: string }> {
	const data = await blGet<{ color_id: number; color_name?: string }>(
		`/colors/${encodeURIComponent(colorId)}`
	);
	if (process.env.NODE_ENV !== 'production') {
		try {
			console.log('BL color', { colorId, name: (data as any)?.color_name ?? null });
		} catch {}
	}
	return data;
}

export async function blGetPartImageUrl(no: string, colorId: number): Promise<{ thumbnail_url?: string | null; type?: string; no?: string }> {
	const data = await blGet<{ thumbnail_url?: string | null; type?: string; no?: string }>(
		`/items/${STORE_ITEM_TYPE_PART}/${encodeURIComponent(no)}/images/${encodeURIComponent(colorId)}`
	);
	if (process.env.NODE_ENV !== 'production') {
		try {
			console.log('BL image', { no, colorId, thumbnail: (data as any)?.thumbnail_url ?? null });
		} catch {}
	}
	return data;
}


