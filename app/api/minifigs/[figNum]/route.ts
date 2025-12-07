import { blGetPartPriceGuide } from '@/app/lib/bricklink';
import {
    mapBrickLinkFigToRebrickable,
    mapRebrickableFigToBrickLink,
    mapRebrickableFigToBrickLinkOnDemand,
} from '@/app/lib/minifigMapping';
import {
    getSetSummary,
    getSetsForMinifig,
} from '@/app/lib/rebrickable';
import { rbFetch, rbFetchAbsolute } from '@/app/lib/rebrickable/client';
import { extractBricklinkPartId } from '@/app/lib/rebrickable/utils';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabaseServiceRoleClient';
import { NextRequest, NextResponse } from 'next/server';

type MinifigMetaLight = {
  figNum: string;
  blId: string | null;
  imageUrl: string | null;
  name: string;
  numParts: number | null;
  year?: number | null;
  themeName?: string | null;
  sets?: {
    count: number;
    items: Array<{
      setNumber: string;
      name: string;
      year: number;
      quantity: number;
      imageUrl: string | null;
    }>;
  };
};

type MinifigPriceGuide = {
  used: {
    unitPrice: number | null;
    minPrice: number | null;
    maxPrice: number | null;
    currency: string | null;
  };
  new: {
    unitPrice: number | null;
    minPrice: number | null;
    maxPrice: number | null;
    currency: string | null;
  };
};

type MinifigSubpart = {
  partId: string;
  name: string;
  colorId: number;
  colorName: string;
  quantity: number;
  imageUrl: string | null;
  bricklinkPartId: string | null;
};

type MinifigMetaResponse = MinifigMetaLight & {
  priceGuide?: MinifigPriceGuide;
  subparts?: MinifigSubpart[];
};

type RebrickableMinifigPart = {
  part: {
    part_num: string;
    name?: string;
    part_img_url?: string | null;
    part_cat_id?: number;
    external_ids?: Record<string, unknown> | null;
  };
  color?: {
    id: number;
    name: string;
  };
  quantity: number;
};

type Subpart = {
  partId: string;
  name: string;
  colorId: number;
  colorName: string;
  quantity: number;
  imageUrl: string | null;
  bricklinkPartId: string | null;
};

