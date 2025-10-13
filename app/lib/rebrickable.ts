import 'server-only';

type RebrickableSetSearchResult = {
  set_num: string;
  name: string;
  year: number;
  num_parts: number;
  set_img_url: string | null;
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
  sort: string = 'relevance'
): Promise<{
  exactMatches: Array<{
    setNumber: string;
    name: string;
    year: number;
    numParts: number;
    imageUrl: string | null;
  }>;
  otherMatches: Array<{
    setNumber: string;
    name: string;
    year: number;
    numParts: number;
    imageUrl: string | null;
  }>;
}> {
  if (!query?.trim()) return { exactMatches: [], otherMatches: [] };

  const data = await rbFetch<{ results: RebrickableSetSearchResult[] }>(
    '/lego/sets/',
    { search: query, page_size: 20 }
  );

  const allResults = data.results
    .filter(r => r.num_parts > 0) // Exclude sets with 0 parts
    .map(r => ({
      setNumber: r.set_num,
      name: r.name,
      year: r.year,
      numParts: r.num_parts,
      imageUrl: r.set_img_url,
    }));

  // Sort function based on sort parameter
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
        return results; // Keep original order
    }
  }

  // Check if query looks like a set number (numeric or alphanumeric)
  const isNumericQuery = /^[0-9]+$/.test(query.trim());
  const isSetNumberQuery = /^[0-9a-zA-Z-]+$/.test(query.trim());

  if (isSetNumberQuery) {
    // Split into exact matches (starting with query) and other matches
    const exactMatches = allResults.filter(r =>
      r.setNumber.toLowerCase().startsWith(query.toLowerCase())
    );
    const otherMatches = allResults.filter(
      r => !r.setNumber.toLowerCase().startsWith(query.toLowerCase())
    );

    return {
      exactMatches: sortResults(exactMatches),
      otherMatches: sortResults(otherMatches),
    };
  } else {
    // For non-set-number queries, prioritize exact name matches
    const exactMatches = allResults.filter(
      r =>
        r.name.toLowerCase().includes(query.toLowerCase()) ||
        r.setNumber.toLowerCase().includes(query.toLowerCase())
    );
    const otherMatches: typeof allResults = [];

    return {
      exactMatches: sortResults(exactMatches),
      otherMatches: sortResults(otherMatches),
    };
  }
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
