import 'server-only';

type RebrickableSetSearchResult = {
  set_num: string;
  name: string;
  year: number;
  num_parts: number;
  set_img_url: string | null;
  theme_id?: number;
};

type RebrickableSetInventoryItem = {
  color: { id: number; name: string };
  part: {
    part_num: string;
    name: string;
    part_img_url: string | null;
    part_cat_id?: number; // Not always present in parts listing; may require extra fetch if missing
  };
  quantity: number;
  is_spare: boolean;
};

// The set minifigs endpoint shape can vary; capture common fields defensively
type RebrickableSetMinifigItem = {
  fig_num?: string;
  set_num?: string;
  set_name?: string;
  name?: string;
  quantity: number;
  set_img_url?: string | null;
  minifig?: {
    fig_num?: string;
    set_num?: string;
    name?: string;
    set_img_url?: string | null;
  };
};

export type InventoryRow = {
  setNumber: string;
  partId: string;
  partName: string;
  colorId: number;
  colorName: string;
  quantityRequired: number;
  imageUrl: string | null;
  partCategoryId?: number;
  partCategoryName?: string;
  parentCategory?:
    | 'Brick'
    | 'Plate'
    | 'Tile'
    | 'Slope'
    | 'Clip'
    | 'Hinge'
    | 'Bar'
    | 'Minifigure'
    | 'Technic'
    | 'Wheels'
    | 'Misc';
};

const BASE = 'https://rebrickable.com/api/v3' as const;

function getApiKey(): string {
  const key = process.env.REBRICKABLE_API;
  if (!key) throw new Error('Missing REBRICKABLE_API env');
  return key;
}

async function rbFetch<T>(
  path: string,
  searchParams?: Record<string, string | number>
): Promise<T> {
  const apiKey = getApiKey();
  const url = new URL(`${BASE}${path}`);
  if (searchParams) {
    for (const [k, v] of Object.entries(searchParams))
      url.searchParams.set(k, String(v));
  }
  const res = await fetch(url, {
    headers: { Authorization: `key ${apiKey}` },
    next: { revalidate: 60 * 60 },
  });
  if (!res.ok) throw new Error(`Rebrickable error ${res.status}`);
  return (await res.json()) as T;
}

async function rbFetchAbsolute<T>(absoluteUrl: string): Promise<T> {
  const apiKey = getApiKey();
  const res = await fetch(absoluteUrl, {
    headers: { Authorization: `key ${apiKey}` },
    next: { revalidate: 60 * 60 },
  });
  if (!res.ok) throw new Error(`Rebrickable error ${res.status}`);
  return (await res.json()) as T;
}

export async function searchSets(
  query: string,
  sort: string = 'relevance',
  page: number = 1,
  pageSize: number = 20
): Promise<{
  results: Array<{
    setNumber: string;
    name: string;
    year: number;
    numParts: number;
    imageUrl: string | null;
  }>;
  nextPage: number | null;
}> {
  if (!query?.trim()) return { results: [], nextPage: null };

  const data = await rbFetch<{ results: RebrickableSetSearchResult[]; next: string | null }>(
    '/lego/sets/',
    { search: query, page_size: pageSize, page }
  );

  let allResults = data.results
    .filter(r => r.num_parts > 0) // Exclude sets with 0 parts
    .map(r => ({
      setNumber: r.set_num,
      name: r.name,
      year: r.year,
      numParts: r.num_parts,
      imageUrl: r.set_img_url,
    }));

  // Reorder slightly for set-number-like queries: prefix matches first, keep others
  const isSetNumberQuery = /^[0-9a-zA-Z-]+$/.test(query.trim());
  if (isSetNumberQuery) {
    const lower = query.toLowerCase();
    const prefix = allResults.filter(r => r.setNumber.toLowerCase().startsWith(lower));
    const rest = allResults.filter(r => !r.setNumber.toLowerCase().startsWith(lower));
    allResults = [...prefix, ...rest];
  }

  // Sort function based on sort parameter (applies within this page)
  function sortResults(results: typeof allResults) {
    switch (sort) {
      case 'pieces-asc':
        return [...results].sort((a, b) => a.numParts - b.numParts);
      case 'pieces-desc':
        return [...results].sort((a, b) => b.numParts - a.numParts);
      case 'year-asc':
        return [...results].sort((a, b) => a.year - b.year);
      case 'year-desc':
        return [...results].sort((a, b) => b.year - a.year);
      default: // 'relevance'
        return results; // Keep API order
    }
  }

  const sorted = sortResults(allResults);
  const nextPage = data.next ? page + 1 : null;

  return { results: sorted, nextPage };
}

