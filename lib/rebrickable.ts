import "server-only";

type RebrickableSetSearchResult = {
	set_num: string;
	name: string;
	year: number;
	num_parts: number;
	set_img_url: string | null;
};

type RebrickableSetInventoryItem = {
	color: { id: number; name: string };
	part: { part_num: string; name: string; part_img_url: string | null };
	quantity: number;
	is_spare: boolean;
};

export type InventoryRow = {
	setNumber: string;
	partId: string;
	partName: string;
	colorId: number;
	colorName: string;
	quantityRequired: number;
	imageUrl: string | null;
};

const BASE = "https://rebrickable.com/api/v3" as const;

function getApiKey(): string {
	const key = process.env.REBRICKABLE_API;
	if (!key) throw new Error("Missing REBRICKABLE_API env");
	return key;
}

async function rbFetch<T>(path: string, searchParams?: Record<string, string | number>): Promise<T> {
	const apiKey = getApiKey();
	const url = new URL(`${BASE}${path}`);
	if (searchParams) {
		for (const [k, v] of Object.entries(searchParams)) url.searchParams.set(k, String(v));
	}
	const res = await fetch(url, {
		headers: { Authorization: `key ${apiKey}` },
		next: { revalidate: 60 * 60 },
	});
	if (!res.ok) throw new Error(`Rebrickable error ${res.status}`);
	return (await res.json()) as T;
}

export async function searchSets(query: string): Promise<Array<{ setNumber: string; name: string; year: number; numParts: number; imageUrl: string | null }>> {
	if (!query?.trim()) return [];
	const data = await rbFetch<{ results: RebrickableSetSearchResult[] }>("/lego/sets/", { search: query, page_size: 10 });
	return data.results.map((r) => ({ setNumber: r.set_num, name: r.name, year: r.year, numParts: r.num_parts, imageUrl: r.set_img_url }));
}

export async function getSetInventory(setNumber: string): Promise<InventoryRow[]> {
	const data = await rbFetch<{ results: RebrickableSetInventoryItem[] }>(`/lego/sets/${encodeURIComponent(setNumber)}/parts/`, { page_size: 1000 });
	return data.results
		.filter((i) => !i.is_spare)
		.map((i) => ({
			setNumber,
			partId: i.part.part_num,
			partName: i.part.name,
			colorId: i.color.id,
			colorName: i.color.name,
			quantityRequired: i.quantity,
			imageUrl: i.part.part_img_url,
		}));
}

export async function getSetSummary(setNumber: string): Promise<{ setNumber: string; name: string; year: number; numParts: number; imageUrl: string | null }> {
	const d = await rbFetch<RebrickableSetSearchResult>(`/lego/sets/${encodeURIComponent(setNumber)}/`);
	return { setNumber: d.set_num, name: d.name, year: d.year, numParts: d.num_parts, imageUrl: d.set_img_url };
}


