/**
 * Ingest minifig pricing data from bricklinkable API into the pricing tables.
 *
 * Seeds:
 * 1. bl_price_cache — raw BL price data (6hr TTL, served as cached price)
 * 2. bl_price_observations — append-only observation log (seeds derived pricing)
 *
 * Prerequisites: bricklinkable server running at localhost:5000
 *   cd ~/bricklinkable && bun run src/index.ts serve
 *
 * Usage: npx tsx scripts/ingest-bricklinkable-prices.ts [--dry-run]
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

import type { Database } from '@/supabase/types';

dotenv.config();
if (process.env.NODE_ENV !== 'production') {
  dotenv.config({ path: '.env.local', override: true });
}

const BRICKLINKABLE_API =
  process.env.BRICKLINKABLE_API ?? 'http://localhost:5000';
const BATCH_SIZE = 200;

function log(msg: string) {
  // eslint-disable-next-line no-console
  console.log(`[ingest-bricklinkable-prices] ${msg}`);
}

function getEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

type BricklinkablePriceRecord = {
  item_no: string;
  condition: string;
  avg_price: string | number | null;
  min_price: string | number | null;
  max_price: string | number | null;
  qty_avg_price: string | number | null;
  unit_quantity: number | null;
  total_quantity: number | null;
  currency_code: string;
  fetched_at: string;
};

function toNumericOrNull(v: string | number | null | undefined): number | null {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

async function main() {
  const supabaseUrl = getEnv('NEXT_PUBLIC_SUPABASE_URL');
  const supabaseServiceRoleKey = getEnv('SUPABASE_SERVICE_ROLE_KEY');
  const supabase = createClient<Database>(supabaseUrl, supabaseServiceRoleKey);

  const args = new Set(process.argv.slice(2));
  const dryRun = args.has('--dry-run');

  if (dryRun) log('DRY RUN MODE — no database writes');

  // Verify bricklinkable server is running
  try {
    const res = await fetch(`${BRICKLINKABLE_API}/`);
    if (!res.ok) throw new Error(`Server returned ${res.status}`);
    log(`Connected to bricklinkable API at ${BRICKLINKABLE_API}`);
  } catch {
    log(`ERROR: Cannot connect to bricklinkable API at ${BRICKLINKABLE_API}`);
    log('  Start it with: cd ~/bricklinkable && bun run src/index.ts serve');
    process.exitCode = 1;
    return;
  }

  // Fetch price data
  log('Fetching minifig prices from bricklinkable...');
  const url = `${BRICKLINKABLE_API}/api/prices/minifigs`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  }
  const records = (await res.json()) as BricklinkablePriceRecord[];
  log(`  Found ${records.length} price records`);

  // Stats by condition
  const byCond = new Map<string, number>();
  for (const r of records) {
    byCond.set(r.condition, (byCond.get(r.condition) ?? 0) + 1);
  }
  for (const [cond, count] of byCond.entries()) {
    log(`    condition=${cond}: ${count}`);
  }

  if (dryRun) {
    log('[DRY RUN] Would insert pricing data — skipping');
    return;
  }

  // Build rows for both tables
  const cacheRows = records.map(r => ({
    item_id: r.item_no,
    item_type: 'MINIFIG' as const,
    color_id: 0,
    condition: r.condition,
    currency_code: r.currency_code || 'USD',
    country_code: '',
    avg_price: toNumericOrNull(r.avg_price),
    min_price: toNumericOrNull(r.min_price),
    max_price: toNumericOrNull(r.max_price),
    qty_avg_price: toNumericOrNull(r.qty_avg_price),
    unit_quantity: r.unit_quantity,
    total_quantity: r.total_quantity,
    fetched_at: r.fetched_at,
  }));

  const obsRows = records.map(r => ({
    item_id: r.item_no,
    item_type: 'MINIFIG' as const,
    color_id: 0,
    condition: r.condition,
    currency_code: r.currency_code || 'USD',
    country_code: '',
    avg_price: toNumericOrNull(r.avg_price),
    min_price: toNumericOrNull(r.min_price),
    max_price: toNumericOrNull(r.max_price),
    qty_avg_price: toNumericOrNull(r.qty_avg_price),
    unit_quantity: r.unit_quantity,
    total_quantity: r.total_quantity,
    source: 'bricklinkable',
    observed_at: r.fetched_at,
  }));

  // Upsert bl_price_cache in batches
  log('Upserting bl_price_cache...');
  let cacheInserted = 0;
  for (let i = 0; i < cacheRows.length; i += BATCH_SIZE) {
    const chunk = cacheRows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from('bl_price_cache').upsert(chunk, {
      onConflict:
        'item_id,item_type,color_id,condition,currency_code,country_code',
    });
    if (error) {
      log(`  Error at batch ${i}: ${error.message}`);
    } else {
      cacheInserted += chunk.length;
    }
    if (cacheInserted % 2000 === 0 || i + BATCH_SIZE >= cacheRows.length) {
      log(`  ...${cacheInserted}/${cacheRows.length} cache rows`);
    }
  }

  // Insert bl_price_observations in batches
  log('Inserting bl_price_observations...');
  let obsInserted = 0;
  for (let i = 0; i < obsRows.length; i += BATCH_SIZE) {
    const chunk = obsRows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase
      .from('bl_price_observations')
      .insert(chunk);
    if (error) {
      log(`  Error at batch ${i}: ${error.message}`);
    } else {
      obsInserted += chunk.length;
    }
    if (obsInserted % 2000 === 0 || i + BATCH_SIZE >= obsRows.length) {
      log(`  ...${obsInserted}/${obsRows.length} observation rows`);
    }
  }

  log(
    `Done: ${cacheInserted} cache rows, ${obsInserted} observation rows ingested.`
  );
}

main().catch(error => {
  const message = error instanceof Error ? error.message : String(error);
  // eslint-disable-next-line no-console
  console.error('Ingestion failed:', message);
  process.exitCode = 1;
});
