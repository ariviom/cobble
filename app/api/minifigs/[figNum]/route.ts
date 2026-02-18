import { errorResponse } from '@/app/lib/api/responses';
import { blGetPartPriceGuide } from '@/app/lib/bricklink';
import { getOrFetchMinifigImageUrl } from '@/app/lib/catalog/minifigs';
import { getCatalogReadClient } from '@/app/lib/db/catalogAccess';
import { logger } from '@/lib/metrics';
import { NextRequest, NextResponse } from 'next/server';

type MinifigMetaLight = {
  /** BrickLink minifig ID (primary) */
  blId: string;
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
  source?: 'derived' | 'cached' | 'real_time';
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
    return errorResponse('missing_required_field', {
      message: 'Minifig figure number is required',
    });
  }

  // Validate minifig ID format: alphanumeric with optional dashes/underscores
  // Max length 50 chars to prevent abuse, typical IDs are < 15 chars
  // Examples: sw0001, cty0123, hp001, njo001, fig-000001
  const MINIFIG_ID_PATTERN = /^[a-zA-Z0-9][\w-]{0,49}$/;
  if (!MINIFIG_ID_PATTERN.test(inputId)) {
    return errorResponse('validation_failed', {
      message: 'Invalid minifig ID format',
    });
  }

  // Input may be a BrickLink minifig ID (e.g., "sw0001") or an RB fig_num (e.g., "fig-005774")
  const inputMinifigId = inputId;

  try {
    const supabase = getCatalogReadClient();

    // Try bl_minifig_id first, then fall back to fig_num (inventory links use RB fig_nums)
    const { data: rbMinifigRows } = await supabase
      .from('rb_minifigs')
      .select('fig_num, name, num_parts, bl_minifig_id')
      .eq('bl_minifig_id', inputMinifigId)
      .limit(1);
    let rbMinifig = rbMinifigRows?.[0] ?? null;

    if (!rbMinifig) {
      const { data: byFigNum } = await supabase
        .from('rb_minifigs')
        .select('fig_num, name, num_parts, bl_minifig_id')
        .eq('fig_num', inputMinifigId)
        .limit(1);
      rbMinifig = byFigNum?.[0] ?? null;
    }

    const blMinifigNo = rbMinifig?.bl_minifig_id ?? inputMinifigId;
    const name = rbMinifig?.name || inputMinifigId;
    let year: number | null = null;
    let numParts: number | null = rbMinifig?.num_parts ?? null;
    let imageUrl: string | null = null;

    // Get RB image (checks cache, fetches from API on miss)
    if (rbMinifig?.fig_num) {
      imageUrl = await getOrFetchMinifigImageUrl(rbMinifig.fig_num);
    }

    // Get sets containing this minifig from rb_inventory_minifigs
    let sets: MinifigMetaResponse['sets'] = { count: 0, items: [] };
    let themeName: string | null = null;

    const rbFigNum = rbMinifig?.fig_num;
    if (rbFigNum) {
      try {
        // Get set inventories that contain this minifig
        const { data: invMinifigs } = await supabase
          .from('rb_inventory_minifigs')
          .select('inventory_id, quantity')
          .eq('fig_num', rbFigNum);

        if (invMinifigs && invMinifigs.length > 0) {
          const invIds = invMinifigs.map(im => im.inventory_id);

          // Get set numbers from inventories (only set inventories, not fig-*)
          const { data: rawInventories } = await supabase
            .from('rb_inventories')
            .select('id, set_num')
            .in('id', invIds)
            .not('set_num', 'like', 'fig-%');

          const inventories = (rawInventories ?? []).filter(
            (inv): inv is typeof inv & { set_num: string } =>
              typeof inv.set_num === 'string'
          );

          if (inventories.length > 0) {
            const invToQty = new Map<number, number>();
            for (const im of invMinifigs) {
              invToQty.set(im.inventory_id, im.quantity ?? 1);
            }

            const setNums = inventories.map(inv => inv.set_num);
            const { data: setDetails } = await supabase
              .from('rb_sets')
              .select('set_num, name, year, image_url, theme_id')
              .in('set_num', setNums);

            const detailMap = new Map(
              (setDetails ?? []).map(s => [s.set_num, s])
            );

            const setItems = inventories
              .map(inv => {
                const details = detailMap.get(inv.set_num);
                const qty = invToQty.get(inv.id) ?? 1;
                return {
                  setNumber: inv.set_num,
                  name: details?.name ?? inv.set_num,
                  year: details?.year ?? 0,
                  quantity: qty,
                  imageUrl: details?.image_url ?? null,
                };
              })
              // Deduplicate by set_num (multiple inventory versions)
              .filter(
                (item, idx, arr) =>
                  arr.findIndex(x => x.setNumber === item.setNumber) === idx
              )
              .sort((a, b) => b.quantity - a.quantity || b.year - a.year);

            sets = {
              count: setItems.length,
              items: setItems.slice(0, 5),
            };

            // Get theme/year from first set (catalog only — no external API call)
            if (setItems.length > 0 && (year == null || themeName == null)) {
              const firstSetDetail = detailMap.get(setItems[0]!.setNumber);
              if (firstSetDetail) {
                if (year == null && typeof firstSetDetail.year === 'number') {
                  year = firstSetDetail.year;
                }
                if (
                  themeName == null &&
                  typeof firstSetDetail.theme_id === 'number'
                ) {
                  const { data: theme } = await supabase
                    .from('rb_themes')
                    .select('name')
                    .eq('id', firstSetDetail.theme_id)
                    .maybeSingle();
                  if (theme?.name) {
                    themeName = theme.name;
                  }
                }
              }
            }
          }
        }
      } catch (err) {
        logger.warn('minifig.get_sets_failed', {
          blMinifigNo,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Get price guide if requested (BL API stays for pricing)
    let priceGuide: MinifigMetaResponse['priceGuide'] | undefined = undefined;
    if (includePricing) {
      try {
        const pg = await blGetPartPriceGuide(blMinifigNo, null, 'MINIFIG');
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
          source: pg.__source ?? 'real_time',
        };
      } catch (err) {
        logger.warn('minifig.price_guide_failed', {
          blMinifigNo,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Get subparts if requested (from RB catalog)
    let subparts: MinifigSubpart[] | undefined = undefined;
    if (includeSubparts && rbFigNum) {
      const { data: rbParts } = await supabase
        .from('rb_minifig_parts')
        .select(
          'part_num, color_id, quantity, img_url, rb_parts!inner(name, bl_part_id), rb_colors!inner(name)'
        )
        .eq('fig_num', rbFigNum);

      if (rbParts && rbParts.length > 0) {
        numParts = rbParts.length;
        subparts = rbParts.map(p => {
          const partMeta = p.rb_parts as unknown as {
            name: string;
            bl_part_id: string | null;
          };
          const colorMeta = p.rb_colors as unknown as {
            name: string;
          };
          return {
            partId: p.part_num,
            name: partMeta.name ?? p.part_num,
            colorId: p.color_id,
            colorName: colorMeta.name ?? `Color ${p.color_id}`,
            quantity: p.quantity ?? 1,
            imageUrl: (p as Record<string, unknown>).img_url as string | null,
            bricklinkPartId: partMeta.bl_part_id,
          };
        });
      }
    } else if (numParts == null && rbFigNum) {
      // Quick count from rb_minifig_parts
      const { count } = await supabase
        .from('rb_minifig_parts')
        .select('*', { count: 'exact', head: true })
        .eq('fig_num', rbFigNum);
      numParts = count;
    }

    const payload: MinifigMetaResponse = {
      blId: blMinifigNo,
      imageUrl,
      name,
      numParts,
      year,
      themeName,
      sets,
      ...(subparts ? { subparts } : {}),
    };
    if (priceGuide) {
      payload.priceGuide = priceGuide;
    }

    return NextResponse.json(payload);
  } catch (err) {
    logger.error('minifig.unexpected_error', {
      inputMinifigId,
      error: err instanceof Error ? err.message : String(err),
    });
    return errorResponse('minifig_meta_failed', {
      message: 'Failed to fetch minifig metadata',
    });
  }
}
