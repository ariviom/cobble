import { createClient } from '@supabase/supabase-js';
import { parse } from 'csv-parse';
import dotenv from 'dotenv';
import { Readable } from 'node:stream';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import zlib from 'node:zlib';

import type { Database, Json } from '@/supabase/types';

// Load environment variables:
// - In production: load ".env" only.
// - In development / non-production: load ".env" then ".env.local" overriding,
//   mirroring Next.js behavior (local overrides base).
dotenv.config();
if (process.env.NODE_ENV !== 'production') {
  dotenv.config({ path: '.env.local', override: true });
}

type SourceKey =
  | 'themes'
  | 'colors'
  | 'part_categories'
  | 'parts'
  | 'sets'
  | 'minifigs'
  | 'inventories'
  | 'inventory_parts'
  | 'inventory_minifigs';

type DownloadInfo = {
  source: SourceKey;
  url: string;
  lastModified?: string | undefined;
};

// Pipeline salt to force re-ingest when downstream schema/logic changes.
// Version key = `${PIPELINE_VERSION}#${Last-Modified}` from CDN headers.
// Bump this to invalidate all cached versions and force full re-ingest.
const PIPELINE_VERSION = 'img-url-v1';

type ForceConfig = {
  all: boolean;
  sources: Set<SourceKey>;
};

// Basic CLI logging helper
function log(message: string) {
  // eslint-disable-next-line no-console
  console.log(`[ingest-rebrickable] ${message}`);
}

function parseForceArg(argv: string[]): ForceConfig {
  const forceArg = argv.find(arg => arg.startsWith('--force'));
  if (!forceArg) {
    return { all: false, sources: new Set<SourceKey>() };
  }

  // Supported forms:
  // --force                 (treat as all)
  // --force=all
  // --force=inventory_parts
  // --force=parts,inventory_parts
  const [, rawValue] = forceArg.split('=', 2);
  if (!rawValue || rawValue.trim().length === 0) {
    return { all: true, sources: new Set<SourceKey>() };
  }

  const tokens = rawValue
    .split(',')
    .map(token => token.trim())
    .filter(Boolean);

  if (tokens.length === 0 || tokens.includes('all')) {
    return { all: true, sources: new Set<SourceKey>() };
  }

  const validSources: SourceKey[] = [
    'themes',
    'colors',
    'part_categories',
    'parts',
    'sets',
    'minifigs',
    'inventories',
    'inventory_parts',
    'inventory_minifigs',
  ];

  const sources = new Set<SourceKey>();
  for (const token of tokens) {
    if (validSources.includes(token as SourceKey)) {
      sources.add(token as SourceKey);
    }
  }

  return { all: false, sources };
}

function getEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/** Extract BrickLink part ID from external_ids JSON.
 *  Handles both array format (`{ "BrickLink": ["3024"] }`)
 *  and nested format (`{ "BrickLink": { "ext_ids": ["3024"] } }`). */
function extractBricklinkPartId(
  externalIds: Json | null | undefined
): string | null {
  if (!externalIds || typeof externalIds !== 'object') return null;
  const record = externalIds as Record<string, unknown>;
  const blIds = record.BrickLink as unknown;
  if (Array.isArray(blIds) && blIds.length > 0) {
    const first = blIds[0];
    return typeof first === 'string' || typeof first === 'number'
      ? String(first)
      : null;
  }
  if (blIds && typeof blIds === 'object' && 'ext_ids' in blIds) {
    const extIds = (blIds as { ext_ids?: unknown }).ext_ids;
    if (Array.isArray(extIds) && extIds.length > 0) {
      const first = extIds[0];
      return typeof first === 'string' || typeof first === 'number'
        ? String(first)
        : null;
    }
  }
  return null;
}

async function getDownloadUrls(): Promise<DownloadInfo[]> {
  const base = 'https://cdn.rebrickable.com/media/downloads';

  const sources: Array<{ source: SourceKey; url: string }> = [
    { source: 'themes', url: `${base}/themes.csv.gz` },
    { source: 'colors', url: `${base}/colors.csv.gz` },
    { source: 'part_categories', url: `${base}/part_categories.csv.gz` },
    { source: 'parts', url: `${base}/parts.csv.gz` },
    { source: 'sets', url: `${base}/sets.csv.gz` },
    { source: 'minifigs', url: `${base}/minifigs.csv.gz` },
    { source: 'inventories', url: `${base}/inventories.csv.gz` },
    { source: 'inventory_parts', url: `${base}/inventory_parts.csv.gz` },
    {
      source: 'inventory_minifigs',
      url: `${base}/inventory_minifigs.csv.gz`,
    },
  ];

  // Probe Last-Modified headers in parallel to detect catalog updates.
  // If a HEAD request fails, lastModified stays undefined and the source
  // falls back to PIPELINE_VERSION-only versioning (always re-ingests once
  // per PIPELINE_VERSION bump).
  const results = await Promise.allSettled(
    sources.map(async s => {
      const res = await fetch(s.url, { method: 'HEAD' });
      const lastModified = res.headers.get('last-modified') ?? undefined;
      return { ...s, lastModified };
    })
  );

  return results.map((r, i) =>
    r.status === 'fulfilled' ? r.value : { ...sources[i]! }
  );
}

async function downloadAndDecompress(
  url: string
): Promise<NodeJS.ReadableStream> {
  log(`Downloading ${url}`);
  const res = await fetch(url);
  if (!res.ok || !res.body) {
    throw new Error(
      `Failed to download ${url}: ${res.status} ${res.statusText}`
    );
  }

  // In Node 18+, fetch() returns a Web ReadableStream; convert to Node.js Readable.
  const webStream = res.body as unknown as NodeReadableStream<Uint8Array>;
  const nodeStream = Readable.fromWeb(webStream);
  const gunzip = zlib.createGunzip();
  return nodeStream.pipe(gunzip);
}

async function readCurrentVersion(
  supabase: ReturnType<typeof createClient<Database>>,
  source: SourceKey
): Promise<string | null> {
  const { data, error } = await supabase
    .from('rb_download_versions')
    .select('version')
    .eq('source', source)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data?.version ?? null;
}