// ---- Aggregated search (server-side pagination & stable sorting) ----

type SimpleSet = {
  setNumber: string;
  name: string;
  year: number;
  numParts: number;
  imageUrl: string | null;
};

const SEARCH_CACHE_TTL_MS = 10 * 60 * 1000;
const SEARCH_AGG_PAGE_SIZE = 200;
const SEARCH_AGG_CAP = 1000;

let aggregatedSearchCache: Map<
  string,
  { at: number; items: SimpleSet[] }
> = new Map();

function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function sortAggregatedResults(items: SimpleSet[], sort: string, query: string): SimpleSet[] {
  if (sort === 'pieces-asc') {
    return [...items].sort((a, b) => a.numParts - b.numParts);
  }
  if (sort === 'pieces-desc') {
    return [...items].sort((a, b) => b.numParts - a.numParts);
  }
  if (sort === 'year-asc') {
    return [...items].sort((a, b) => a.year - b.year);
  }
  if (sort === 'year-desc') {
    return [...items].sort((a, b) => b.year - a.year);
  }
  // 'relevance' (stable): boost setNumber prefix, then name/setNumber contains, else keep API order
  const qn = normalizeText(query);
  return [...items]
    .map((it, idx) => {
      const num = it.setNumber.toLowerCase();
      const nameN = normalizeText(it.name);
      const numN = normalizeText(it.setNumber);
      let score = 0;
      if (num.startsWith(query.toLowerCase())) score += 3;
      if (nameN.includes(qn)) score += 2;
      if (numN.includes(qn)) score += 1;
      return { it, idx, score };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.idx - b.idx; // stable
    })
    .map(x => x.it);
}

export async function getAggregatedSearchResults(
  query: string,
  sort: string
): Promise<SimpleSet[]> {
  const key = `${sort}::${query.trim().toLowerCase()}`;
  const now = Date.now();
  const cached = aggregatedSearchCache.get(key);
  if (cached && now - cached.at < SEARCH_CACHE_TTL_MS) {
    return cached.items;
  }

  // Fetch pages from Rebrickable up to cap
  let first = true;
  let nextUrl: string | null = null;
  const collected: RebrickableSetSearchResult[] = [];

  while (first || nextUrl) {
    const page =
      first
        ? await rbFetch<{ results: RebrickableSetSearchResult[]; next: string | null }>(
            '/lego/sets/',
            { search: query, page_size: SEARCH_AGG_PAGE_SIZE }
          )
        : await rbFetchAbsolute<{ results: RebrickableSetSearchResult[]; next: string | null }>(
            nextUrl!
          );
    collected.push(...page.results);
    nextUrl = page.next;
    first = false;
    if (collected.length >= SEARCH_AGG_CAP) break;
  }

  // Load themes to exclude non-set categories like Books and Gear
  const themes = await getThemes();
  const themeIdToName = new Map<number, string>(themes.map(t => [t.id, t.name]));
  const EXCLUDED_THEME_KEYWORDS = [
    'book',
    'books',
    'gear',
    'supplemental',
    'service pack',
    'service packs',
    'packaging',
    'key chain',
    'key chains',
    'magnet',
    'magnets',
    'storage',
    'watch',
    'clock',
    'poster',
    'sticker',
    'game',
    'games',
  ];

  const mapped: SimpleSet[] = collected
    .filter(r => r.num_parts > 0)
    .filter(r => {
      const themeName = r.theme_id != null ? themeIdToName.get(r.theme_id) : undefined;
      if (!themeName) return true;
      const tn = themeName.toLowerCase();
      return !EXCLUDED_THEME_KEYWORDS.some(k => tn.includes(k));
    })
    .slice(0, SEARCH_AGG_CAP)
    .map(r => ({
      setNumber: r.set_num,
      name: r.name,
      year: r.year,
      numParts: r.num_parts,
      imageUrl: r.set_img_url,
    }));

  const sorted = sortAggregatedResults(mapped, sort, query);
  aggregatedSearchCache.set(key, { at: now, items: sorted });
  return sorted;
}

