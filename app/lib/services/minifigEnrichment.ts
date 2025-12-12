import 'server-only';

import { getCatalogWriteClient } from '@/app/lib/db/catalogAccess';
import {
  getGlobalMinifigMappingsBatch,
  normalizeRebrickableFigId,
} from '@/app/lib/minifigMappingBatched';
import { rbFetch } from '@/app/lib/rebrickable/client';
import { getMinifigPartsCached } from '@/app/lib/rebrickable/minifigs';
import { rebrickableThrottler } from '@/app/lib/utils/throttle';
import { logger } from '@/lib/metrics';

export type MinifigSubpart = {
  partId: string;
  name: string;
  colorId: number;
  colorName: string;
  quantity: number;
  imageUrl: string | null;
  bricklinkPartId: string | null;
};

export type MinifigEnrichmentResult = {
  figNum: string;
  imageUrl: string | null;
  blId: string | null;
  name: string | null;
  numParts: number | null;
  subparts: MinifigSubpart[] | null;
  enrichedAt: number;
};

type RebrickableMinifigResponse = {
  fig_num?: string;
  name?: string;
  fig_img_url?: string | null;
  set_img_url?: string | null;
  num_parts?: number | null;
};

type RebrickableMinifigComponent = {
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

function parseBricklinkPartId(
  externalIds: Record<string, unknown> | null | undefined
): string | null {
  if (!externalIds) return null;
  const raw = (externalIds as { BrickLink?: unknown }).BrickLink;
  if (typeof raw === 'string') {
    return raw.trim() || null;
  }
  if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'string') {
    const val = raw[0].trim();
    return val || null;
  }
  return null;
}