async function updateVersion(
  supabase: ReturnType<typeof createClient<Database>>,
  source: SourceKey,
  version: string
): Promise<void> {
  const { error } = await supabase.from('rb_download_versions').upsert(
    {
      source,
      version,
    },
    { onConflict: 'source' }
  );

  if (error) {
    throw error;
  }
}

async function ingestThemes(
  supabase: ReturnType<typeof createClient<Database>>,
  stream: NodeJS.ReadableStream
): Promise<void> {
  log('Ingesting themes into rb_themes');

  const parser = stream.pipe(
    parse({
      columns: true,
      skip_empty_lines: true,
    })
  );

  const batch: Array<Database['public']['Tables']['rb_themes']['Insert']> = [];
  const batchSize = 2000;

  for await (const record of parser) {
    const id = Number(record.id);
    if (!Number.isFinite(id)) continue;

    batch.push({
      id,
      name: record.name ?? '',
      parent_id:
        record.parent_id !== '' && record.parent_id != null
          ? Number(record.parent_id)
          : null,
    });

    if (batch.length >= batchSize) {
      const { error } = await supabase.from('rb_themes').upsert(batch);
      if (error) throw error;
      batch.length = 0;
    }
  }

  if (batch.length > 0) {
    const { error } = await supabase.from('rb_themes').upsert(batch);
    if (error) throw error;
  }
}

async function ingestColors(
  supabase: ReturnType<typeof createClient<Database>>,
  stream: NodeJS.ReadableStream
): Promise<void> {
  log('Ingesting colors into rb_colors');

  const parser = stream.pipe(
    parse({
      columns: true,
      skip_empty_lines: true,
    })
  );

  const batch: Array<Database['public']['Tables']['rb_colors']['Insert']> = [];
  const batchSize = 2000;

  for await (const record of parser) {
    const id = Number(record.id);
    if (!Number.isFinite(id)) continue;

    batch.push({
      id,
      name: record.name ?? '',
      rgb: record.rgb && record.rgb.length === 6 ? record.rgb : null,
      is_trans:
        record.is_trans === 't' ||
        record.is_trans === 'true' ||
        record.is_trans === '1',
    });

    if (batch.length >= batchSize) {
      const { error } = await supabase.from('rb_colors').upsert(batch);
      if (error) throw error;
      batch.length = 0;
    }
  }

  if (batch.length > 0) {
    const { error } = await supabase.from('rb_colors').upsert(batch);
    if (error) throw error;
  }
}

/**
 * Enrich rb_colors with external_ids from the Rebrickable API.
 *
 * The CSV doesn't include external_ids (BrickLink color mappings), so we
 * fetch them from the API once after CSV ingestion. This is lightweight
 * (~300 colors, 1-2 pages) and only runs when colors are ingested.
 */
async function enrichColorExternalIds(
  supabase: ReturnType<typeof createClient<Database>>
): Promise<void> {
  const apiKey = process.env.REBRICKABLE_API;
  if (!apiKey) {
    log('Skipping color external_ids enrichment: REBRICKABLE_API not set');
    return;
  }

  log('Enriching rb_colors with external_ids from Rebrickable API...');

  type ApiColor = {
    id: number;
    name: string;
    external_ids: Record<string, unknown> | null;
  };
  type ApiPage = { results: ApiColor[]; next: string | null };

  const allColors: ApiColor[] = [];
  let url: string | null =
    `https://rebrickable.com/api/v3/lego/colors/?page_size=1000&key=${apiKey}`;

  while (url) {
    const res = await fetch(url);
    if (!res.ok) {
      log(`Color API enrichment failed: ${res.status} ${res.statusText}`);
      return;
    }
    const page: ApiPage = (await res.json()) as ApiPage;
    allColors.push(...page.results);
    url = page.next;
  }

  log(`Fetched ${allColors.length} colors from API, updating external_ids...`);

  // Batch update in chunks
  const batchSize = 200;
  let updated = 0;
  for (let i = 0; i < allColors.length; i += batchSize) {
    const chunk = allColors.slice(i, i + batchSize);
    const rows = chunk
      .filter(c => c.external_ids != null)
      .map(c => ({
        id: c.id,
        name: c.name,
        external_ids: c.external_ids as Json,
      }));

    if (rows.length > 0) {
      const { error } = await supabase.from('rb_colors').upsert(rows);
      if (error) {
        log(`Failed to upsert color external_ids batch: ${error.message}`);
      } else {
        updated += rows.length;
      }
    }
  }

  log(`Enriched ${updated} colors with external_ids`);
}

/**
 * Enrich rb_parts with external_ids and bl_part_id from the Rebrickable API.
 *
 * The CSV doesn't include external_ids (BrickLink part mappings), so we
 * fetch them from the API after CSV ingestion. Only stores mappings for
 * parts where the BrickLink ID differs from the Rebrickable ID (~80%).
 * Also extracts the BL part ID into rb_parts.bl_part_id for direct access.
 */
