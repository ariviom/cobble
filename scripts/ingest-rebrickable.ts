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
};

// Pipeline salt to force re-ingest when downstream schema/logic changes
// even if the source URLs stay the same. Bump this to invalidate cache.
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

async function getDownloadUrls(): Promise<DownloadInfo[]> {
  // For now, assume fixed URLs from the Rebrickable downloads page.
  // These may change; keeping them centralized here makes updates easy.
  // We intentionally do not depend on the timestamp query param for basic ingestion;
  // version tracking happens via rb_download_versions.

  const base = 'https://cdn.rebrickable.com/media/downloads';

  return [
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
 * Enrich rb_parts with external_ids from the Rebrickable API.
 *
 * The CSV doesn't include external_ids (BrickLink part mappings), so we
 * fetch them from the API after CSV ingestion. Only stores external_ids
 * for parts where the BrickLink ID differs from the Rebrickable ID (~2%).
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

      // Check if BrickLink IDs differ from part_num
      const blIds = part.external_ids['BrickLink'] as string[] | undefined;
      if (!blIds || blIds.length === 0) continue;

      // If any BL ID differs from the RB part_num, store external_ids
      const hasDifferentId = blIds.some(id => id !== part.part_num);
      if (hasDifferentId) {
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

  // Batch upsert exceptions
  const batchSize = 500;
  let updated = 0;
  for (let i = 0; i < exceptions.length; i += batchSize) {
    const chunk = exceptions.slice(i, i + batchSize);
    const { error } = await supabase.from('rb_parts').upsert(
      chunk.map(e => ({
        part_num: e.part_num,
        name: e.name,
        external_ids: e.external_ids,
      }))
    );
    if (error) {
      log(`Failed to upsert part external_ids batch: ${error.message}`);
    } else {
      updated += chunk.length;
    }
  }

  log(`Enriched ${updated} parts with external_ids (exceptions only)`);
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

async function main() {
  const supabaseUrl = getEnv('NEXT_PUBLIC_SUPABASE_URL');
  const supabaseServiceRoleKey = getEnv('SUPABASE_SERVICE_ROLE_KEY');

  const supabase = createClient<Database>(supabaseUrl, supabaseServiceRoleKey);
  const forceConfig = parseForceArg(process.argv);

  const downloads = await getDownloadUrls();

  for (const info of downloads) {
    const versionKey = `${info.url}#${PIPELINE_VERSION}`;
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
    } else if (info.source === 'inventories') {
      await ingestInventories(supabase, stream);
    } else if (info.source === 'inventory_parts') {
      await ingestInventoryParts(supabase, stream);
    } else if (info.source === 'inventory_minifigs') {
      await ingestInventoryMinifigs(supabase, stream);
    }

    await updateVersion(supabase, info.source, versionKey);
    log(`Finished ingest for ${info.source} (stored version ${versionKey}).`);
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
