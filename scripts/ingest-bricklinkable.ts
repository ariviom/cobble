/**
 * One-time ingest of bricklinkable mapping data into production Supabase.
 *
 * Reads from the bricklinkable API server (http://localhost:5000) and populates:
 * 1. rb_minifigs.bl_minifig_id — 16,229 RB→BL minifig ID mappings
 * 2. rb_parts.bl_part_id — RB→BL part ID mappings (only where IDs differ)
 * 3. Backfills rb_parts.bl_part_id from existing external_ids JSON
 *
 * Prerequisites: bricklinkable server running at localhost:5000
 *   cd ~/bricklinkable && bun run src/index.ts serve
 *
 * Usage: npx tsx scripts/ingest-bricklinkable.ts [--dry-run] [--skip-parts] [--skip-minifigs] [--skip-backfill]
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

import type { Database, Json } from '@/supabase/types';

dotenv.config();
if (process.env.NODE_ENV !== 'production') {
  dotenv.config({ path: '.env.local', override: true });
}

const BRICKLINKABLE_API =
  process.env.BRICKLINKABLE_API ?? 'http://localhost:5000';
const BATCH_SIZE = 2000;
const QUERY_BATCH_SIZE = 200; // Smaller batch for .in() queries (URL length limit)

function log(msg: string) {
  // eslint-disable-next-line no-console
  console.log(`[ingest-bricklinkable] ${msg}`);
}

function getEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

async function fetchJson<T>(path: string): Promise<T> {
  const url = `${BRICKLINKABLE_API}${path}`;
  log(`  Fetching ${url}...`);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

// ── Minifig Mappings ──

type MinifigMapping = {
  rb_fig_num: string;
  bl_id: string;
  confidence: number;
  match_method: string;
  rb_name: string | null;
  rb_num_parts: number | null;
};

async function ingestMinifigMappings(
  supabase: ReturnType<typeof createClient<Database>>,
  dryRun: boolean
): Promise<void> {
  log('Ingesting minifig mappings from bricklinkable...');

  const rows = await fetchJson<MinifigMapping[]>('/api/minifig-mappings');
  log(`  Found ${rows.length} minifig mappings`);

  // Stats by method
  const byMethod = new Map<string, number>();
  for (const r of rows) {
    byMethod.set(r.match_method, (byMethod.get(r.match_method) ?? 0) + 1);
  }
  for (const [method, count] of [...byMethod.entries()].sort(
    (a, b) => b[1] - a[1]
  )) {
    log(`    ${method}: ${count}`);
  }

  if (dryRun) {
    log('  [DRY RUN] Would upsert minifig mappings — skipping');
    return;
  }

  // Upsert with name included (required NOT NULL column).
  // The bricklinkable API response includes rb_name from its own rb_minifigs table.
  let updated = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunk = rows.slice(i, i + BATCH_SIZE);
    const upsertRows = chunk.map(r => ({
      fig_num: r.rb_fig_num,
      name: r.rb_name ?? r.rb_fig_num,
      num_parts: r.rb_num_parts,
      bl_minifig_id: r.bl_id,
      bl_mapping_confidence: r.confidence,
      bl_mapping_source: r.match_method,
    }));

    const { error } = await supabase.from('rb_minifigs').upsert(upsertRows, {
      onConflict: 'fig_num',
    });
    if (error) {
      log(`  Error at batch ${i}: ${error.message}`);
      throw error;
    }
    updated += chunk.length;
    if (updated % 5000 === 0 || updated === rows.length) {
      log(`  ...${updated}/${rows.length} minifigs updated`);
    }
  }

  log(`  Done: ${updated} minifig mappings ingested`);
}

// ── Part Mappings ──

type PartMapping = {
  rb_part_num: string;
  bl_part_num: string;
};

async function ingestPartMappings(
  supabase: ReturnType<typeof createClient<Database>>,
  dryRun: boolean
): Promise<void> {
  log('Ingesting part BL mappings from bricklinkable...');

  const allMappings = await fetchJson<PartMapping[]>('/api/part-mappings');
  log(`  Found ${allMappings.length} total part mappings (including 1:many)`);

  // Deduplicate: take first mapping per RB part (1:many → 1:1)
  const seen = new Set<string>();
  const deduped: PartMapping[] = [];
  for (const m of allMappings) {
    if (!seen.has(m.rb_part_num)) {
      seen.add(m.rb_part_num);
      deduped.push(m);
    }
  }

  // Filter to only those where BL ID differs from RB ID
  const exceptions = deduped.filter(r => r.bl_part_num !== r.rb_part_num);
  log(
    `  ${deduped.length} unique RB parts, ${exceptions.length} have different BL IDs`
  );

  if (dryRun) {
    log('  [DRY RUN] Would update part mappings — skipping');
    return;
  }

  // Build lookup map for fast access
  const blPartByRb = new Map<string, string>();
  for (const r of exceptions) {
    blPartByRb.set(r.rb_part_num, r.bl_part_num);
  }

  // Process in batches: query existing parts, then update with bl_part_id.
  // We can't upsert because rb_parts.name is NOT NULL and we don't have names.
  // Use smaller batch size for .in() queries to avoid Supabase URL length limits.
  const allPartNums = exceptions.map(r => r.rb_part_num);
  let updated = 0;
  let skipped = 0;

  for (let i = 0; i < allPartNums.length; i += QUERY_BATCH_SIZE) {
    const batchNums = allPartNums.slice(i, i + QUERY_BATCH_SIZE);

    // Fetch existing rows that need updating
    const { data: existing, error: fetchErr } = await supabase
      .from('rb_parts')
      .select('part_num, name')
      .in('part_num', batchNums)
      .is('bl_part_id', null);

    if (fetchErr) {
      log(`  Error fetching batch ${i}: ${fetchErr.message}`);
      continue;
    }

    if (!existing || existing.length === 0) {
      skipped += batchNums.length;
      continue;
    }

    // Upsert with name included (satisfies NOT NULL constraint)
    const upsertRows = existing
      .map(row => {
        const blPartId = blPartByRb.get(row.part_num);
        if (!blPartId) return null;
        return {
          part_num: row.part_num,
          name: row.name,
          bl_part_id: blPartId,
        };
      })
      .filter(Boolean) as {
      part_num: string;
      name: string;
      bl_part_id: string;
    }[];

    if (upsertRows.length > 0) {
      const { error: upsertErr } = await supabase
        .from('rb_parts')
        .upsert(upsertRows, { onConflict: 'part_num' });
      if (upsertErr) {
        log(`  Error upserting batch ${i}: ${upsertErr.message}`);
      } else {
        updated += upsertRows.length;
      }
    }
    skipped += batchNums.length - (existing?.length ?? 0);

    const processed = i + batchNums.length;
    if (processed % 5000 === 0 || processed >= allPartNums.length) {
      log(
        `  ...processed ${processed}/${allPartNums.length} (${updated} updated, ${skipped} skipped/already set)`
      );
    }
  }

  log(`  Done: ${updated} part mappings ingested, ${skipped} skipped`);
}

// ── Backfill bl_part_id from existing external_ids JSON ──

async function backfillFromExternalIds(
  supabase: ReturnType<typeof createClient<Database>>,
  dryRun: boolean
): Promise<void> {
  log('Backfilling rb_parts.bl_part_id from existing external_ids JSON...');

  let page = 0;
  const pageSize = 1000;
  let totalBackfilled = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase
      .from('rb_parts')
      .select('part_num, name, external_ids')
      .is('bl_part_id', null)
      .not('external_ids', 'is', null)
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) {
      log(`  Error fetching page ${page}: ${error.message}`);
      break;
    }

    if (!data || data.length === 0) break;

    const updates: { part_num: string; name: string; bl_part_id: string }[] =
      [];

    for (const row of data) {
      const blPartId = extractBricklinkPartId(row.external_ids);
      if (blPartId && blPartId !== row.part_num) {
        updates.push({
          part_num: row.part_num,
          name: row.name,
          bl_part_id: blPartId,
        });
      }
    }

    if (updates.length > 0 && !dryRun) {
      const { error: upsertErr } = await supabase
        .from('rb_parts')
        .upsert(updates, { onConflict: 'part_num' });
      if (upsertErr) {
        log(`  Error upserting backfill batch: ${upsertErr.message}`);
      } else {
        totalBackfilled += updates.length;
      }
    } else if (updates.length > 0) {
      totalBackfilled += updates.length;
    }

    if (data.length < pageSize) break;
    page++;
  }

  log(
    `  Done: ${totalBackfilled} parts backfilled from external_ids${dryRun ? ' (DRY RUN)' : ''}`
  );
}

/** Extract BrickLink part ID from external_ids JSON (same logic as catalog/sets.ts) */
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

// ── Main ──

async function main() {
  const supabaseUrl = getEnv('NEXT_PUBLIC_SUPABASE_URL');
  const supabaseServiceRoleKey = getEnv('SUPABASE_SERVICE_ROLE_KEY');
  const supabase = createClient<Database>(supabaseUrl, supabaseServiceRoleKey);

  const args = new Set(process.argv.slice(2));
  const dryRun = args.has('--dry-run');
  const skipMinifigs = args.has('--skip-minifigs');
  const skipParts = args.has('--skip-parts');
  const skipBackfill = args.has('--skip-backfill');

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

  if (!skipMinifigs) {
    await ingestMinifigMappings(supabase, dryRun);
  }

  if (!skipParts) {
    await ingestPartMappings(supabase, dryRun);
  }

  if (!skipBackfill) {
    await backfillFromExternalIds(supabase, dryRun);
  }

  log('All ingestion tasks complete.');
}

main().catch(error => {
  const message = error instanceof Error ? error.message : String(error);
  // eslint-disable-next-line no-console
  console.error('Ingestion failed:', message);
  process.exitCode = 1;
});