async function enrichPartExternalIds(
  supabase: ReturnType<typeof createClient<Database>>
): Promise<void> {
  const apiKey = process.env.REBRICKABLE_API;
  if (!apiKey) {
    log('Skipping part external_ids enrichment: REBRICKABLE_API not set');
    return;
  }

  log('Enriching rb_parts with external_ids from Rebrickable API...');

  type ApiPart = {
    part_num: string;
    name: string;
    external_ids: Record<string, unknown> | null;
  };
  type ApiPage = { results: ApiPart[]; next: string | null };

  // Only collect parts where BrickLink ID differs from part_num
  const exceptions: Array<{
    part_num: string;
    name: string;
    external_ids: Json;
  }> = [];
  let totalFetched = 0;
  let url: string | null =
    `https://rebrickable.com/api/v3/lego/parts/?page_size=1000&key=${apiKey}`;

  while (url) {
    const res = await fetch(url);
    if (!res.ok) {
      log(`Part API enrichment failed: ${res.status} ${res.statusText}`);
      return;
    }
    const page: ApiPage = (await res.json()) as ApiPage;
    totalFetched += page.results.length;

    for (const part of page.results) {
      if (!part.external_ids) continue;

      // Extract BL ID using the format-agnostic helper (handles both
      // flat array and nested { ext_ids: [...] } formats)
      const blPartId = extractBricklinkPartId(part.external_ids as Json);
      if (!blPartId) continue;

      // Only store exceptions where BL ID differs from RB part_num
      if (blPartId !== part.part_num) {
        exceptions.push({
          part_num: part.part_num,
          name: part.name,
          external_ids: part.external_ids as Json,
        });
      }
    }

    const pageNum = Math.ceil(totalFetched / 1000);
    if (pageNum % 10 === 0) {
      log(
        `  ...fetched ${totalFetched} parts (${exceptions.length} exceptions so far)`
      );
    }
    url = page.next;
  }

  log(
    `Fetched ${totalFetched} parts from API, ${exceptions.length} have different BrickLink IDs`
  );

  // Batch upsert exceptions (external_ids + bl_part_id in one pass)
  const batchSize = 500;
  let updated = 0;
  for (let i = 0; i < exceptions.length; i += batchSize) {
    const chunk = exceptions.slice(i, i + batchSize);
    const { error } = await supabase.from('rb_parts').upsert(
      chunk.map(e => {
        const blPartId = extractBricklinkPartId(e.external_ids);
        return {
          part_num: e.part_num,
          name: e.name,
          external_ids: e.external_ids,
          // Also populate bl_part_id so the app can read it directly
          ...(blPartId && blPartId !== e.part_num
            ? { bl_part_id: blPartId }
            : {}),
        };
      })
    );
    if (error) {
      log(`Failed to upsert part external_ids batch: ${error.message}`);
    } else {
      updated += chunk.length;
    }
  }

  log(
    `Enriched ${updated} parts with external_ids + bl_part_id (exceptions only)`
  );
}

/**
 * Enrich rb_minifig_images with image URLs from the Rebrickable API.
 *
 * The minifigs CSV doesn't include image URLs, but the API returns
 * `set_img_url` for each minifig. Paginates through the full catalog
 * and upserts into rb_minifig_images.
 */
async function enrichMinifigImages(
  supabase: ReturnType<typeof createClient<Database>>
): Promise<void> {
  const apiKey = process.env.REBRICKABLE_API;
  if (!apiKey) {
    log('Skipping minifig image enrichment: REBRICKABLE_API not set');
    return;
  }

  log('Enriching rb_minifig_images from Rebrickable API...');

  type ApiMinifig = {
    set_num: string; // fig_num (e.g. "fig-000001")
    set_img_url: string | null;
  };
  type ApiPage = { results: ApiMinifig[]; next: string | null };

  const images: Array<{ fig_num: string; image_url: string }> = [];
  let totalFetched = 0;
  let url: string | null =
    `https://rebrickable.com/api/v3/lego/minifigs/?page_size=1000&key=${apiKey}`;

  while (url) {
    const res = await fetch(url);
    if (!res.ok) {
      log(`Minifig image enrichment failed: ${res.status} ${res.statusText}`);
      return;
    }
    const page: ApiPage = (await res.json()) as ApiPage;
    totalFetched += page.results.length;

    for (const fig of page.results) {
      if (fig.set_img_url) {
        images.push({
          fig_num: fig.set_num,
          image_url: fig.set_img_url,
        });
      }
    }

    const pageNum = Math.ceil(totalFetched / 1000);
    if (pageNum % 5 === 0) {
      log(
        `  ...fetched ${totalFetched} minifigs (${images.length} with images)`
      );
    }
    url = page.next;
  }

  log(
    `Fetched ${totalFetched} minifigs from API, ${images.length} have images`
  );

  // Batch upsert into rb_minifig_images
  const batchSize = 500;
  let upserted = 0;
  for (let i = 0; i < images.length; i += batchSize) {
    const chunk = images.slice(i, i + batchSize);
    const { error } = await supabase.from('rb_minifig_images').upsert(
      chunk.map(row => ({
        fig_num: row.fig_num,
        image_url: row.image_url,
        last_fetched_at: new Date().toISOString(),
      })),
      { onConflict: 'fig_num' }
    );
    if (error) {
      log(`Failed to upsert minifig images batch: ${error.message}`);
    } else {
      upserted += chunk.length;
    }
  }

  log(`Enriched ${upserted} minifig images in rb_minifig_images`);
}

async function ingestPartCategories(
  supabase: ReturnType<typeof createClient<Database>>,
  stream: NodeJS.ReadableStream
): Promise<void> {
  log('Ingesting part categories into rb_part_categories');

  const parser = stream.pipe(
    parse({
      columns: true,
      skip_empty_lines: true,
    })
  );

  const batch: Array<
    Database['public']['Tables']['rb_part_categories']['Insert']
  > = [];
  const batchSize = 2000;

  for await (const record of parser) {
    const id = Number(record.id);
    if (!Number.isFinite(id)) continue;

    batch.push({
      id,
      name: record.name ?? '',
    });

    if (batch.length >= batchSize) {
      const { error } = await supabase.from('rb_part_categories').upsert(batch);
      if (error) throw error;
      batch.length = 0;
    }
  }

  if (batch.length > 0) {
    const { error } = await supabase.from('rb_part_categories').upsert(batch);
    if (error) throw error;
  }
}

async function ingestParts(
  supabase: ReturnType<typeof createClient<Database>>,
  stream: NodeJS.ReadableStream
): Promise<void> {
  log('Ingesting parts into rb_parts');

  const parser = stream.pipe(
    parse({
      columns: true,
      skip_empty_lines: true,
    })
  );

  const batch: Array<Database['public']['Tables']['rb_parts']['Insert']> = [];
  const batchSize = 2000;

  for await (const record of parser) {
    const part_num = record.part_num as string | undefined;
    if (!part_num) continue;

    batch.push({
      part_num,
      name: record.name ?? '',
      part_cat_id:
        record.part_cat_id !== '' && record.part_cat_id != null
          ? Number(record.part_cat_id)
          : null,
      image_url: record.part_img_url || null,
    });

    if (batch.length >= batchSize) {
      const { error } = await supabase.from('rb_parts').upsert(batch);
      if (error) throw error;
      batch.length = 0;
    }
  }

  if (batch.length > 0) {
    const { error } = await supabase.from('rb_parts').upsert(batch);
    if (error) throw error;
  }
}

