import { createClient } from '@supabase/supabase-js';
import { parse } from 'csv-parse';
import dotenv from 'dotenv';
import crypto from 'node:crypto';
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

// =============================================================================
// BrickLink API helpers (inline — no app/lib/bricklink.ts import to avoid
// server-only / LRU cache / price-layer dependencies)
// =============================================================================

const BL_STORE_BASE = 'https://api.bricklink.com/api/store/v1';

type RateState = { lastCallAt: number; callsThisRun: number };

function blRfc3986Encode(str: string): string {
  return encodeURIComponent(str).replace(
    /[!'()*]/g,
    c => '%' + c.charCodeAt(0).toString(16).toUpperCase()
  );
}

function buildBlOAuthHeader(method: string, url: string): string {
  const consumerKey = getEnv('BRICKLINK_CONSUMER_KEY');
  const consumerSecret = getEnv('BRICKLINK_CONSUMER_SECRET');
  const token = getEnv('BRICKLINK_TOKEN_VALUE');
  const tokenSecret =
    process.env.BRICKLINK_TOKEN_SECRET ??
    process.env.BRICLINK_TOKEN_SECRET ??
    '';
  if (!tokenSecret) {
    throw new Error(
      'Missing BRICKLINK_TOKEN_SECRET (or BRICLINK_TOKEN_SECRET fallback)'
    );
  }

  const oauthParams: Record<string, string> = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: token,
    oauth_version: '1.0',
  };

  const sigParams: Record<string, string> = { ...oauthParams };
  const norm = Object.keys(sigParams)
    .sort()
    .map(k => `${blRfc3986Encode(k)}=${blRfc3986Encode(sigParams[k]!)}`)
    .join('&');
  const baseString = [
    method.toUpperCase(),
    blRfc3986Encode(url),
    blRfc3986Encode(norm),
  ].join('&');
  const signingKey = `${blRfc3986Encode(consumerSecret)}&${blRfc3986Encode(tokenSecret)}`;
  const signature = crypto
    .createHmac('sha1', signingKey)
    .update(baseString)
    .digest('base64');

  const headerParams: Record<string, string> = {
    ...oauthParams,
    oauth_signature: signature,
  };
  return (
    'OAuth ' +
    Object.keys(headerParams)
      .sort()
      .map(k => `${blRfc3986Encode(k)}="${blRfc3986Encode(headerParams[k]!)}"`)
      .join(', ')
  );
}

async function blIngestFetch<T>(
  endpoint: string,
  rateState: RateState
): Promise<T> {
  const now = Date.now();
  const delay = Math.max(0, 500 - (now - rateState.lastCallAt));
  if (delay > 0) await new Promise(r => setTimeout(r, delay));

  const url = `${BL_STORE_BASE}${endpoint}`;
  const res = await fetch(url, {
    headers: { Authorization: buildBlOAuthHeader('GET', url) },
  });
  rateState.lastCallAt = Date.now();
  rateState.callsThisRun++;

  if (!res.ok) {
    throw new Error(`BL API ${endpoint}: ${res.status} ${res.statusText}`);
  }
  const body = (await res.json()) as { meta: { code: number }; data: T };
  if (body.meta.code !== 200) {
    throw new Error(`BL API ${endpoint}: meta.code=${body.meta.code}`);
  }
  return body.data;
}

function parseBLBudgetArg(argv: string[]): number {
  const arg = argv.find(a => a.startsWith('--bl-budget='));
  if (!arg) return 500;
  const val = parseInt(arg.split('=')[1] ?? '', 10);
  return Number.isNaN(val) ? 500 : val;
}

// Normalized entry from a BL subsets response
type BlSubsetEntry = {
  item: { no: string; type: string; name?: string };
  color_id?: number;
  quantity: number;
};

/** Flatten BL subsets response (array of `{ entries: [...] }` groups) */
function normalizeBlSubsetEntries(data: unknown[]): BlSubsetEntry[] {
  const result: BlSubsetEntry[] = [];
  for (const group of data) {
    if (
      group &&
      typeof group === 'object' &&
      'entries' in group &&
      Array.isArray((group as { entries?: unknown[] }).entries)
    ) {
      for (const entry of (group as { entries: unknown[] }).entries) {
        if (
          entry &&
          typeof entry === 'object' &&
          'item' in entry &&
          (entry as BlSubsetEntry).item?.no
        ) {
          result.push(entry as BlSubsetEntry);
        }
      }
    }
  }
  return result;
}