export async function getSetInventory(
  setNumber: string
): Promise<InventoryRow[]> {
  type Page = { results: RebrickableSetInventoryItem[]; next: string | null };

  // Fetch all pages of parts for the set
  const firstPage = await rbFetch<Page>(
    `/lego/sets/${encodeURIComponent(setNumber)}/parts/`,
    { page_size: 1000 }
  );
  const allItems: RebrickableSetInventoryItem[] = [...firstPage.results];
  let nextUrl: string | null = firstPage.next;
  while (nextUrl) {
    const page = await rbFetchAbsolute<Page>(nextUrl);
    allItems.push(...page.results);
    nextUrl = page.next;
  }

  const cats = await getPartCategories();
  const idToName = new Map<number, string>(cats.map(c => [c.id, c.name]));

  const partRows = allItems
    .filter(i => !i.is_spare)
    .map(i => {
      const catId = i.part.part_cat_id;
      const catName = catId != null ? idToName.get(catId) : undefined;
      return {
        setNumber,
        partId: i.part.part_num,
        partName: i.part.name,
        colorId: i.color.id,
        colorName: i.color.name,
        quantityRequired: i.quantity,
        imageUrl: i.part.part_img_url,
        partCategoryId: catId,
        partCategoryName: catName,
        parentCategory: catName ? mapCategoryNameToParent(catName) : undefined,
      } satisfies InventoryRow;
    });

  // Fetch all minifigs for the set (separate endpoint) and map them into rows
  type MinifigPage = {
    results: RebrickableSetMinifigItem[];
    next: string | null;
  };
  const firstMinifigs = await rbFetch<MinifigPage>(
    `/lego/sets/${encodeURIComponent(setNumber)}/minifigs/`,
    { page_size: 1000 }
  );
  const allMinifigs: RebrickableSetMinifigItem[] = [...firstMinifigs.results];
  let nextMinUrl: string | null = firstMinifigs.next;
  while (nextMinUrl) {
    const pg = await rbFetchAbsolute<MinifigPage>(nextMinUrl);
    allMinifigs.push(...pg.results);
    nextMinUrl = pg.next;
  }

  const minifigRows: InventoryRow[] = allMinifigs.map((i, idx) => {
    const rawId =
      i.set_num ?? i.fig_num ?? i.minifig?.fig_num ?? i.minifig?.set_num ?? '';
    const figNum = rawId && rawId.trim() ? rawId : `unknown-${idx + 1}`;
    const figName = i.name ?? i.set_name ?? i.minifig?.name ?? 'Minifigure';
    const imgUrl = i.set_img_url ?? i.minifig?.set_img_url ?? null;
    return {
      setNumber,
      partId: `fig:${figNum}`,
      partName: figName,
      colorId: 0,
      colorName: '—',
      quantityRequired: i.quantity,
      imageUrl: imgUrl,
      partCategoryId: undefined,
      partCategoryName: 'Minifig',
      parentCategory: 'Minifigure',
    } satisfies InventoryRow;
  });

  return [...partRows, ...minifigRows];
}

export async function getSetSummary(setNumber: string): Promise<{
  setNumber: string;
  name: string;
  year: number;
  numParts: number;
  imageUrl: string | null;
}> {
  const d = await rbFetch<RebrickableSetSearchResult>(
    `/lego/sets/${encodeURIComponent(setNumber)}/`
  );
  return {
    setNumber: d.set_num,
    name: d.name,
    year: d.year,
    numParts: d.num_parts,
    imageUrl: d.set_img_url,
  };
}