async function ingestSets(
  supabase: ReturnType<typeof createClient<Database>>,
  stream: NodeJS.ReadableStream
): Promise<void> {
  log('Ingesting sets into rb_sets');

  const parser = stream.pipe(
    parse({
      columns: true,
      skip_empty_lines: true,
    })
  );

  const batch: Array<Database['public']['Tables']['rb_sets']['Insert']> = [];
  const batchSize = 2000;

  for await (const record of parser) {
    const set_num = record.set_num as string | undefined;
    if (!set_num) continue;

    batch.push({
      set_num,
      name: record.name ?? '',
      year:
        record.year !== '' && record.year != null ? Number(record.year) : null,
      theme_id:
        record.theme_id !== '' && record.theme_id != null
          ? Number(record.theme_id)
          : null,
      num_parts:
        record.num_parts !== '' && record.num_parts != null
          ? Number(record.num_parts)
          : null,
      image_url: record.img_url || null,
    });

    if (batch.length >= batchSize) {
      const { error } = await supabase.from('rb_sets').upsert(batch);
      if (error) throw error;
      batch.length = 0;
    }
  }

  if (batch.length > 0) {
    const { error } = await supabase.from('rb_sets').upsert(batch);
    if (error) throw error;
  }
}

async function ingestMinifigs(
  supabase: ReturnType<typeof createClient<Database>>,
  stream: NodeJS.ReadableStream
): Promise<void> {
  log('Ingesting minifigs into rb_minifigs');

  const parser = stream.pipe(
    parse({
      columns: true,
      skip_empty_lines: true,
    })
  );

  const batch: Array<Database['public']['Tables']['rb_minifigs']['Insert']> =
    [];
  const batchSize = 2000;

  for await (const record of parser) {
    const fig_num = record.fig_num as string | undefined;
    if (!fig_num) continue;

    batch.push({
      fig_num,
      name: record.name ?? '',
      num_parts:
        record.num_parts !== '' && record.num_parts != null
          ? Number(record.num_parts)
          : null,
    });

    if (batch.length >= batchSize) {
      const { error } = await supabase.from('rb_minifigs').upsert(batch);
      if (error) throw error;
      batch.length = 0;
    }
  }

  if (batch.length > 0) {
    const { error } = await supabase.from('rb_minifigs').upsert(batch);
    if (error) throw error;
  }
}

async function ingestInventories(
  supabase: ReturnType<typeof createClient<Database>>,
  stream: NodeJS.ReadableStream
): Promise<void> {
  log('Ingesting inventories into rb_inventories');

  const parser = stream.pipe(
    parse({
      columns: true,
      skip_empty_lines: true,
    })
  );

  const batch: Array<Database['public']['Tables']['rb_inventories']['Insert']> =
    [];
  const batchSize = 2000;

  for await (const record of parser) {
    const id = Number(record.id);
    if (!Number.isFinite(id)) continue;

    batch.push({
      id,
      version:
        record.version !== '' && record.version != null
          ? Number(record.version)
          : null,
      set_num: (record.set_num as string | undefined) ?? null,
    });

    if (batch.length >= batchSize) {
      const { error } = await supabase.from('rb_inventories').upsert(batch);
      if (error) throw error;
      batch.length = 0;
    }
  }

  if (batch.length > 0) {
    const { error } = await supabase.from('rb_inventories').upsert(batch);
    if (error) throw error;
  }
}

async function ingestInventoryParts(
  supabase: ReturnType<typeof createClient<Database>>,
  stream: NodeJS.ReadableStream
): Promise<void> {
  log('Ingesting inventory parts into rb_inventory_parts');

  const parser = stream.pipe(
    parse({
      columns: true,
      skip_empty_lines: true,
    })
  );

  type InsertRow =
    Database['public']['Tables']['rb_inventory_parts']['Insert'] & {
      img_url?: string | null;
    };

  // We may see duplicate keys (same PK) within a single CSV chunk.
  // To avoid ON CONFLICT updating the same row twice in one statement,
  // aggregate by the primary key before upserting.
  const batchMap = new Map<string, InsertRow>();
  const batchSize = 2000;

  const flush = async () => {
    if (batchMap.size === 0) return;
    const rows = Array.from(batchMap.values());
    const { error } = await supabase.from('rb_inventory_parts').upsert(rows);
    if (error) throw error;
    batchMap.clear();
  };

  for await (const record of parser) {
    const inventory_id_raw = record.inventory_id;
    const part_num = record.part_num as string | undefined;
    const color_id_raw = record.color_id;
    const quantity_raw = record.quantity;
    if (
      inventory_id_raw == null ||
      !part_num ||
      color_id_raw == null ||
      quantity_raw == null
    ) {
      continue;
    }

    const inventory_id = Number(inventory_id_raw);
    const color_id = Number(color_id_raw);
    const quantity = Number(quantity_raw);
    if (
      !Number.isFinite(inventory_id) ||
      !Number.isFinite(color_id) ||
      !Number.isFinite(quantity)
    ) {
      continue;
    }

    const is_spare =
      record.is_spare === 't' ||
      record.is_spare === 'true' ||
      record.is_spare === '1';
    const element_id = (record.element_id as string | undefined) ?? '';
    const img_url_raw = (record.img_url as string | undefined) ?? '';
    const img_url =
      typeof img_url_raw === 'string' && img_url_raw.trim().length > 0
        ? img_url_raw.trim()
        : null;

    const key = `${inventory_id}|${part_num}|${color_id}|${is_spare ? 1 : 0}|${element_id}`;
    const existing = batchMap.get(key);

    if (existing) {
      // Aggregate quantities for duplicate keys.
      existing.quantity = (existing.quantity ?? 0) + quantity;
      if (!existing.img_url && img_url) {
        existing.img_url = img_url;
      }
    } else {
      batchMap.set(key, {
        inventory_id,
        part_num,
        color_id,
        quantity,
        is_spare,
        element_id,
        img_url,
      });
    }

    if (batchMap.size >= batchSize) {
      await flush();
    }
  }

  await flush();
}