export async function enrichMinifigs(
  figNums: string[],
  options: { includeSubparts?: boolean; forceRefresh?: boolean } = {}
): Promise<Map<string, MinifigEnrichmentResult>> {
  const trimmed = Array.from(
    new Set(figNums.map(f => f.trim()).filter(Boolean))
  );
  const includeSubparts = options.includeSubparts ?? true;
  const forceRefresh = options.forceRefresh ?? false;
  if (!trimmed.length) return new Map();

  const supabase = getCatalogWriteClient();

  // Read any existing catalog data first
  const [metaRes, imagesRes, partsRes, globalBlMappings] = await Promise.all([
    supabase
      .from('rb_minifigs')
      .select('fig_num, name, num_parts')
      .in('fig_num', trimmed),
    supabase
      .from('rb_minifig_images')
      .select('fig_num, image_url')
      .in('fig_num', trimmed),
    includeSubparts
      ? supabase
          .from('rb_minifig_parts')
          .select('fig_num, part_num, color_id, quantity')
          .in('fig_num', trimmed)
      : Promise.resolve({ data: null, error: null }),
    getGlobalMinifigMappingsBatch(trimmed),
  ]);

  if (metaRes.error) {
    logger.warn('minifig_enrich.meta_read_failed', {
      error: metaRes.error.message,
    });
  }
  if (imagesRes.error) {
    logger.warn('minifig_enrich.images_read_failed', {
      error: imagesRes.error.message,
    });
  }
  if (includeSubparts && (partsRes as { error?: unknown }).error) {
    const err = (partsRes as { error?: { message: string } }).error;
    logger.warn('minifig_enrich.parts_read_failed', {
      error: (err as { message?: string })?.message,
    });
  }

  const imageByFig = new Map<string, string | null>();
  for (const row of imagesRes.data ?? []) {
    imageByFig.set(
      row.fig_num,
      typeof row.image_url === 'string' && row.image_url.trim().length > 0
        ? row.image_url.trim()
        : null
    );
  }

  const metaByFig = new Map<
    string,
    { name: string | null; numParts: number | null }
  >();
  for (const row of metaRes.data ?? []) {
    metaByFig.set(row.fig_num, {
      name: row.name ?? null,
      numParts:
        typeof row.num_parts === 'number' && Number.isFinite(row.num_parts)
          ? row.num_parts
          : null,
    });
  }

  // Build a map of part_num -> part metadata for enriching subparts
  const partMetaByNum = new Map<
    string,
    {
      name: string | null;
      imageUrl: string | null;
      bricklinkPartId: string | null;
    }
  >();
  // Build a map of color_id -> color name
  const colorNameById = new Map<number, string>();

  // Collect unique part_nums and color_ids from the subparts we read
  const subpartPartNums = new Set<string>();
  const subpartColorIds = new Set<number>();
  if (includeSubparts && partsRes.data) {
    for (const row of partsRes.data) {
      if (typeof row.part_num === 'string' && row.part_num.trim()) {
        subpartPartNums.add(row.part_num.trim());
      }
      if (typeof row.color_id === 'number' && Number.isFinite(row.color_id)) {
        subpartColorIds.add(row.color_id);
      }
    }
  }

  // Fetch part metadata (name, image, BL ID) for the subparts
  if (subpartPartNums.size > 0) {
    const { data: partsData, error: partsError } = await supabase
      .from('rb_parts')
      .select('part_num, name, image_url, external_ids')
      .in('part_num', Array.from(subpartPartNums));
    if (partsError) {
      logger.warn('minifig_enrich.parts_meta_read_failed', {
        error: partsError.message,
      });
    }
    for (const part of partsData ?? []) {
      const bricklinkPartId = parseBricklinkPartId(
        part.external_ids as Record<string, unknown> | null
      );
      partMetaByNum.set(part.part_num, {
        name: part.name ?? null,
        imageUrl:
          typeof part.image_url === 'string' && part.image_url.trim()
            ? part.image_url.trim()
            : null,
        bricklinkPartId,
      });
    }
  }

  // Fetch color names for the subparts
  if (subpartColorIds.size > 0) {
    const { data: colorsData, error: colorsError } = await supabase
      .from('rb_colors')
      .select('id, name')
      .in('id', Array.from(subpartColorIds));
    if (colorsError) {
      logger.warn('minifig_enrich.colors_read_failed', {
        error: colorsError.message,
      });
    }
    for (const color of colorsData ?? []) {
      colorNameById.set(color.id, color.name);
    }
  }

  const partsByFig = new Map<string, MinifigSubpart[]>();
  if (includeSubparts && partsRes.data) {
    for (const row of partsRes.data) {
      const fig = row.fig_num;
      const partId =
        typeof row.part_num === 'string' && row.part_num.trim().length > 0
          ? row.part_num.trim()
          : null;
      if (!fig || !partId) continue;
      const colorId =
        typeof row.color_id === 'number' && Number.isFinite(row.color_id)
          ? row.color_id
          : 0;
      const quantity =
        typeof row.quantity === 'number' && Number.isFinite(row.quantity)
          ? row.quantity
          : 1;

      // Get enriched metadata from the lookup maps
      const partMeta = partMetaByNum.get(partId);
      const colorName = colorNameById.get(colorId) ?? `Color ${colorId}`;

      if (!partsByFig.has(fig)) partsByFig.set(fig, []);
      partsByFig.get(fig)!.push({
        partId,
        name: partMeta?.name ?? partId,
        colorId,
        colorName,
        quantity,
        imageUrl: partMeta?.imageUrl ?? null,
        bricklinkPartId: partMeta?.bricklinkPartId ?? null,
      });
    }
  }

  const results = new Map<string, MinifigEnrichmentResult>();
  const missingImages: string[] = [];
  const missingSubparts: string[] = [];

  for (const fig of trimmed) {
    const baseImage = imageByFig.get(fig) ?? null;
    const baseMeta = metaByFig.get(fig);
    const baseSubparts = includeSubparts ? (partsByFig.get(fig) ?? null) : null;
    const normalized = normalizeRebrickableFigId(fig);
    const blId = globalBlMappings.get(normalized) ?? null;
    results.set(fig, {
      figNum: fig,
      imageUrl: baseImage,
      blId,
      name: baseMeta?.name ?? null,
      numParts: baseMeta?.numParts ?? null,
      subparts: baseSubparts,
      enrichedAt: Date.now(),
    });

    if (forceRefresh || !baseImage) missingImages.push(fig);

    // Check if subparts need fetching: either missing entirely, or present but lacking images
    const subpartsLackImages =
      baseSubparts &&
      baseSubparts.length > 0 &&
      baseSubparts.some(sp => !sp.imageUrl);

    if (
      includeSubparts &&
      (forceRefresh ||
        !baseSubparts ||
        baseSubparts.length === 0 ||
        subpartsLackImages)
    ) {
      missingSubparts.push(fig);
    }
  }

  // Fetch missing images/meta from Rebrickable
  if (missingImages.length > 0) {
    await Promise.all(
      missingImages.map(figNum =>
        rebrickableThrottler.enqueue(async () => {
          const data = await rbFetch<RebrickableMinifigResponse>(
            `/lego/minifigs/${encodeURIComponent(figNum)}/`
          );
          const imageUrl =
            (typeof data.fig_img_url === 'string' && data.fig_img_url) ||
            (typeof data.set_img_url === 'string' && data.set_img_url) ||
            null;
          const name =
            typeof data.name === 'string' && data.name.trim().length > 0
              ? data.name.trim()
              : null;
          const numParts =
            typeof data.num_parts === 'number' &&
            Number.isFinite(data.num_parts)
              ? data.num_parts
              : null;

          if (imageUrl || name || numParts != null) {
            if (imageUrl) {
              const upsertResult = await supabase
                .from('rb_minifig_images')
                .upsert(
                  { fig_num: figNum, image_url: imageUrl },
                  { onConflict: 'fig_num' }
                );
              if (upsertResult.error) {
                logger.warn('minifig_enrich.image_upsert_failed', {
                  figNum,
                  error: upsertResult.error.message,
                });
              }
            }
            if (name || numParts != null) {
              const metaPayload: {
                fig_num: string;
                name: string;
                num_parts?: number | null;
              } = { fig_num: figNum, name: name ?? figNum };
              if (numParts != null) metaPayload.num_parts = numParts;

              const metaUpsert = await supabase
                .from('rb_minifigs')
                .upsert(metaPayload, { onConflict: 'fig_num' });
              if (metaUpsert.error) {
                logger.warn('minifig_enrich.meta_upsert_failed', {
                  figNum,
                  error: metaUpsert.error.message,
                });
              }
            }
          }

          const prev = results.get(figNum);
          results.set(figNum, {
            figNum,
            imageUrl: imageUrl ?? prev?.imageUrl ?? null,
            blId: prev?.blId ?? null,
            name: name ?? prev?.name ?? null,
            numParts: numParts ?? prev?.numParts ?? null,
            subparts: prev?.subparts ?? null,
            enrichedAt: Date.now(),
          });
        })
      )
    );
  }

  // Fetch missing subparts if requested
  if (includeSubparts && missingSubparts.length > 0) {
    await Promise.all(
      missingSubparts.map(figNum =>
        rebrickableThrottler.enqueue(async () => {
          let components: RebrickableMinifigComponent[] = [];
          try {
            components = await getMinifigPartsCached(figNum);
          } catch (err) {
            logger.warn('minifig_enrich.subparts_fetch_failed', {
              figNum,
              error: err instanceof Error ? err.message : String(err),
            });
          }

          const mapped: MinifigSubpart[] = components.map(c => {
            const partId = c.part.part_num;
            const bricklinkPartId = parseBricklinkPartId(c.part.external_ids);
            return {
              partId,
              name: c.part.name ?? partId,
              colorId: c.color?.id ?? 0,
              colorName:
                c.color?.name ?? (c.color ? `Color ${c.color.id}` : 'Color 0'),
              quantity: Math.max(1, Math.floor(c.quantity ?? 1)),
              imageUrl:
                typeof c.part.part_img_url === 'string'
                  ? c.part.part_img_url
                  : null,
              bricklinkPartId,
            };
          });

          if (mapped.length > 0) {
            const upsertRows = mapped.map(part => ({
              fig_num: figNum,
              part_num: part.partId,
              color_id: part.colorId,
              quantity: part.quantity,
            }));
            const upsertResult = await supabase
              .from('rb_minifig_parts')
              .upsert(upsertRows, { ignoreDuplicates: false });
            if ('error' in upsertResult && upsertResult.error) {
              logger.warn('minifig_enrich.subparts_upsert_failed', {
                figNum,
                error: upsertResult.error.message,
              });
            }
          }

          const prev = results.get(figNum);
          results.set(figNum, {
            figNum,
            imageUrl: prev?.imageUrl ?? null,
            blId: prev?.blId ?? null,
            name: prev?.name ?? null,
            numParts: prev?.numParts ?? null,
            subparts: mapped,
            enrichedAt: Date.now(),
          });
        })
      )
    );
  }

  return results;
}