// =============================================================================

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
      is_trans: (() => {
        const v = String(record.is_trans ?? '')
          .trim()
          .toLowerCase();
        return v === 't' || v === 'true' || v === '1';
      })(),
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

  // Track inventories whose old rows have been deleted so stale rows
  // (e.g. parts reclassified between spare/non-spare upstream) are removed.
  const cleanedInventories = new Set<number>();

  const flush = async () => {
    if (batchMap.size === 0) return;
    const rows = Array.from(batchMap.values());

    // Delete stale rows for any inventory we haven't cleaned yet in this run.
    const newIds = [
      ...new Set(
        rows
          .map(r => r.inventory_id)
          .filter(
            (id): id is number => id != null && !cleanedInventories.has(id)
          )
      ),
    ];
    for (let i = 0; i < newIds.length; i += 200) {
      const chunk = newIds.slice(i, i + 200);
      const { error } = await supabase
        .from('rb_inventory_parts')
        .delete()
        .in('inventory_id', chunk);
      if (error) throw error;
      for (const id of chunk) cleanedInventories.add(id);
    }

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

    const isSpareRaw = String(record.is_spare ?? '')
      .trim()
      .toLowerCase();
    const is_spare =
      isSpareRaw === 't' || isSpareRaw === 'true' || isSpareRaw === '1';
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

  // Track inventories whose old rows have been deleted so stale rows are removed.
  const cleanedInventories = new Set<number>();

  const flush = async () => {
    if (batch.length === 0) return;

    // Delete stale rows for any inventory we haven't cleaned yet in this run.
    const newIds = [
      ...new Set(
        batch
          .map(r => r.inventory_id)
          .filter(
            (id): id is number => id != null && !cleanedInventories.has(id)
          )
      ),
    ];
    for (let i = 0; i < newIds.length; i += 200) {
      const chunk = newIds.slice(i, i + 200);
      const { error } = await supabase
        .from('rb_inventory_minifigs')
        .delete()
        .in('inventory_id', chunk);
      if (error) throw error;
      for (const id of chunk) cleanedInventories.add(id);
    }

    const { error } = await supabase
      .from('rb_inventory_minifigs')
      .upsert(batch);
    if (error) throw error;
    batch.length = 0;
  };

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
      await flush();
    }
  }

  await flush();
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
// Part Rarity Materialization
// ===========================================================================

async function materializePartRarity(
  supabase: ReturnType<typeof createClient<Database>>
): Promise<void> {
  log('Materializing rb_part_rarity + rb_minifig_rarity...');

  // Primary path: single atomic SQL via exec_sql RPC
  const { error } = await supabase.rpc(
    'exec_sql' as never,
    {
      query: `
      -- Part rarity: count distinct sets per part+color
      TRUNCATE public.rb_part_rarity;
      INSERT INTO public.rb_part_rarity (part_num, color_id, set_count)
      SELECT part_num, color_id, COUNT(DISTINCT set_num)
      FROM (
        -- Direct parts in sets
        SELECT rip.part_num, rip.color_id, ri.set_num
        FROM public.rb_inventory_parts rip
        JOIN public.rb_inventories ri ON ri.id = rip.inventory_id
        WHERE ri.set_num NOT LIKE 'fig-%' AND rip.is_spare = false
        UNION
        -- Parts via minifigs
        SELECT rmp.part_num, rmp.color_id, ri.set_num
        FROM public.rb_minifig_parts rmp
        JOIN public.rb_inventory_minifigs rim ON rim.fig_num = rmp.fig_num
        JOIN public.rb_inventories ri ON ri.id = rim.inventory_id
        WHERE ri.set_num NOT LIKE 'fig-%'
      ) all_parts
      GROUP BY part_num, color_id;

      -- Minifig rarity: min subpart set_count + actual minifig set membership count
      TRUNCATE public.rb_minifig_rarity;
      INSERT INTO public.rb_minifig_rarity (fig_num, min_subpart_set_count, set_count)
      SELECT
        sub.fig_num,
        sub.min_subpart_set_count,
        COALESCE(mem.set_count, 0)
      FROM (
        -- Rarest subpart per minifig
        SELECT rmp.fig_num, MIN(rpr.set_count) AS min_subpart_set_count
        FROM public.rb_minifig_parts rmp
        JOIN public.rb_part_rarity rpr
          ON rpr.part_num = rmp.part_num AND rpr.color_id = rmp.color_id
        GROUP BY rmp.fig_num
      ) sub
      LEFT JOIN (
        -- Actual set membership count per minifig
        SELECT rim.fig_num, COUNT(DISTINCT ri.set_num) AS set_count
        FROM public.rb_inventory_minifigs rim
        JOIN public.rb_inventories ri ON ri.id = rim.inventory_id
        WHERE ri.set_num NOT LIKE 'fig-%'
        GROUP BY rim.fig_num
      ) mem ON mem.fig_num = sub.fig_num;
    `,
    } as never
  );

  if (error) {
    log(
      `exec_sql rpc failed for rarity materialization: ${error.message}. Using chunked fallback...`
    );
    await materializePartRarityChunked(supabase);
    return;
  }

  log('Materialized rb_part_rarity + rb_minifig_rarity via SQL.');
}