async function ingestInventoryMinifigs(
  supabase: ReturnType<typeof createClient<Database>>,
  stream: NodeJS.ReadableStream
): Promise<void> {
  log('Ingesting inventory minifigs into rb_inventory_minifigs');

  const parser = stream.pipe(
    parse({
      columns: true,
      skip_empty_lines: true,
    })
  );

  const batch: Array<
    Database['public']['Tables']['rb_inventory_minifigs']['Insert']
  > = [];
  const batchSize = 2000;

  for await (const record of parser) {
    const inventory_id_raw = record.inventory_id;
    const fig_num = record.fig_num as string | undefined;
    const quantity_raw = record.quantity;
    if (inventory_id_raw == null || !fig_num || quantity_raw == null) continue;

    const inventory_id = Number(inventory_id_raw);
    const quantity = Number(quantity_raw);
    if (!Number.isFinite(inventory_id) || !Number.isFinite(quantity)) continue;

    batch.push({
      inventory_id,
      fig_num,
      quantity,
    });

    if (batch.length >= batchSize) {
      const { error } = await supabase
        .from('rb_inventory_minifigs')
        .upsert(batch);
      if (error) throw error;
      batch.length = 0;
    }
  }

  if (batch.length > 0) {
    const { error } = await supabase
      .from('rb_inventory_minifigs')
      .upsert(batch);
    if (error) throw error;
  }
}

// ===========================================================================
// Materialize rb_minifig_parts from fig-* inventories
// ===========================================================================

async function materializeMinifigParts(
  supabase: ReturnType<typeof createClient<Database>>
): Promise<void> {
  log('Materializing rb_minifig_parts from fig-* inventories...');

  // Use rpc to run raw SQL — the same query as the migration
  const { error } = await supabase.rpc(
    'exec_sql' as never,
    {
      query: `
      INSERT INTO public.rb_minifig_parts (fig_num, part_num, color_id, quantity, img_url)
      SELECT ri.set_num, rip.part_num, rip.color_id, SUM(rip.quantity),
             (array_agg(rip.img_url) FILTER (WHERE rip.img_url IS NOT NULL))[1]
      FROM public.rb_inventories ri
      JOIN public.rb_inventory_parts rip ON rip.inventory_id = ri.id
      JOIN public.rb_parts rp ON rp.part_num = rip.part_num
      JOIN public.rb_colors rc ON rc.id = rip.color_id
      WHERE ri.set_num LIKE 'fig-%'
        AND rip.is_spare = false
      GROUP BY ri.set_num, rip.part_num, rip.color_id
      ON CONFLICT (fig_num, part_num, color_id) DO UPDATE SET
        quantity = EXCLUDED.quantity,
        img_url = COALESCE(EXCLUDED.img_url, rb_minifig_parts.img_url)
    `,
    } as never
  );

  if (error) {
    // Fallback: run as a multi-step approach if rpc not available
    log('rpc exec_sql not available, using chunked materialization...');

    // Get all fig-* inventory IDs
    const { data: figInventories, error: invErr } = await supabase
      .from('rb_inventories')
      .select('id, set_num')
      .like('set_num', 'fig-%');

    if (invErr) throw invErr;
    if (!figInventories || figInventories.length === 0) {
      log('No fig-* inventories found, skipping materialization.');
      return;
    }

    log(`Found ${figInventories.length} fig-* inventories to materialize.`);

    const batchSize = 200;
    let totalRows = 0;

    for (let i = 0; i < figInventories.length; i += batchSize) {
      const chunk = figInventories.slice(i, i + batchSize);
      const invIds = chunk.map(inv => inv.id);

      // Get all non-spare parts for these inventories
      const { data: parts, error: partsErr } = await supabase
        .from('rb_inventory_parts')
        .select('inventory_id, part_num, color_id, quantity, img_url')
        .in('inventory_id', invIds)
        .eq('is_spare', false);

      if (partsErr) throw partsErr;
      if (!parts || parts.length === 0) continue;

      // Build figNum lookup
      const invToFig = new Map<number, string>();
      for (const inv of chunk) {
        if (inv.set_num) invToFig.set(inv.id, inv.set_num);
      }

      // Aggregate by (fig_num, part_num, color_id)
      const aggregated = new Map<
        string,
        {
          fig_num: string;
          part_num: string;
          color_id: number;
          quantity: number;
          img_url: string | null;
        }
      >();
      for (const p of parts) {
        const figNum = invToFig.get(p.inventory_id);
        if (!figNum) continue;
        const key = `${figNum}:${p.part_num}:${p.color_id}`;
        const existing = aggregated.get(key);
        if (existing) {
          existing.quantity += p.quantity;
          if (!existing.img_url && p.img_url) existing.img_url = p.img_url;
        } else {
          aggregated.set(key, {
            fig_num: figNum,
            part_num: p.part_num,
            color_id: p.color_id,
            quantity: p.quantity,
            img_url: p.img_url ?? null,
          });
        }
      }

      const rows = Array.from(aggregated.values());
      if (rows.length > 0) {
        const { error: upsertErr } = await supabase
          .from('rb_minifig_parts')
          .upsert(rows, { onConflict: 'fig_num,part_num,color_id' });
        if (upsertErr) throw upsertErr;
        totalRows += rows.length;
      }
    }

    log(`Materialized ${totalRows} rows into rb_minifig_parts.`);
    return;
  }

  log('Materialized rb_minifig_parts via SQL.');
}

// ===========================================================================
// Minifig Matching — Tier-1 (set-based) + Tier-2 (fingerprinting)
// ===========================================================================

type SupabaseClient = ReturnType<typeof createClient<Database>>;

/** Normalize LEGO leg assemblies for RB↔BL comparison */
function normalizePartNum(partNum: string): string {
  if (partNum.startsWith('970cm') && !partNum.startsWith('970cm00'))
    return '970cm00';
  if (partNum.startsWith('970c') && !partNum.startsWith('970cm')) {
    const suffix = partNum.slice(4);
    if (/^\d+$/.test(suffix)) return '970c00';
  }
  return partNum;
}

type FingerprintPart = {
  blPartId: string;
  blColorId: number;
  quantity: number;
};

