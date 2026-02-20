/**
 * One-time seed of bl_minifig_parts from the bricklinkable API server.
 *
 * Populates BL minifig part compositions — needed for Tier-2 fingerprint
 * matching in the minifig matching pipeline.
 *
 * Prerequisites: bricklinkable server running at localhost:5000
 *   cd ~/bricklinkable && bun run src/index.ts serve
 *
 * Usage: npx tsx scripts/seed-bl-minifig-parts.ts [--dry-run]
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
  console.log(`[seed-bl-minifig-parts] ${msg}`);
}

function getEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

type MinifigPartRow = {
  bl_minifig_no: string;
  bl_part_id: string;
  bl_color_id: number;
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

  // Fetch minifig-parts data
  log('Fetching minifig-parts data from bricklinkable...');
  const url = `${BRICKLINKABLE_API}/api/minifig-parts`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  }
  const rows = (await res.json()) as MinifigPartRow[];
  log(`  Fetched ${rows.length} minifig-part rows`);

  if (rows.length === 0) {
    log('  No data to seed');
    return;
  }

  // Stats
  const uniqueMinifigs = new Set(rows.map(r => r.bl_minifig_no));
  log(`  ${uniqueMinifigs.size} unique minifigs`);

  if (dryRun) {
    log('  [DRY RUN] Would upsert minifig-parts data — skipping');
    return;
  }

  const now = new Date().toISOString();

  // Upsert in batches
  let upserted = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunk = rows.slice(i, i + BATCH_SIZE);
    const upsertRows = chunk.map(r => ({
      bl_minifig_no: r.bl_minifig_no,
      bl_part_id: r.bl_part_id,
      bl_color_id: r.bl_color_id,
      quantity: r.quantity ?? 1,
      last_refreshed_at: now,
    }));

    const { error } = await supabase
      .from('bl_minifig_parts')
      .upsert(upsertRows, {
        onConflict: 'bl_minifig_no,bl_part_id,bl_color_id',
      });

    if (error) {
      log(`  Error upserting batch at offset ${i}: ${error.message}`);
    } else {
      upserted += chunk.length;
      log(`  Upserted ${upserted}/${rows.length} rows`);
    }
  }

  log(`Seeded ${upserted} bl_minifig_parts rows.`);
}

main().catch(error => {
  const message = error instanceof Error ? error.message : String(error);
  // eslint-disable-next-line no-console
  console.error('Seed failed:', message);
  process.exitCode = 1;
});
