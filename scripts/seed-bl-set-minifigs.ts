/**
 * One-time seed of bl_set_minifigs from the bricklinkable API server.
 *
 * Populates which BrickLink minifigs appear in each LEGO set — needed for
 * Tier-1 (set-based elimination) and Tier-2 (set-scoped fingerprint narrowing).
 *
 * Prerequisites: bricklinkable server running at localhost:5000
 *   cd ~/bricklinkable && bun run src/index.ts serve
 *
 * Usage: npx tsx scripts/seed-bl-set-minifigs.ts [--dry-run]
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
const BATCH_SIZE = 2000;

function log(msg: string) {
  // eslint-disable-next-line no-console
  console.log(`[seed-bl-set-minifigs] ${msg}`);
}

function getEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

type SetMinifigRow = {
  set_num: string;
  minifig_no: string;
  bl_name: string | null;
  quantity: number;
};

async function main() {
  const supabaseUrl = getEnv('NEXT_PUBLIC_SUPABASE_URL');
  const supabaseServiceRoleKey = getEnv('SUPABASE_SERVICE_ROLE_KEY');
  const supabase = createClient<Database>(supabaseUrl, supabaseServiceRoleKey);

  const dryRun = process.argv.includes('--dry-run');
  if (dryRun) log('DRY RUN MODE — no database writes');

  // Verify bricklinkable server is running
  try {
    const res = await fetch(`${BRICKLINKABLE_API}/`);
    if (!res.ok) throw new Error(`Server returned ${res.status}`);
    log(`Connected to bricklinkable API at ${BRICKLINKABLE_API}`);
  } catch (err) {
    log(`ERROR: Cannot connect to bricklinkable API at ${BRICKLINKABLE_API}`);
    log('  Start it with: cd ~/bricklinkable && bun run src/index.ts serve');
    throw err;
  }

  // Fetch set-minifig data
  log('Fetching set-minifig data from bricklinkable...');
  const url = `${BRICKLINKABLE_API}/api/set-minifigs`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  }
  const rows = (await res.json()) as SetMinifigRow[];
  log(`  Fetched ${rows.length} set-minifig rows`);

  if (rows.length === 0) {
    log('  No data to seed');
    return;
  }

  // Stats
  const uniqueSets = new Set(rows.map(r => r.set_num));
  const uniqueMinifigs = new Set(rows.map(r => r.minifig_no));
  log(
    `  ${uniqueSets.size} unique sets, ${uniqueMinifigs.size} unique minifigs`
  );

  if (dryRun) {
    log('  [DRY RUN] Would upsert set-minifig data — skipping');
    return;
  }

  // Upsert in batches
  let upserted = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunk = rows.slice(i, i + BATCH_SIZE);
    const upsertRows = chunk.map(r => ({
      set_num: r.set_num,
      minifig_no: r.minifig_no,
      bl_name: r.bl_name,
      quantity: r.quantity ?? 1,
    }));

    const { error } = await supabase
      .from('bl_set_minifigs')
      .upsert(upsertRows, { onConflict: 'set_num,minifig_no' });

    if (error) {
      log(`  Error upserting batch at offset ${i}: ${error.message}`);
    } else {
      upserted += chunk.length;
      log(`  Upserted ${upserted}/${rows.length} rows`);
    }
  }

  log(`Seeded ${upserted} bl_set_minifigs rows.`);
}

main().catch(error => {
  const message = error instanceof Error ? error.message : String(error);
  // eslint-disable-next-line no-console
  console.error('Seed failed:', message);
  process.exitCode = 1;
});