function compareFingerprints(
  a: FingerprintPart[],
  b: FingerprintPart[]
): { score: number; matchedParts: number; totalParts: number } {
  if (a.length === 0 || b.length === 0)
    return {
      score: 0,
      matchedParts: 0,
      totalParts: Math.max(a.length, b.length),
    };

  const aSet = new Map<string, number>();
  for (const p of a) {
    const key = `${normalizePartNum(p.blPartId)}:${p.blColorId}`;
    aSet.set(key, (aSet.get(key) ?? 0) + p.quantity);
  }
  const bSet = new Map<string, number>();
  for (const p of b) {
    const key = `${normalizePartNum(p.blPartId)}:${p.blColorId}`;
    bSet.set(key, (bSet.get(key) ?? 0) + p.quantity);
  }

  let matched = 0;
  for (const key of new Set([...aSet.keys(), ...bSet.keys()])) {
    matched += Math.min(aSet.get(key) ?? 0, bSet.get(key) ?? 0);
  }

  let totalA = 0;
  for (const q of aSet.values()) totalA += q;
  let totalB = 0;
  for (const q of bSet.values()) totalB += q;
  const total = Math.max(totalA, totalB);

  return {
    score: total > 0 ? matched / total : 0,
    matchedParts: matched,
    totalParts: total,
  };
}

function compareFingerprintsPartsOnly(
  a: FingerprintPart[],
  b: FingerprintPart[]
): { score: number } {
  if (a.length === 0 || b.length === 0) return { score: 0 };

  const aSet = new Map<string, number>();
  for (const p of a) {
    const n = normalizePartNum(p.blPartId);
    aSet.set(n, (aSet.get(n) ?? 0) + p.quantity);
  }
  const bSet = new Map<string, number>();
  for (const p of b) {
    const n = normalizePartNum(p.blPartId);
    bSet.set(n, (bSet.get(n) ?? 0) + p.quantity);
  }

  let matched = 0;
  for (const key of new Set([...aSet.keys(), ...bSet.keys()])) {
    matched += Math.min(aSet.get(key) ?? 0, bSet.get(key) ?? 0);
  }
  let totalA = 0;
  for (const q of aSet.values()) totalA += q;
  let totalB = 0;
  for (const q of bSet.values()) totalB += q;

  const total = Math.max(totalA, totalB);
  return { score: total > 0 ? matched / total : 0 };
}

/** Build RB→BL color map from rb_colors.external_ids */
async function buildRbToBlColorMap(
  supabase: SupabaseClient
): Promise<Map<number, number>> {
  const map = new Map<number, number>();
  let offset = 0;
  const pageSize = 1000;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase
      .from('rb_colors')
      .select('id, external_ids')
      .not('external_ids', 'is', null)
      .range(offset, offset + pageSize - 1);
    if (error || !data || data.length === 0) break;
    for (const row of data) {
      const ext = row.external_ids as Record<string, unknown> | null;
      if (!ext) continue;
      const bl = ext.BrickLink as Record<string, unknown> | undefined;
      if (!bl) continue;
      const ids = bl.ext_ids as number[] | undefined;
      if (Array.isArray(ids) && ids.length > 0 && typeof ids[0] === 'number') {
        map.set(row.id, ids[0]);
      }
    }
    if (data.length < pageSize) break;
    offset += pageSize;
  }
  return map;
}

/**
 * Match unmapped minifigs using set-based (tier-1) and fingerprint (tier-2) methods.
 * Runs after inventory_minifigs ingest to pick up newly-added minifigs.
 */
async function matchUnmappedMinifigs(supabase: SupabaseClient): Promise<void> {
  log('Matching unmapped minifigs...');

  // 1. Get unmapped minifigs
  const { data: unmapped, error: unmapErr } = await supabase
    .from('rb_minifigs')
    .select('fig_num')
    .is('bl_minifig_id', null);

  if (unmapErr) {
    log(`  Error fetching unmapped minifigs: ${unmapErr.message}`);
    return;
  }
  if (!unmapped || unmapped.length === 0) {
    log('  No unmapped minifigs found');
    return;
  }
  log(`  Found ${unmapped.length} unmapped minifigs`);

  // 2. Tier-1: Set-based matching with process of elimination
  const tier1Matches = await matchTier1(supabase);
  log(`  Tier-1: matched ${tier1Matches} minifigs via set-based matching`);

  // 3. Tier-2: Fingerprint comparison
  const colorMap = await buildRbToBlColorMap(supabase);
  const tier2Matches = await matchTier2(supabase, colorMap);
  log(`  Tier-2: matched ${tier2Matches} minifigs via fingerprinting`);

  log(
    `  Total: matched ${tier1Matches + tier2Matches} previously-unmapped minifigs`
  );
}

/**
 * Tier-1: Set-based matching.
 * For each set with BL data, if exactly 1 unmatched RB fig and 1 unmatched BL fig → match.
 * Iterates until no new matches found (process of elimination).
 */
