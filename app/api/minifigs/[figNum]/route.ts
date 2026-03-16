import { errorResponse } from '@/app/lib/api/responses';
import { blGetPartPriceGuide } from '@/app/lib/bricklink';
import {
  BL_RATE_LIMIT_IP_STRICT,
  BL_RATE_WINDOW_MS,
} from '@/app/lib/bricklink/rateLimitConfig';
import {
  findRbMinifig,
  getBlMinifigImageUrl,
  getOrFetchMinifigImageUrl,
  getRarestSubpartSets,
  type RarestSubpartSetsResult,
} from '@/app/lib/catalog/minifigs';
import { getCatalogReadClient } from '@/app/lib/db/catalogAccess';
import { incrementCounter, logger } from '@/lib/metrics';
import { consumeRateLimit, getClientIp } from '@/lib/rateLimit';
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
  source?: 'derived' | 'cached' | 'real_time' | 'quota_exhausted';
};

type MinifigSubpart = {
  partId: string;
  name: string;
  colorId: number;
  colorName: string;
  quantity: number;
  imageUrl: string | null;
  bricklinkPartId: string | null;
  setCount?: number | null;
};

type RarestSubpartSetsPayload = {
  setNumber: string;
  name: string;
  year: number;
  imageUrl: string | null;
  quantity: number;
  numParts?: number | null;
  themeName?: string | null;
};

type MinifigMetaResponse = MinifigMetaLight & {
  priceGuide?: MinifigPriceGuide;
  subparts?: MinifigSubpart[];
  rarestSubpartSets?: RarestSubpartSetsPayload[];
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ figNum: string }> }
): Promise<NextResponse<MinifigMetaResponse | { error: string }>> {
  const { searchParams } = new URL(req.url);
  const includeSubparts =
    (searchParams.get('includeSubparts') ?? '').toLowerCase() === 'true';
  const includePricing =
    (searchParams.get('includePricing') ?? '').toLowerCase() === 'true';

  const { figNum } = await params;
  const inputId = figNum.trim();
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

  // Rate-limit when pricing is requested (hits BrickLink API)
  if (includePricing) {
    const clientIp = (await getClientIp(req)) ?? 'unknown';
    const ipLimit = await consumeRateLimit(`bl-minifig:ip:${clientIp}`, {
      windowMs: BL_RATE_WINDOW_MS,
      maxHits: BL_RATE_LIMIT_IP_STRICT,
    });
    if (!ipLimit.allowed) {
      incrementCounter('minifig_pricing_rate_limited');
      return NextResponse.json(
        {
          error: 'rate_limited',
          scope: 'ip',
          retryAfterSeconds: ipLimit.retryAfterSeconds,
        },
        {
          status: 429,
          headers: { 'Retry-After': String(ipLimit.retryAfterSeconds) },
        }
      );
    }
  }

  // Input may be a BrickLink minifig ID (e.g., "sw0001") or an RB fig_num (e.g., "fig-005774")
  const inputMinifigId = inputId;

  try {
    const supabase = getCatalogReadClient();

    const rbMinifig = await findRbMinifig(inputMinifigId);

    const blMinifigNo = rbMinifig?.bl_minifig_id ?? inputMinifigId;
    const name = rbMinifig?.name || inputMinifigId;
    let year: number | null = null;
    let numParts: number | null = rbMinifig?.num_parts ?? null;
    let imageUrl: string | null = null;

    // Get RB image (checks cache, fetches from API on miss, BL fallback)
    if (rbMinifig?.fig_num) {
      imageUrl = await getOrFetchMinifigImageUrl(
        rbMinifig.fig_num,
        blMinifigNo
      );
    }
    // Even without an rbMinifig match, provide BL image
    if (!imageUrl) {
      imageUrl = getBlMinifigImageUrl(blMinifigNo);
    }

    // Get sets containing this minifig from rb_inventory_minifigs
    let sets: MinifigMetaResponse['sets'] = { count: 0, items: [] };
    let allDirectSetNums: string[] = [];
    let themeName: string | null = null;

    const rbFigNum = rbMinifig?.fig_num;

    // Kick off rarest subpart sets lookup in parallel (resolved later)
    let rarestSubpartSetsPromise: Promise<RarestSubpartSetsResult | null> =
      Promise.resolve(null);
    // Theme name lookup — started as soon as theme_id is known, resolved later
    let themeNamePromise: Promise<string | null> = Promise.resolve(null);

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
            allDirectSetNums = [...new Set(setNums)];
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
                  themeNamePromise = Promise.resolve(
                    supabase
                      .from('rb_themes')
                      .select('name')
                      .eq('id', firstSetDetail.theme_id)
                      .maybeSingle()
                  ).then(({ data }) => data?.name ?? null);
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

      // Now that we know direct sets, start rarest subpart lookup in parallel
      const directSetNums = new Set(allDirectSetNums);
      rarestSubpartSetsPromise = getRarestSubpartSets(
        supabase,
        rbFigNum,
        directSetNums
      );
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

        // Batch-query per-subpart rarity from rb_part_rarity
        const orClauses = rbParts.map(
          p => `and(part_num.eq.${p.part_num},color_id.eq.${p.color_id})`
        );
        const { data: rarityRows } = await supabase
          .from('rb_part_rarity')
          .select('part_num, color_id, set_count')
          .or(orClauses.join(','));
        const rarityMap = new Map<string, number>();
        for (const r of rarityRows ?? []) {
          rarityMap.set(`${r.part_num}:${r.color_id}`, r.set_count);
        }

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
            setCount: rarityMap.get(`${p.part_num}:${p.color_id}`) ?? null,
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

    // Resolve parallel lookups
    const [rarestResult, resolvedThemeName] = await Promise.all([
      rarestSubpartSetsPromise,
      themeNamePromise,
    ]);
    if (resolvedThemeName) {
      themeName = resolvedThemeName;
    }
    const rarestSubpartSets: RarestSubpartSetsPayload[] =
      rarestResult?.sets?.map(s => ({
        setNumber: s.setNumber,
        name: s.name,
        year: s.year,
        imageUrl: s.imageUrl,
        quantity: s.quantity,
        numParts: s.numParts ?? null,
        themeName: s.themeName ?? null,
      })) ?? [];

    const payload: MinifigMetaResponse = {
      blId: blMinifigNo,
      imageUrl,
      name,
      numParts,
      year,
      themeName,
      sets,
      ...(subparts ? { subparts } : {}),
      ...(rarestSubpartSets.length > 0 ? { rarestSubpartSets } : {}),
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