/**
 * Paginated fetch helper — Supabase PostgREST defaults to 1000 rows per query.
 * Fetches all rows by paging with `.range()`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchAllRows<T>(builder: any, pageSize = 1000): Promise<T[]> {
  const all: T[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await builder.range(offset, offset + pageSize - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    all.push(...(data as T[]));
    if (data.length < pageSize) break; // last page
    offset += pageSize;
  }
  return all;
}

async function materializePartRarityChunked(
  supabase: ReturnType<typeof createClient<Database>>
): Promise<void> {
  // Step 1: Fetch ALL non-fig inventories (paginated to avoid 1000-row default limit)
  const inventories = await fetchAllRows<{ id: number; set_num: string }>(
    supabase
      .from('rb_inventories')
      .select('id, set_num')
      .not('set_num', 'like', 'fig-%')
  );

  if (inventories.length === 0) {
    log('No set inventories found, skipping rarity materialization.');
    return;
  }

  log(
    `Fetched ${inventories.length} non-fig inventories for rarity computation.`
  );

  // Build inventory ID → set_num lookup
  const invToSet = new Map<number, string>();
  for (const inv of inventories) {
    if (inv.set_num) invToSet.set(inv.id, inv.set_num);
  }

  // Step 2: Aggregate direct parts → set counts
  // Map<"part_num:color_id", Set<set_num>>
  const partSets = new Map<string, Set<string>>();
  const batchSize = 200;
  const invIds = Array.from(invToSet.keys());

  log(`Processing ${invIds.length} inventories for direct parts...`);
  for (let i = 0; i < invIds.length; i += batchSize) {
    const chunk = invIds.slice(i, i + batchSize);
    const parts = await fetchAllRows<{
      inventory_id: number;
      part_num: string;
      color_id: number;
    }>(
      supabase
        .from('rb_inventory_parts')
        .select('inventory_id, part_num, color_id')
        .in('inventory_id', chunk)
        .eq('is_spare', false)
    );

    for (const p of parts) {
      const setNum = invToSet.get(p.inventory_id);
      if (!setNum) continue;
      const key = `${p.part_num}:${p.color_id}`;
      if (!partSets.has(key)) partSets.set(key, new Set());
      partSets.get(key)!.add(setNum);
    }
  }

  // Step 3: Add parts via minifigs
  // Also accumulate minifig → set membership for set_count in rb_minifig_rarity
  const minifigMemberSets = new Map<string, Set<string>>();
  log(`Processing ${invIds.length} inventories for minifig subparts...`);
  for (let i = 0; i < invIds.length; i += batchSize) {
    const chunk = invIds.slice(i, i + batchSize);
    const minifigs = await fetchAllRows<{
      inventory_id: number;
      fig_num: string;
    }>(
      supabase
        .from('rb_inventory_minifigs')
        .select('inventory_id, fig_num')
        .in('inventory_id', chunk)
    );

    // Collect fig_nums with their sets
    const figSets = new Map<string, Set<string>>();
    for (const mf of minifigs) {
      const setNum = invToSet.get(mf.inventory_id);
      if (!setNum) continue;
      if (!figSets.has(mf.fig_num)) figSets.set(mf.fig_num, new Set());
      figSets.get(mf.fig_num)!.add(setNum);
      // Also accumulate into global minifig membership map
      if (!minifigMemberSets.has(mf.fig_num))
        minifigMemberSets.set(mf.fig_num, new Set());
      minifigMemberSets.get(mf.fig_num)!.add(setNum);
    }

    // For each fig, get its subparts and add set membership
    const figNums = Array.from(figSets.keys());
    for (let j = 0; j < figNums.length; j += batchSize) {
      const figChunk = figNums.slice(j, j + batchSize);
      const subparts = await fetchAllRows<{
        fig_num: string;
        part_num: string;
        color_id: number;
      }>(
        supabase
          .from('rb_minifig_parts')
          .select('fig_num, part_num, color_id')
          .in('fig_num', figChunk)
      );

      for (const sp of subparts) {
        const sets = figSets.get(sp.fig_num);
        if (!sets) continue;
        const key = `${sp.part_num}:${sp.color_id}`;
        if (!partSets.has(key)) partSets.set(key, new Set());
        for (const s of sets) partSets.get(key)!.add(s);
      }
    }
  }

  // Step 4: Upsert rb_part_rarity
  const rarityRows = Array.from(partSets.entries()).map(([key, sets]) => {
    const [partNum, colorIdStr] = key.split(':');
    return {
      part_num: partNum!,
      color_id: parseInt(colorIdStr!, 10),
      set_count: sets.size,
    };
  });

  log(`Inserting ${rarityRows.length} rows into rb_part_rarity...`);

  // Truncate first — full recompute, not incremental
  await supabase
    .from('rb_part_rarity' as never)
    .delete()
    .neq('set_count' as never, -1 as never);

  for (let i = 0; i < rarityRows.length; i += batchSize) {
    const chunk = rarityRows.slice(i, i + batchSize);
    const { error: upsertErr } = await supabase
      .from('rb_part_rarity' as never)
      .upsert(chunk as never[], { onConflict: 'part_num,color_id' } as never);
    if (upsertErr) throw upsertErr;
  }

  // Step 5: Compute and upsert rb_minifig_rarity
  const allMinifigParts = await fetchAllRows<{
    fig_num: string;
    part_num: string;
    color_id: number;
  }>(supabase.from('rb_minifig_parts').select('fig_num, part_num, color_id'));
  log(
    `Fetched ${allMinifigParts.length} minifig-part rows for minifig rarity.`
  );

  const minifigMin = new Map<string, number>();
  for (const mp of allMinifigParts) {
    const key = `${mp.part_num}:${mp.color_id}`;
    const sc = partSets.get(key)?.size ?? 0;
    const current = minifigMin.get(mp.fig_num);
    if (current === undefined || sc < current) {
      minifigMin.set(mp.fig_num, sc);
    }
  }

  const minifigRows = Array.from(minifigMin.entries()).map(
    ([figNum, minSc]) => ({
      fig_num: figNum,
      min_subpart_set_count: minSc,
      set_count: minifigMemberSets.get(figNum)?.size ?? 0,
    })
  );

  log(`Inserting ${minifigRows.length} rows into rb_minifig_rarity...`);

  // Truncate first — full recompute
  await supabase
    .from('rb_minifig_rarity' as never)
    .delete()
    .neq('min_subpart_set_count' as never, -1 as never);

  for (let i = 0; i < minifigRows.length; i += batchSize) {
    const chunk = minifigRows.slice(i, i + batchSize);
    const { error: upsertErr } = await supabase
      .from('rb_minifig_rarity' as never)
      .upsert(chunk as never[], { onConflict: 'fig_num' } as never);
    if (upsertErr) throw upsertErr;
  }

  log(
    `Materialized ${rarityRows.length} part rarity + ${minifigRows.length} minifig rarity rows (chunked).`
  );
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
 * Crawl BL for sets that have RB minifigs but are missing from bl_set_minifigs.
 * Uses up to `budget` BL API calls (shared via rateState with other crawl functions).
 */