async function matchTier1(supabase: SupabaseClient): Promise<number> {
  // Get all sets that have BL minifig data
  const { data: blSets } = await supabase
    .from('bl_set_minifigs')
    .select('set_num, minifig_no');
  if (!blSets || blSets.length === 0) return 0;

  // Group BL minifigs by set
  const blMinifigsBySet = new Map<string, string[]>();
  for (const row of blSets) {
    const list = blMinifigsBySet.get(row.set_num) ?? [];
    list.push(row.minifig_no);
    blMinifigsBySet.set(row.set_num, list);
  }

  // Get RB set → minifig mapping for sets that have BL data
  const setNums = Array.from(blMinifigsBySet.keys());
  const rbMinifigsBySet = new Map<string, string[]>();

  // Query in batches of 200 (Supabase URL limit)
  for (let i = 0; i < setNums.length; i += 200) {
    const batch = setNums.slice(i, i + 200);
    const { data: inventories } = await supabase
      .from('rb_inventories')
      .select('id, set_num')
      .in('set_num', batch);
    if (!inventories || inventories.length === 0) continue;

    const invIds = inventories.map(inv => inv.id);
    for (let j = 0; j < invIds.length; j += 200) {
      const invBatch = invIds.slice(j, j + 200);
      const { data: invMinifigs } = await supabase
        .from('rb_inventory_minifigs')
        .select('inventory_id, fig_num')
        .in('inventory_id', invBatch);
      if (!invMinifigs) continue;

      // Map inventory_id → set_num
      const invToSet = new Map<number, string>();
      for (const inv of inventories) {
        if (inv.set_num) invToSet.set(inv.id, inv.set_num);
      }

      for (const row of invMinifigs) {
        const setNum = invToSet.get(row.inventory_id);
        if (!setNum) continue;
        const list = rbMinifigsBySet.get(setNum) ?? [];
        list.push(row.fig_num);
        rbMinifigsBySet.set(setNum, list);
      }
    }
  }

  // Get currently matched fig_nums and bl_ids
  const matchedRb = new Set<string>();
  const matchedBl = new Set<string>();
  let offset = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data } = await supabase
      .from('rb_minifigs')
      .select('fig_num, bl_minifig_id')
      .not('bl_minifig_id', 'is', null)
      .range(offset, offset + 999);
    if (!data || data.length === 0) break;
    for (const row of data) {
      matchedRb.add(row.fig_num);
      if (row.bl_minifig_id) matchedBl.add(row.bl_minifig_id);
    }
    if (data.length < 1000) break;
    offset += 1000;
  }

  let totalMatched = 0;
  let changed = true;

  while (changed) {
    changed = false;
    for (const [setNum, rbFigs] of rbMinifigsBySet) {
      const blFigs = blMinifigsBySet.get(setNum) ?? [];

      const unmatchedRb = rbFigs.filter(f => !matchedRb.has(f));
      const unmatchedBl = blFigs.filter(f => !matchedBl.has(f));

      if (unmatchedRb.length === 1 && unmatchedBl.length === 1) {
        const rbFig = unmatchedRb[0]!;
        const blFig = unmatchedBl[0]!;

        // Update rb_minifigs with the match
        const { error } = await supabase
          .from('rb_minifigs')
          .update({
            bl_minifig_id: blFig,
            bl_mapping_confidence: 1.0,
            bl_mapping_source:
              totalMatched === 0 ? 'tier1_single_set' : 'tier1_elimination',
          })
          .eq('fig_num', rbFig);

        if (!error) {
          matchedRb.add(rbFig);
          matchedBl.add(blFig);
          totalMatched++;
          changed = true;
        }
      }
    }
  }

  return totalMatched;
}

/**
 * Tier-2: Fingerprint-based matching.
 * Builds part composition fingerprints for unmatched RB minifigs, then compares
 * against BL minifig parts data for candidates from the same sets.
 */
async function matchTier2(
  supabase: SupabaseClient,
  rbToBlColor: Map<number, number>
): Promise<number> {
  // Get still-unmapped minifigs
  const { data: unmapped } = await supabase
    .from('rb_minifigs')
    .select('fig_num')
    .is('bl_minifig_id', null);
  if (!unmapped || unmapped.length === 0) return 0;

  // Build BL part ID map from rb_parts
  const blPartMap = new Map<string, string>();
  let partOffset = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data } = await supabase
      .from('rb_parts')
      .select('part_num, bl_part_id')
      .not('bl_part_id', 'is', null)
      .range(partOffset, partOffset + 999);
    if (!data || data.length === 0) break;
    for (const row of data) {
      if (row.bl_part_id) blPartMap.set(row.part_num, row.bl_part_id);
    }
    if (data.length < 1000) break;
    partOffset += 1000;
  }

  let matched = 0;
  const matchedBl = new Set<string>();

  // Pre-fetch matched BL IDs to avoid re-matching
  let mOffset = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data } = await supabase
      .from('rb_minifigs')
      .select('bl_minifig_id')
      .not('bl_minifig_id', 'is', null)
      .range(mOffset, mOffset + 999);
    if (!data || data.length === 0) break;
    for (const row of data) {
      if (row.bl_minifig_id) matchedBl.add(row.bl_minifig_id);
    }
    if (data.length < 1000) break;
    mOffset += 1000;
  }

  for (const { fig_num } of unmapped) {
    // Get RB minifig's inventory parts
    const { data: inventories } = await supabase
      .from('rb_inventories')
      .select('id')
      .eq('set_num', fig_num)
      .limit(1);
    if (!inventories || inventories.length === 0) continue;

    const invId = inventories[0]!.id;
    const { data: rbParts } = await supabase
      .from('rb_inventory_parts')
      .select('part_num, color_id, quantity')
      .eq('inventory_id', invId)
      .eq('is_spare', false);
    if (!rbParts || rbParts.length === 0) continue;

    // Translate RB parts → BL fingerprint
    const rbFingerprint: FingerprintPart[] = [];
    for (const p of rbParts) {
      const blPartId = blPartMap.get(p.part_num) ?? p.part_num; // same-by-default
      const blColorId = rbToBlColor.get(p.color_id);
      if (blColorId == null) continue; // skip parts without color mapping
      rbFingerprint.push({ blPartId, blColorId, quantity: p.quantity ?? 1 });
    }
    if (rbFingerprint.length === 0) continue;

    // Find sets this minifig appears in via rb_inventory_minifigs
    const { data: invMinifigs } = await supabase
      .from('rb_inventory_minifigs')
      .select('inventory_id')
      .eq('fig_num', fig_num);
    if (!invMinifigs || invMinifigs.length === 0) continue;

    const invIds = invMinifigs.map(im => im.inventory_id);
    const { data: setInventories } = await supabase
      .from('rb_inventories')
      .select('set_num')
      .in('id', invIds.slice(0, 200));
    if (!setInventories || setInventories.length === 0) continue;

    const setNums = Array.from(
      new Set(setInventories.map(s => s.set_num).filter(Boolean) as string[])
    ).filter(s => !s.startsWith('fig-'));

    // Get candidate BL minifigs from those sets
    const candidates = new Set<string>();
    for (let i = 0; i < setNums.length; i += 200) {
      const batch = setNums.slice(i, i + 200);
      const { data: blSetMinifigs } = await supabase
        .from('bl_set_minifigs')
        .select('minifig_no')
        .in('set_num', batch);
      if (blSetMinifigs) {
        for (const row of blSetMinifigs) {
          if (!matchedBl.has(row.minifig_no)) candidates.add(row.minifig_no);
        }
      }

      // CMF fallback: try base set (-1) for numbered variants
      const cmfFallbacks: string[] = [];
      for (const sn of batch) {
        const dashIdx = sn.lastIndexOf('-');
        if (dashIdx > 0) {
          const suffix = sn.slice(dashIdx + 1);
          if (/^\d+$/.test(suffix) && parseInt(suffix) > 1) {
            cmfFallbacks.push(sn.slice(0, dashIdx) + '-1');
          }
        }
      }
      if (cmfFallbacks.length > 0) {
        const { data: cmfMinifigs } = await supabase
          .from('bl_set_minifigs')
          .select('minifig_no')
          .in('set_num', cmfFallbacks);
        if (cmfMinifigs) {
          for (const row of cmfMinifigs) {
            if (!matchedBl.has(row.minifig_no)) candidates.add(row.minifig_no);
          }
        }
      }
    }
    if (candidates.size === 0) continue;

    // Compare against each candidate's BL fingerprint
    let bestMatch = { blId: '', score: 0, matchedParts: 0, totalParts: 0 };
    for (const blId of candidates) {
      const { data: blParts } = await supabase
        .from('bl_minifig_parts')
        .select('bl_part_id, bl_color_id, quantity')
        .eq('bl_minifig_no', blId);
      if (!blParts || blParts.length === 0) continue;

      const blFingerprint: FingerprintPart[] = blParts.map(p => ({
        blPartId: p.bl_part_id,
        blColorId: p.bl_color_id,
        quantity: p.quantity ?? 1,
      }));

      const result = compareFingerprints(rbFingerprint, blFingerprint);
      if (result.score > bestMatch.score) {
        bestMatch = { blId, ...result };
      }
    }

    // Apply match based on confidence thresholds
    let confidence: number | null = null;
    let method: string | null = null;

    if (bestMatch.score >= 0.95 && bestMatch.blId) {
      confidence = 0.95;
      method = 'tier2_exact';
    } else if (bestMatch.score >= 0.7 && bestMatch.blId) {
      const { data: blParts } = await supabase
        .from('bl_minifig_parts')
        .select('bl_part_id, bl_color_id, quantity')
        .eq('bl_minifig_no', bestMatch.blId);
      const blFp: FingerprintPart[] = (blParts ?? []).map(p => ({
        blPartId: p.bl_part_id,
        blColorId: p.bl_color_id,
        quantity: p.quantity ?? 1,
      }));
      const partsOnly = compareFingerprintsPartsOnly(rbFingerprint, blFp);

      if (bestMatch.score >= 0.8) {
        confidence = 0.8 + (bestMatch.score - 0.8) * 0.75;
        method = 'tier2_overlap';
      } else if (partsOnly.score >= 0.75) {
        confidence = 0.7 + (bestMatch.score - 0.7) * 0.5;
        method = 'tier2_fuzzy';
      }
    }

    if (confidence != null && method && bestMatch.blId) {
      const { error } = await supabase
        .from('rb_minifigs')
        .update({
          bl_minifig_id: bestMatch.blId,
          bl_mapping_confidence: confidence,
          bl_mapping_source: method,
        })
        .eq('fig_num', fig_num);

      if (!error) {
        matchedBl.add(bestMatch.blId);
        matched++;
      }
    }
  }

  return matched;
}