async function loadSubpartsFromDb(
  supabase: ReturnType<typeof getSupabaseServiceRoleClient>,
  figNum: string
): Promise<Subpart[] | null> {
  try {
    const { data, error } = await supabase
      .from('rb_minifig_parts')
      .select(
        `
          part_num,
          color_id,
          quantity,
          rb_parts (
            name,
            part_img_url,
            external_ids
          ),
          rb_colors (
            name
          )
        `
      )
      .eq('fig_num', figNum);

    if (error) {
      console.error('[minifig-meta] failed to read rb_minifig_parts', {
        figNum,
        error: error.message,
      });
      return null;
    }

    if (!data || data.length === 0) {
      return null;
    }

    return data.map(row => {
      const partId = row.part_num;
      const name =
        (row.rb_parts as { name?: string | null } | null)?.name ?? partId;
      const img =
        (row.rb_parts as { part_img_url?: string | null } | null)
          ?.part_img_url ?? null;
      const externalIds =
        (row.rb_parts as { external_ids?: Record<string, unknown> | null } | null)
          ?.external_ids ?? null;
      const bricklinkPartId = extractBricklinkPartId(externalIds);
      const colorName =
        (row.rb_colors as { name?: string | null } | null)?.name ?? '—';

      return {
        partId,
        name,
        colorId: row.color_id ?? 0,
        colorName,
        quantity: Math.max(1, Math.floor(row.quantity ?? 1)),
        imageUrl: img,
        bricklinkPartId:
          bricklinkPartId && bricklinkPartId !== partId ? bricklinkPartId : null,
      };
    });
  } catch (err) {
    console.error('[minifig-meta] error loading subparts from db', {
      figNum,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

async function fetchAndPersistSubparts(
  supabase: ReturnType<typeof getSupabaseServiceRoleClient>,
  figNum: string
): Promise<Subpart[]> {
  try {
    const parts: RebrickableMinifigPart[] = [];
    let nextUrl: string | null = null;
    let firstPage = true;
    while (firstPage || nextUrl) {
      let response:
        | {
            results: RebrickableMinifigPart[];
            next: string | null;
          }
        | undefined;
      if (firstPage) {
        response = await rbFetch<{
          results: RebrickableMinifigPart[];
          next: string | null;
        }>(`/lego/minifigs/${encodeURIComponent(figNum)}/parts/`, {
          page_size: 1000,
          inc_part_details: 1,
        });
      } else if (nextUrl) {
        response = await rbFetchAbsolute<{
          results: RebrickableMinifigPart[];
          next: string | null;
        }>(nextUrl);
      }
      if (!response) break;
      parts.push(...response.results);
      nextUrl = response.next;
      firstPage = false;
    }

    const mapped: Subpart[] = parts.map(item => {
      const partId = item.part.part_num;
      const bricklinkPartId = extractBricklinkPartId(item.part.external_ids);
      return {
        partId,
        name: item.part.name ?? partId,
        colorId: item.color?.id ?? 0,
        colorName: item.color?.name ?? '—',
        quantity: Math.max(1, Math.floor(item.quantity ?? 1)),
        imageUrl: item.part.part_img_url ?? null,
        bricklinkPartId:
          bricklinkPartId && bricklinkPartId !== partId ? bricklinkPartId : null,
      };
    });

    if (mapped.length > 0) {
      const rows = mapped.map(sp => ({
        fig_num: figNum,
        part_num: sp.partId,
        color_id: sp.colorId,
        quantity: sp.quantity,
      }));
      const { error } = await supabase.from('rb_minifig_parts').upsert(rows);
      if (error) {
        console.error('[minifig-meta] failed to upsert rb_minifig_parts', {
          figNum,
          error: error.message,
        });
      }

      // Persist RB→BL part mappings when available.
      const mappingRows = mapped
        .filter(sp => sp.bricklinkPartId && sp.bricklinkPartId !== sp.partId)
        .map(sp => ({
          rb_part_id: sp.partId,
          bl_part_id: sp.bricklinkPartId!,
          source: 'minifig-component',
        }));
      if (mappingRows.length > 0) {
        const { error: mapErr } = await supabase
          .from('part_id_mappings')
          .upsert(mappingRows, { onConflict: 'rb_part_id' });
        if (mapErr) {
          console.error('[minifig-meta] failed to upsert part_id_mappings', {
            figNum,
            error: mapErr.message,
          });
        }
      }
    }

    return mapped;
  } catch (err) {
    console.error('[minifig-meta] failed to fetch subparts', {
      figNum,
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

export async function GET(
  req: NextRequest,
  context: unknown
): Promise<NextResponse<MinifigMetaResponse | { error: string }>> {
  const { searchParams } = new URL(req.url);
  const includeSubparts =
    (searchParams.get('includeSubparts') ?? '').toLowerCase() === 'true';
  const includePricing =
    (searchParams.get('includePricing') ?? '').toLowerCase() === 'true';

  const maybeParams =
    (context as { params?: { figNum?: string } | Promise<{ figNum?: string }> })
      ?.params ?? {};
  const resolvedParams =
    typeof (maybeParams as Promise<unknown>).then === 'function'
      ? await (maybeParams as Promise<{ figNum?: string }>)
      : (maybeParams as { figNum?: string });
  const raw = resolvedParams?.figNum ?? '';
  const inputId = raw.trim();
  if (!inputId) {
    return NextResponse.json(
      { error: 'missing_fig_num' },
      { status: 400 }
    );
  }

  // Accept BrickLink IDs in the path; map to RB fig_num for lookups.
  let figNum = inputId;
  if (!figNum.toLowerCase().startsWith('fig-')) {
    const mapped = await mapBrickLinkFigToRebrickable(figNum);
    if (mapped) {
      figNum = mapped;
    }
  }

  try {
    const supabase = getSupabaseServiceRoleClient();

    // Load Rebrickable minifig metadata (name, num_parts, year) from catalog.
    let rbName = figNum;
    let rbNumParts: number | null = null;
    let rbYear: number | null = null;
    let themeName: string | null = null;
    try {
      const { data: rbRow, error: rbError } = await supabase
        .from('rb_minifigs')
        .select('fig_num,name,num_parts,year_from')
        .eq('fig_num', figNum)
        .maybeSingle();
      if (!rbError && rbRow) {
        const row = rbRow as {
          name?: string | null;
          num_parts?: number | null;
          year_from?: number | null;
        };
        if (typeof row.name === 'string' && row.name.trim()) {
          rbName = row.name;
        }
        if (
          typeof row.num_parts === 'number' &&
          Number.isFinite(row.num_parts)
        ) {
          rbNumParts = row.num_parts;
        }
        if (
          typeof row.year_from === 'number' &&
          Number.isFinite(row.year_from)
        ) {
          rbYear = row.year_from;
        }
      }
    } catch (err) {
      console.error('[minifig-meta] rb_minifigs lookup failed', {
        figNum,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // Fallback: fetch name from Rebrickable API if catalog name is missing.
    if (rbName === figNum) {
      try {
        const d = await rbFetch<{ name?: string | null }>(
          `/lego/minifigs/${encodeURIComponent(figNum)}/`,
          { page_size: 1 }
        );
        if (typeof d.name === 'string' && d.name.trim()) {
          rbName = d.name;
        }
      } catch (err) {
        console.error('[minifig-meta] fallback minifig name lookup failed', {
          figNum,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    let blId: string | null = null;
    try {
      blId = await mapRebrickableFigToBrickLink(figNum);
    } catch (err) {
      console.error('[minifig-meta] mapRebrickableFigToBrickLink failed', {
        figNum,
        error: err instanceof Error ? err.message : String(err),
      });
      blId = null;
    }
    if (includeSubparts && blId == null) {
      try {
        blId = await mapRebrickableFigToBrickLinkOnDemand(figNum);
      } catch (err) {
        console.error(
          '[minifig-meta] on-demand BL mapping failed (includeSubparts path)',
          {
            figNum,
            error: err instanceof Error ? err.message : String(err),
          }
        );
      }
    }
    // If the caller provided a BL ID in the path, prefer to echo it back.
    if (!blId && !inputId.toLowerCase().startsWith('fig-')) {
      blId = inputId;
    }

    let imageUrl: string | null = null;

    // 1) Check cached image in rb_minifig_images first.
    try {
      const { data: cached, error: cachedError } = await supabase
        .from('rb_minifig_images')
        .select('image_url')
        .eq('fig_num', figNum)
        .maybeSingle();
      if (!cachedError && cached && typeof cached.image_url === 'string') {
        imageUrl = cached.image_url;
      }
    } catch (err) {
      console.error('[minifig-meta] rb_minifig_images lookup failed', {
        figNum,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // 2) Fallback to Rebrickable minifig image when cache doesn't have one
    //    and cache the result into rb_minifig_images.
    if (!imageUrl) {
      try {
        const d = await rbFetch<{
          set_img_url?: string | null;
          fig_img_url?: string | null;
        }>(`/lego/minifigs/${encodeURIComponent(figNum)}/`);
        let candidate: string | null = null;
        if (typeof d.fig_img_url === 'string' && d.fig_img_url) {
          candidate = d.fig_img_url;
        } else if (typeof d.set_img_url === 'string' && d.set_img_url) {
          candidate = d.set_img_url;
        }
        if (candidate) {
          imageUrl = candidate;
          try {
            await supabase
              .from('rb_minifig_images')
              .upsert(
                {
                  fig_num: figNum,
                  image_url: candidate,
                  last_fetched_at: new Date().toISOString(),
                },
                { onConflict: 'fig_num' }
              );
          } catch (err) {
            console.error(
              '[minifig-meta] failed to cache rb_minifig_images',
              {
                figNum,
                error: err instanceof Error ? err.message : String(err),
              }
            );
          }
        }
      } catch (err) {
        console.error('[minifig-meta] Rebrickable image lookup failed', {
          figNum,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Gather sets that contain this minifig (for linking to identify).
    // For the light response, keep this small. If omitted in light mode, keep empty.
    let sets: MinifigMetaResponse['sets'] = { count: 0, items: [] };
    try {
      const list = await getSetsForMinifig(figNum);
      sets = {
        count: list.length,
        items: list.slice(0, 5), // keep payload small; show up to 5
      };
      // Use the first set to fill in theme/year when missing.
      const firstSet = list[0];
      if (firstSet?.setNumber && (rbYear == null || themeName == null)) {
        try {
          const summary = await getSetSummary(firstSet.setNumber);
          if (rbYear == null && typeof summary.year === 'number') {
            rbYear = summary.year;
          }
          if (themeName == null && summary.themeName) {
            themeName = summary.themeName;
          }
        } catch (err) {
          console.error('[minifig-meta] set summary fallback failed', {
            figNum,
            setNumber: firstSet?.setNumber,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    } catch (err) {
      console.error('[minifig-meta] getSetsForMinifig failed', {
        figNum,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    let priceGuide: MinifigMetaResponse['priceGuide'] | undefined = undefined;
    if (includePricing && blId) {
      try {
        const pg = await blGetPartPriceGuide(blId, null, 'MINIFIG');
        priceGuide = {
          used: {
            unitPrice: pg.unitPriceUsed,
            minPrice: pg.minPriceUsed,
            maxPrice: pg.maxPriceUsed,
            currency: pg.currencyCode,
          },
          new: {
            unitPrice: pg.unitPriceNew,
            minPrice: null,
            maxPrice: null,
            currency: pg.currencyCode,
          },
        };
      } catch (err) {
        console.error('[minifig-meta] price guide fetch failed', {
          figNum,
          blId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    let subparts: MinifigSubpart[] | undefined = undefined;
    if (includeSubparts) {
      const subpartsFromDb = await loadSubpartsFromDb(supabase, figNum);
      subparts =
        subpartsFromDb && subpartsFromDb.length > 0
          ? subpartsFromDb
          : await fetchAndPersistSubparts(supabase, figNum);
    }

    const payload: MinifigMetaResponse = {
      figNum,
      blId,
      imageUrl,
      name: rbName,
      numParts: rbNumParts,
      year: rbYear,
      themeName,
      sets,
      ...(subparts ? { subparts } : {}),
    };
    if (priceGuide) {
      payload.priceGuide = priceGuide;
    }

    return NextResponse.json(payload);
  } catch (err) {
    console.error('[minifig-meta] unexpected error', {
      figNum,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: 'minifig_meta_failed' },
      { status: 500 }
    );
  }
}