type RebrickableCategory = { id: number; name: string };

let categoriesCache: { at: number; items: RebrickableCategory[] } | null = null;

export async function getPartCategories(): Promise<RebrickableCategory[]> {
  const now = Date.now();
  if (categoriesCache && now - categoriesCache.at < 60 * 60 * 1000) {
    return categoriesCache.items;
  }
  const data = await rbFetch<{ results: RebrickableCategory[] }>(
    '/lego/part_categories/',
    { page_size: 1000 }
  );
  categoriesCache = { at: now, items: data.results };
  return data.results;
}

export type RebrickablePart = {
	part_num: string;
	name: string;
	part_cat_id?: number;
	part_img_url: string | null;
	external_ids?: Record<string, unknown>;
};

export async function getPart(partNum: string): Promise<RebrickablePart> {
	return rbFetch<RebrickablePart>(`/lego/parts/${encodeURIComponent(partNum)}/`);
}

type RebrickablePartListItem = {
	part_num: string;
	name: string;
	part_img_url: string | null;
};

export async function searchParts(
	query: string,
	pageSize: number = 25
): Promise<RebrickablePartListItem[]> {
	if (!query.trim()) return [];
	const data = await rbFetch<{ results: RebrickablePartListItem[] }>(`/lego/parts/`, {
		search: query,
		page_size: Math.max(1, Math.min(100, pageSize)),
	});
	return data.results ?? [];
}

export type ResolvedPart = {
	partNum: string;
	name: string;
	imageUrl: string | null;
};

type CacheEntry<T> = { at: number; value: T };
const resolvedPartCache = new Map<string, CacheEntry<ResolvedPart | null>>();

/**
 * Resolve arbitrary part identifier (e.g., BrickLink-style id like "2336p68")
 * to a Rebrickable part using direct fetch, then Rebrickable search fallback.
 * Results are cached in-memory for 24 hours.
 */
export async function resolvePartIdToRebrickable(partId: string): Promise<ResolvedPart | null> {
	const key = partId.trim().toLowerCase();
	const now = Date.now();
	const cached = resolvedPartCache.get(key);
	if (cached && now - cached.at < 24 * 60 * 60 * 1000) {
		return cached.value;
	}
	// 1) Direct fetch
	try {
		const part = await getPart(partId);
		const result: ResolvedPart = {
			partNum: part.part_num,
			name: part.name,
			imageUrl: part.part_img_url,
		};
		resolvedPartCache.set(key, { at: now, value: result });
		return result;
	} catch {
		// fall through to search
	}
	// 2) Search fallback
	try {
		const list = await searchParts(partId, 25);
		if (list.length === 0) {
			resolvedPartCache.set(key, { at: now, value: null });
			return null;
		}
		// Prefer exact case-insensitive part_num match
		const exact =
			list.find((p) => p.part_num.toLowerCase() === key) ??
			// Then startsWith to catch extended variants
			list.find((p) => p.part_num.toLowerCase().startsWith(key)) ??
			// Otherwise take the first returned item
			list[0];
		const result: ResolvedPart = {
			partNum: exact.part_num,
			name: exact.name,
			imageUrl: exact.part_img_url,
		};
		resolvedPartCache.set(key, { at: now, value: result });
		return result;
	} catch {
		resolvedPartCache.set(key, { at: now, value: null });
		return null;
	}
}

export type PartInSet = {
	setNumber: string;
	name: string;
	year: number;
	imageUrl: string | null;
	quantity: number;
};