async function main() {
  const supabaseUrl = getEnv('NEXT_PUBLIC_SUPABASE_URL');
  const supabaseServiceRoleKey = getEnv('SUPABASE_SERVICE_ROLE_KEY');

  const supabase = createClient<Database>(supabaseUrl, supabaseServiceRoleKey);
  const forceConfig = parseForceArg(process.argv);

  const downloads = await getDownloadUrls();

  for (const info of downloads) {
    // Version key incorporates Last-Modified from CDN so re-runs detect
    // catalog updates automatically. Falls back to PIPELINE_VERSION only
    // when HEAD request failed (lastModified undefined).
    const versionKey = info.lastModified
      ? `${PIPELINE_VERSION}#${info.lastModified}`
      : `${info.url}#${PIPELINE_VERSION}`;
    const currentVersion = await readCurrentVersion(supabase, info.source);
    const isForced =
      forceConfig.all || forceConfig.sources.has(info.source as SourceKey);

    if (isForced) {
      log(`Forcing ingest for ${info.source} (version ${versionKey}).`);
    } else if (currentVersion === versionKey) {
      log(
        `Skipping ${info.source}, version already ingested (version ${versionKey}).`
      );
      continue;
    } else if (currentVersion) {
      log(
        `Catalog updated for ${info.source}: ${currentVersion} → ${versionKey}`
      );
    }

    const stream = await downloadAndDecompress(info.url);

    if (info.source === 'themes') {
      await ingestThemes(supabase, stream);
    } else if (info.source === 'colors') {
      await ingestColors(supabase, stream);
      await enrichColorExternalIds(supabase);
    } else if (info.source === 'part_categories') {
      await ingestPartCategories(supabase, stream);
    } else if (info.source === 'parts') {
      await ingestParts(supabase, stream);
      await enrichPartExternalIds(supabase);
    } else if (info.source === 'sets') {
      await ingestSets(supabase, stream);
    } else if (info.source === 'minifigs') {
      await ingestMinifigs(supabase, stream);
      await enrichMinifigImages(supabase);
    } else if (info.source === 'inventories') {
      await ingestInventories(supabase, stream);
    } else if (info.source === 'inventory_parts') {
      await ingestInventoryParts(supabase, stream);
    } else if (info.source === 'inventory_minifigs') {
      await ingestInventoryMinifigs(supabase, stream);
      await matchUnmappedMinifigs(supabase);
      await materializeMinifigParts(supabase);
    }

    await updateVersion(supabase, info.source, versionKey);
    log(`Finished ingest for ${info.source} (stored version ${versionKey}).`);
  }

  // Standalone minifig matching (can be triggered independently with --match-minifigs)
  if (process.argv.includes('--match-minifigs')) {
    await matchUnmappedMinifigs(supabase);
  }

  log('All ingestion tasks complete.');
}

// Allow running via `npm run ingest:rebrickable`
main().catch(error => {
  // Sanitize error to avoid leaking credentials in logs
  const message = error instanceof Error ? error.message : String(error);
  // eslint-disable-next-line no-console
  console.error('Ingestion failed:', message);
  process.exitCode = 1;
});
