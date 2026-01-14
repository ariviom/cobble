import { errorResponse } from '@/app/lib/api/responses';
import { blGetPartPriceGuide } from '@/app/lib/bricklink';
import {
  getBlMinifigImageUrl,
  getMinifigMetaBl,
  getMinifigPartsBl,
  mapBlToRbFigId,
} from '@/app/lib/bricklink/minifigs';
import { getCatalogWriteClient } from '@/app/lib/db/catalogAccess';
import { getSetSummary, getSetsForMinifig } from '@/app/lib/rebrickable';
import { logger } from '@/lib/metrics';
import { NextRequest, NextResponse } from 'next/server';

type MinifigMetaLight = {
  /** BrickLink minifig ID (primary) */
  blId: string;
  /** Rebrickable fig_num (for backwards compatibility, may be null) */
  figNum: string | null;
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

  // The input is expected to be a BrickLink minifig ID (e.g., "sw0001")
  const blMinifigNo = inputId;

  try {
    const supabase = getCatalogWriteClient();

    // Get BL minifig metadata from bricklink_minifigs catalog
    const blMeta = await getMinifigMetaBl(blMinifigNo);

    let name = blMinifigNo;
    let year: number | null = null;
    let imageUrl: string | null = null;

    if (blMeta) {
      name = blMeta.name || blMinifigNo;
      year = blMeta.itemYear;
    }

    // Try to get image from bl_set_minifigs (most recent source)
    const { data: blSetMinifig } = await supabase
      .from('bl_set_minifigs')
      .select('image_url, name')
      .eq('minifig_no', blMinifigNo)
      .not('image_url', 'is', null)
      .limit(1)
      .maybeSingle();

    if (blSetMinifig?.image_url) {
      imageUrl = blSetMinifig.image_url;
    }
    // Fallback to constructed BrickLink image URL
    if (!imageUrl) {
      imageUrl = getBlMinifigImageUrl(blMinifigNo);
    }
    if (!name || name === blMinifigNo) {
      name = blSetMinifig?.name || blMinifigNo;
    }

    // Get the RB fig_num for backwards compatibility (inventory lookups)
    const rbFigNum = await mapBlToRbFigId(blMinifigNo);

    // Get sets that contain this minifig
    let sets: MinifigMetaResponse['sets'] = { count: 0, items: [] };
    let themeName: string | null = null;

    // Try to get sets from bl_set_minifigs first
    const { data: blSets } = await supabase
      .from('bl_set_minifigs')
      .select('set_num')
      .eq('minifig_no', blMinifigNo)
      .limit(10);

    if (blSets && blSets.length > 0) {
      const setNums = blSets.map(s => s.set_num);
      const { data: setSummaries } = await supabase
        .from('rb_sets')
        .select('set_num, name, year, image_url')
        .in('set_num', setNums);

      if (setSummaries) {
        sets = {
          count: setSummaries.length,
          items: setSummaries.slice(0, 5).map(s => ({
            setNumber: s.set_num,
            name: s.name,
            year: s.year ?? 0,
            quantity: 1,
            imageUrl: s.image_url,
          })),
        };

        // Get theme from first set
        const firstSet = setSummaries[0];
        if (firstSet && (year == null || themeName == null)) {
          try {
            const summary = await getSetSummary(firstSet.set_num);
            if (year == null && typeof summary.year === 'number') {
              year = summary.year;
            }
            if (themeName == null && summary.themeName) {
              themeName = summary.themeName;
            }
          } catch (err) {
            logger.warn('minifig.set_summary_fallback_failed', {
              blMinifigNo,
              setNumber: firstSet.set_num,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
      }
    } else if (rbFigNum) {
      // Fallback to RB sets lookup if we have the RB ID
      try {
        const list = await getSetsForMinifig(rbFigNum);
        sets = {
          count: list.length,
          items: list.slice(0, 5),
        };
        const firstSet = list[0];
        if (firstSet?.setNumber && (year == null || themeName == null)) {
          try {
            const summary = await getSetSummary(firstSet.setNumber);
            if (year == null && typeof summary.year === 'number') {
              year = summary.year;
            }
            if (themeName == null && summary.themeName) {
              themeName = summary.themeName;
            }
          } catch (err) {
            logger.warn('minifig.set_summary_fallback_failed', {
              blMinifigNo,
              setNumber: firstSet?.setNumber,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
      } catch (err) {
        logger.warn('minifig.get_sets_failed', {
          blMinifigNo,
          rbFigNum,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Get price guide if requested
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
        };
      } catch (err) {
        logger.warn('minifig.price_guide_failed', {
          blMinifigNo,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Get subparts if requested (from BL data, self-healing)
    let subparts: MinifigSubpart[] | undefined = undefined;
    let partsCount: number | null = null;
    if (includeSubparts) {
      const blParts = await getMinifigPartsBl(blMinifigNo);
      partsCount = blParts.length;

      if (blParts.length > 0) {
        // Get color names from rb_colors
        const colorIds = Array.from(new Set(blParts.map(p => p.blColorId)));
        const { data: colors } = await supabase
          .from('rb_colors')
          .select('id, name')
          .in('id', colorIds);

        const colorMap = new Map(colors?.map(c => [c.id, c.name]) ?? []);

        subparts = blParts.map(p => ({
          partId: p.blPartId, // Use BL part ID as primary
          name: p.name ?? p.blPartId,
          colorId: p.blColorId,
          colorName: colorMap.get(p.blColorId) ?? `Color ${p.blColorId}`,
          quantity: p.quantity,
          imageUrl: null, // BL parts don't have cached images in our schema yet
          bricklinkPartId: p.blPartId, // Already BL ID
        }));
      }
    }

    // Count parts for numParts if not available
    let numParts: number | null = partsCount;
    if ((numParts === null || numParts === 0) && rbFigNum) {
      // Try to get from RB catalog as fallback
      const { data: rbMinifig } = await supabase
        .from('rb_minifigs')
        .select('num_parts')
        .eq('fig_num', rbFigNum)
        .maybeSingle();
      if (rbMinifig?.num_parts) {
        numParts = rbMinifig.num_parts;
      }
    }

    const payload: MinifigMetaResponse = {
      blId: blMinifigNo,
      figNum: rbFigNum,
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
      blMinifigNo,
      error: err instanceof Error ? err.message : String(err),
    });
    return errorResponse('minifig_meta_failed', {
      message: 'Failed to fetch minifig metadata',
    });
  }
}