export async function getSetsForPart(
	partNum: string,
	colorId?: number
): Promise<PartInSet[]> {
	type Page = {
		results: Array<{
			set: {
				set_num: string;
				name: string;
				year: number;
				set_img_url: string | null;
			};
			quantity: number;
		}>;
		next: string | null;
	};
	const params: Record<string, string | number> = { page_size: 1000 };
	if (typeof colorId === 'number') params.color_id = colorId;

	const first = await rbFetch<Page>(
		`/lego/parts/${encodeURIComponent(partNum)}/sets/`,
		params
	);
	const all: Page['results'] = [...first.results];
	let nextUrl: string | null = first.next;
	while (nextUrl) {
		const page = await rbFetchAbsolute<Page>(nextUrl);
		all.push(...page.results);
		nextUrl = page.next;
	}
	const mapped: PartInSet[] = all.map(r => ({
		setNumber: r.set.set_num,
		name: r.set.name,
		year: r.set.year,
		imageUrl: r.set.set_img_url,
		quantity: r.quantity,
	}));
	return mapped;
}

function mapCategoryNameToParent(
  name: string
):
  | 'Brick'
  | 'Plate'
  | 'Tile'
  | 'Slope'
  | 'Clip'
  | 'Hinge'
  | 'Bar'
  | 'Minifigure'
  | 'Technic'
  | 'Wheels'
  | 'Misc' {
  const n = name.toLowerCase();
  // Precedence: Technic first
  if (
    n.startsWith('technic') ||
    n.includes('pneumatic') ||
    n.includes('power functions') ||
    n.includes('electronics')
  )
    return 'Technic';
  if (
    n.includes('wheel') ||
    n.includes('tyre') ||
    n.includes('tire') ||
    n.includes('rim')
  )
    return 'Wheels';
  if (n.startsWith('minifig')) return 'Minifigure';
  if (n.startsWith('clip') || n.includes('clip')) return 'Clip';
  if (n.startsWith('bar') || n.includes('lightsaber')) return 'Bar';
  if (n.startsWith('hinge') || n.includes('turntable')) return 'Hinge';
  if (n.startsWith('slope') || n.includes('roof tile')) return 'Slope';
  if (n.startsWith('tile')) return 'Tile';
  if (n.startsWith('plate') || n.includes('wedge')) return 'Plate';
  if (n.startsWith('brick') || n.includes('bracket') || n.includes('arch'))
    return 'Brick';
  return 'Misc';
}

export type RebrickableColor = {
  id: number;
  name: string;
  rgb: string | null;
  is_trans: boolean;
  external_ids?: {
    BrickLink?: {
      ext_ids: number[];
      ext_descrs: string[][];
    };
    [key: string]: unknown;
  };
};

let colorsCache: { at: number; items: RebrickableColor[] } | null = null;

export async function getColors(): Promise<RebrickableColor[]> {
  const now = Date.now();
  if (colorsCache && now - colorsCache.at < 60 * 60 * 1000) {
    return colorsCache.items;
  }
  const allColors: RebrickableColor[] = [];
  let nextUrl: string | null = null;
  let firstPage = true;

  while (firstPage || nextUrl) {
    const page: { results: RebrickableColor[]; next: string | null } = firstPage
      ? await rbFetch<{ results: RebrickableColor[]; next: string | null }>(
          '/lego/colors/',
          { page_size: 1000 }
        )
      : await rbFetchAbsolute<{ results: RebrickableColor[]; next: string | null }>(
          nextUrl!
        );
    allColors.push(...page.results);
    nextUrl = page.next;
    firstPage = false;
  }

  colorsCache = { at: now, items: allColors };
  return allColors;
}

// Themes
type RebrickableTheme = { id: number; parent_id: number | null; name: string };
let themesCache: { at: number; items: RebrickableTheme[] } | null = null;

export async function getThemes(): Promise<RebrickableTheme[]> {
  const now = Date.now();
  if (themesCache && now - themesCache.at < 60 * 60 * 1000) {
    return themesCache.items;
  }
  const all: RebrickableTheme[] = [];
  let first = true;
  let nextUrl: string | null = null;
  while (first || nextUrl) {
    const page = first
      ? await rbFetch<{ results: RebrickableTheme[]; next: string | null }>(
          '/lego/themes/',
          { page_size: 1000 }
        )
      : await rbFetchAbsolute<{ results: RebrickableTheme[]; next: string | null }>(
          nextUrl!
        );
    all.push(...page.results);
    nextUrl = page.next;
    first = false;
  }
  themesCache = { at: now, items: all };
  return all;
}