async function refreshBlSetMinifigs(
  supabase: SupabaseClient,
  rateState: RateState,
  budget: number
): Promise<number> {
  // Step 1: Get all set_nums already in bl_set_minifigs (deduplicated)
  const existingBlRows = await fetchAllRows<{ set_num: string }>(
    supabase.from('bl_set_minifigs').select('set_num')
  );
  const existingBlSetNums = new Set(existingBlRows.map(r => r.set_num));

  // Step 2: Get all non-fig RB inventories
  const rbInventories = await fetchAllRows<{ id: number; set_num: string }>(
    supabase
      .from('rb_inventories')
      .select('id, set_num')
      .not('set_num', 'like', 'fig-%')
  );

  // Step 3: Find inventories whose set_num is not yet in bl_set_minifigs
  const candidateInvs = rbInventories.filter(
    inv => inv.set_num && !existingBlSetNums.has(inv.set_num)
  );
  if (candidateInvs.length === 0) {
    log('  BL crawl: no new sets need bl_set_minifigs data');
    return 0;
  }

  // Step 4: Check which candidate inventories actually have RB minifigs
  const invIdToSetNum = new Map<number, string>();
  for (const inv of candidateInvs) {
    invIdToSetNum.set(inv.id, inv.set_num);
  }
  const setNumsWithMinifigs = new Set<string>();
  const candidateIds = Array.from(invIdToSetNum.keys());

  for (let i = 0; i < candidateIds.length; i += 200) {
    const batch = candidateIds.slice(i, i + 200);
    const { data } = await supabase
      .from('rb_inventory_minifigs')
      .select('inventory_id')
      .in('inventory_id', batch);
    if (data) {
      for (const row of data) {
        const setNum = invIdToSetNum.get(row.inventory_id);
        if (setNum) setNumsWithMinifigs.add(setNum);
      }
    }
  }

  const missingSetNums = Array.from(setNumsWithMinifigs);
  if (missingSetNums.length === 0) {
    log('  BL crawl: no new sets with minifigs found');
    return 0;
  }
  log(`  BL crawl: ${missingSetNums.length} sets need bl_set_minifigs data`);

  let crawled = 0;
  for (const setNum of missingSetNums) {
    if (budget !== 0 && rateState.callsThisRun >= budget) break;

    try {
      const data = await blIngestFetch<unknown[]>(
        `/items/SET/${encodeURIComponent(setNum)}/subsets`,
        rateState
      );
      const entries = normalizeBlSubsetEntries(data).filter(
        e => e.item?.type === 'MINIFIG'
      );

      // Always upsert something so this set is not retried on the next run.
      // If BL returned no minifigs, insert a sentinel row (minifig_no='__none__')
      // that the matching logic skips.
      const upsertRows =
        entries.length > 0
          ? entries.map(e => ({
              set_num: setNum,
              minifig_no: e.item.no,
              bl_name: e.item.name ?? null,
              quantity: e.quantity ?? 1,
            }))
          : [
              {
                set_num: setNum,
                minifig_no: '__none__',
                bl_name: null,
                quantity: 0,
              },
            ];

      const { error } = await supabase
        .from('bl_set_minifigs')
        .upsert(upsertRows, { onConflict: 'set_num,minifig_no' });
      if (error) {
        log(
          `  BL crawl: error upserting bl_set_minifigs for ${setNum}: ${error.message}`
        );
      }
      crawled++;
    } catch (err) {
      log(
        `  BL crawl: error fetching subsets for ${setNum}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  log(`  BL crawl: refreshed ${crawled} new sets in bl_set_minifigs`);
  return crawled;
}

/**
 * Crawl BL for minifig part compositions missing from bl_minifig_parts.
 * Finds all BL minifig IDs in bl_set_minifigs that have no rows in bl_minifig_parts.
 */
async function crawlMissingBlMinifigParts(
  supabase: SupabaseClient,
  rateState: RateState,
  budget: number
): Promise<number> {
  // Get all distinct minifig_nos from bl_set_minifigs
  const allSetMinifigRows = await fetchAllRows<{ minifig_no: string }>(
    supabase.from('bl_set_minifigs').select('minifig_no')
  );
  // Exclude sentinel rows inserted when a set had no BL minifigs
  const allBlMinifigNos = new Set(
    allSetMinifigRows.map(r => r.minifig_no).filter(id => id !== '__none__')
  );

  // Get all distinct bl_minifig_nos already in bl_minifig_parts
  const crawledRows = await fetchAllRows<{ bl_minifig_no: string }>(
    supabase.from('bl_minifig_parts').select('bl_minifig_no')
  );
  const crawledMinifigNos = new Set(crawledRows.map(r => r.bl_minifig_no));

  // Missing = in bl_set_minifigs but not in bl_minifig_parts
  const missing = Array.from(allBlMinifigNos).filter(
    id => !crawledMinifigNos.has(id)
  );

  if (missing.length === 0) {
    log('  BL crawl: no minifigs need bl_minifig_parts data');
    return 0;
  }
  log(`  BL crawl: ${missing.length} minifigs need bl_minifig_parts data`);

  const now = new Date().toISOString();
  let crawled = 0;

  for (const blId of missing) {
    if (budget !== 0 && rateState.callsThisRun >= budget) break;

    try {
      const data = await blIngestFetch<unknown[]>(
        `/items/MINIFIG/${encodeURIComponent(blId)}/subsets`,
        rateState
      );
      const entries = normalizeBlSubsetEntries(data).filter(
        e => e.item?.type === 'PART'
      );

      // Always upsert something so this minifig is not retried on the next run.
      // If BL returned no parts, insert a sentinel row (bl_part_id='__none__')
      // that fingerprint matching skips.
      const upsertRows =
        entries.length > 0
          ? entries.map(e => ({
              bl_minifig_no: blId,
              bl_part_id: e.item.no,
              bl_color_id: e.color_id ?? 0,
              quantity: e.quantity ?? 1,
              last_refreshed_at: now,
            }))
          : [
              {
                bl_minifig_no: blId,
                bl_part_id: '__none__',
                bl_color_id: 0,
                quantity: 0,
                last_refreshed_at: now,
              },
            ];

      const { error } = await supabase
        .from('bl_minifig_parts')
        .upsert(upsertRows, {
          onConflict: 'bl_minifig_no,bl_part_id,bl_color_id',
        });
      if (error) {
        log(
          `  BL crawl: error upserting bl_minifig_parts for ${blId}: ${error.message}`
        );
      }
      crawled++;
    } catch (err) {
      log(
        `  BL crawl: error fetching parts for ${blId}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  log(`  BL crawl: fetched parts for ${crawled} minifigs`);
  return crawled;
}

/**
 * Match unmapped minifigs using set-based (tier-1) and fingerprint (tier-2) methods.
 * Runs after inventory_minifigs ingest to pick up newly-added minifigs.
 * blBudget: max BL API calls for crawl phase (0 = unlimited, default 500)
 */
async function matchUnmappedMinifigs(
  supabase: SupabaseClient,
  blBudget: number
): Promise<void> {
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

  // 2. BL data refresh: crawl any missing set-minifig and minifig-parts data
  const rateState: RateState = { lastCallAt: 0, callsThisRun: 0 };
  await refreshBlSetMinifigs(supabase, rateState, blBudget);
  await crawlMissingBlMinifigParts(supabase, rateState, blBudget);
  log(`  BL crawl: ${rateState.callsThisRun} total API calls used`);

  // 3. Tier-1: Set-based matching with process of elimination
  const tier1Matches = await matchTier1(supabase);
  log(`  Tier-1: matched ${tier1Matches} minifigs via set-based matching`);

  // 4. Tier-2: Set-scoped fingerprint comparison
  const colorMap = await buildRbToBlColorMap(supabase);
  const tier2Matches = await matchTier2(supabase, colorMap);
  log(
    `  Tier-2: matched ${tier2Matches} minifigs via set-scoped fingerprinting`
  );

  // 5. Tier-2 Global: Fingerprint comparison against all unmatched BL minifigs
  const tier2GlobalMatches = await matchTier2Global(supabase, colorMap);
  log(
    `  Tier-2 Global: matched ${tier2GlobalMatches} minifigs via global fingerprinting`
  );

  const total = tier1Matches + tier2Matches + tier2GlobalMatches;
  log(`  Total: matched ${total} previously-unmapped minifigs`);
}

/**
 * Tier-1: Set-based matching.
 * For each set with BL data, if exactly 1 unmatched RB fig and 1 unmatched BL fig → match.
 * Iterates until no new matches found (process of elimination).
 */
async function matchTier1(supabase: SupabaseClient): Promise<number> {
  // Get all sets that have BL minifig data (paginated — table can exceed 1000 rows)
  // Exclude sentinel rows inserted when BL returned no minifigs for a set.
  const blSets = await fetchAllRows<{ set_num: string; minifig_no: string }>(
    supabase
      .from('bl_set_minifigs')
      .select('set_num, minifig_no')
      .neq('minifig_no', '__none__')
  );
  if (blSets.length === 0) return 0;

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
            matched_at: new Date().toISOString(),
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

// ── Shared helpers for tier-2 matching ──

/** Build RB part_num → BL part_id map (paginated). */
async function buildBlPartMap(
  supabase: SupabaseClient
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const rows = await fetchAllRows<{ part_num: string; bl_part_id: string }>(
    supabase
      .from('rb_parts')
      .select('part_num, bl_part_id')
      .not('bl_part_id', 'is', null)
  );
  for (const row of rows) {
    if (row.bl_part_id) map.set(row.part_num, row.bl_part_id);
  }
  return map;
}

/** Build set of already-matched BL minifig IDs (paginated). */
async function buildMatchedBlSet(
  supabase: SupabaseClient
): Promise<Set<string>> {
  const set = new Set<string>();
  const rows = await fetchAllRows<{ bl_minifig_id: string | null }>(
    supabase
      .from('rb_minifigs')
      .select('bl_minifig_id')
      .not('bl_minifig_id', 'is', null)
  );
  for (const row of rows) {
    if (row.bl_minifig_id) set.add(row.bl_minifig_id);
  }
  return set;
}

/** Build BL-translated fingerprint for an RB minifig. */
async function buildRbFingerprint(
  supabase: SupabaseClient,
  figNum: string,
  blPartMap: Map<string, string>,
  rbToBlColor: Map<number, number>
): Promise<FingerprintPart[]> {
  const { data: inventories } = await supabase
    .from('rb_inventories')
    .select('id')
    .eq('set_num', figNum)
    .limit(1);
  if (!inventories || inventories.length === 0) return [];

  const invId = inventories[0]!.id;
  const { data: rbParts } = await supabase
    .from('rb_inventory_parts')
    .select('part_num, color_id, quantity')
    .eq('inventory_id', invId)
    .eq('is_spare', false);
  if (!rbParts || rbParts.length === 0) return [];

  const fingerprint: FingerprintPart[] = [];
  for (const p of rbParts) {
    const blPartId = blPartMap.get(p.part_num) ?? p.part_num;
    const blColorId = rbToBlColor.get(p.color_id);
    if (blColorId == null) continue;
    fingerprint.push({ blPartId, blColorId, quantity: p.quantity ?? 1 });
  }
  return fingerprint;
}

/** Fetch BL fingerprint for a BL minifig ID. */
async function fetchBlFingerprint(
  supabase: SupabaseClient,
  blId: string
): Promise<FingerprintPart[]> {
  const { data: blParts } = await supabase
    .from('bl_minifig_parts')
    .select('bl_part_id, bl_color_id, quantity')
    .eq('bl_minifig_no', blId)
    .neq('bl_part_id', '__none__');
  if (!blParts || blParts.length === 0) return [];
  return blParts.map(p => ({
    blPartId: p.bl_part_id,
    blColorId: p.bl_color_id,
    quantity: p.quantity ?? 1,
  }));
}

/** Score a best-match candidate and return confidence + method if above threshold. */
function classifyMatch(
  bestScore: number,
  rbFingerprint: FingerprintPart[],
  blFingerprint: FingerprintPart[],
  methodPrefix: string
): { confidence: number; method: string } | null {
  if (bestScore >= 0.95) {
    return {
      confidence: methodPrefix === 'tier2_global' ? 0.9 : 0.95,
      method: `${methodPrefix}_exact`,
    };
  }
  if (bestScore >= 0.7) {
    const partsOnly = compareFingerprintsPartsOnly(
      rbFingerprint,
      blFingerprint
    );
    if (bestScore >= 0.8) {
      return {
        confidence:
          methodPrefix === 'tier2_global'
            ? 0.75 + (bestScore - 0.8) * 0.5
            : 0.8 + (bestScore - 0.8) * 0.75,
        method: `${methodPrefix}_overlap`,
      };
    }
    if (partsOnly.score >= 0.75) {
      return {
        confidence: 0.65 + (bestScore - 0.7) * 0.5,
        method: `${methodPrefix}_fuzzy`,
      };
    }
  }
  return null;
}

/**
 * Tier-2: Fingerprint-based matching (set-scoped).
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

  const blPartMap = await buildBlPartMap(supabase);
  const matchedBl = await buildMatchedBlSet(supabase);
  let matched = 0;

  for (const { fig_num } of unmapped) {
    const rbFingerprint = await buildRbFingerprint(
      supabase,
      fig_num,
      blPartMap,
      rbToBlColor
    );
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
          if (row.minifig_no !== '__none__' && !matchedBl.has(row.minifig_no))
            candidates.add(row.minifig_no);
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
    let bestMatch = { blId: '', score: 0, fp: [] as FingerprintPart[] };
    for (const blId of candidates) {
      const blFp = await fetchBlFingerprint(supabase, blId);
      if (blFp.length === 0) continue;

      const result = compareFingerprints(rbFingerprint, blFp);
      if (result.score > bestMatch.score) {
        bestMatch = { blId, score: result.score, fp: blFp };
      }
    }

    if (!bestMatch.blId) continue;
    const cls = classifyMatch(
      bestMatch.score,
      rbFingerprint,
      bestMatch.fp,
      'tier2'
    );
    if (cls) {
      const { error } = await supabase
        .from('rb_minifigs')
        .update({
          bl_minifig_id: bestMatch.blId,
          bl_mapping_confidence: cls.confidence,
          bl_mapping_source: cls.method,
          matched_at: new Date().toISOString(),
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

/**
 * Tier-2 Global: Fingerprint-based matching against ALL unmatched BL minifigs.
 * Unlike set-scoped tier-2, this loads all BL fingerprints into memory and
 * compares each unmapped RB minifig against the full candidate pool.
 * Lower confidence thresholds since no set-based narrowing.
 */
async function matchTier2Global(
  supabase: SupabaseClient,
  rbToBlColor: Map<number, number>
): Promise<number> {
  // Get still-unmapped minifigs
  const { data: unmapped } = await supabase
    .from('rb_minifigs')
    .select('fig_num')
    .is('bl_minifig_id', null);
  if (!unmapped || unmapped.length === 0) return 0;

  const blPartMap = await buildBlPartMap(supabase);
  const matchedBl = await buildMatchedBlSet(supabase);

  // Pre-load ALL BL fingerprints into memory
  log('    Loading all BL fingerprints for global matching...');
  const allBlParts = await fetchAllRows<{
    bl_minifig_no: string;
    bl_part_id: string;
    bl_color_id: number;
    quantity: number;
  }>(
    supabase
      .from('bl_minifig_parts')
      .select('bl_minifig_no, bl_part_id, bl_color_id, quantity')
  );

  // Group by BL minifig ID, excluding already-matched and sentinel rows
  const blFingerprints = new Map<string, FingerprintPart[]>();
  for (const row of allBlParts) {
    if (matchedBl.has(row.bl_minifig_no)) continue;
    if (row.bl_part_id === '__none__') continue; // sentinel: crawled but no parts
    const fp = blFingerprints.get(row.bl_minifig_no) ?? [];
    fp.push({
      blPartId: row.bl_part_id,
      blColorId: row.bl_color_id,
      quantity: row.quantity ?? 1,
    });
    blFingerprints.set(row.bl_minifig_no, fp);
  }
  log(`    Loaded ${blFingerprints.size} unmatched BL fingerprints`);

  let matched = 0;

  for (const { fig_num } of unmapped) {
    const rbFingerprint = await buildRbFingerprint(
      supabase,
      fig_num,
      blPartMap,
      rbToBlColor
    );
    if (rbFingerprint.length === 0) continue;

    // Compare against every unmatched BL fingerprint
    let bestMatch = { blId: '', score: 0, fp: [] as FingerprintPart[] };
    for (const [blId, blFp] of blFingerprints) {
      const result = compareFingerprints(rbFingerprint, blFp);
      if (result.score > bestMatch.score) {
        bestMatch = { blId, score: result.score, fp: blFp };
      }
    }

    if (!bestMatch.blId) continue;
    const cls = classifyMatch(
      bestMatch.score,
      rbFingerprint,
      bestMatch.fp,
      'tier2_global'
    );
    if (cls) {
      const { error } = await supabase
        .from('rb_minifigs')
        .update({
          bl_minifig_id: bestMatch.blId,
          bl_mapping_confidence: cls.confidence,
          bl_mapping_source: cls.method,
          matched_at: new Date().toISOString(),
        })
        .eq('fig_num', fig_num);

      if (!error) {
        matchedBl.add(bestMatch.blId);
        blFingerprints.delete(bestMatch.blId); // remove from candidates
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
  const blBudget = parseBLBudgetArg(process.argv);

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
      await matchUnmappedMinifigs(supabase, blBudget);
      await materializeMinifigParts(supabase);
      await materializePartRarity(supabase);
    }

    await updateVersion(supabase, info.source, versionKey);
    log(`Finished ingest for ${info.source} (stored version ${versionKey}).`);
  }

  // Standalone minifig matching (can be triggered independently with --match-minifigs)
  if (process.argv.includes('--match-minifigs')) {
    await matchUnmappedMinifigs(supabase, blBudget);
  }

  // Standalone rarity materialization (can be triggered independently with --rarity-only)
  if (process.argv.includes('--rarity-only')) {
    await materializePartRarity(supabase);
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
