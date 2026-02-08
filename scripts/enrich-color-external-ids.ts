/**
 * One-time enrichment: populate `external_ids` in `rb_colors` from Rebrickable API.
 *
 * The CSV ingestion doesn't include external_ids (BrickLink color mappings).
 * This script fetches them from the API and updates the table.
 *
 * Usage:
 *   npx tsx scripts/enrich-color-external-ids.ts
 */
import dotenv from 'dotenv';

import type { Json } from '@/supabase/types';
import { createSupabaseClient, requireEnv } from './minifig-mapping-core';

dotenv.config();
if (process.env.NODE_ENV !== 'production') {
  dotenv.config({ path: '.env.local', override: true });
}

function log(message: string, extra?: Record<string, unknown>) {
  const ts = new Date().toISOString();
  // eslint-disable-next-line no-console
  console.log(`[${ts}] [enrich-color-external-ids] ${message}`, extra ?? '');
}

type ApiColor = {
  id: number;
  name: string;
  external_ids: Record<string, unknown> | null;
};

type ApiPage = { results: ApiColor[]; next: string | null };

async function main() {
  const apiKey = requireEnv('REBRICKABLE_API');
  const supabase = createSupabaseClient();

  log('Fetching colors from Rebrickable API...');

  const allColors: ApiColor[] = [];
  let url: string | null =
    `https://rebrickable.com/api/v3/lego/colors/?page_size=1000&key=${apiKey}`;

  while (url) {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`API request failed: ${res.status} ${res.statusText}`);
    }
    const page: ApiPage = (await res.json()) as ApiPage;
    allColors.push(...page.results);
    url = page.next;
  }

  log('Fetched colors from API', { count: allColors.length });

  // Count how many have BrickLink mappings
  const withBl = allColors.filter(c => {
    const bl = c.external_ids?.['BrickLink'] as
      | { ext_ids?: number[] }
      | undefined;
    return bl?.ext_ids && bl.ext_ids.length > 0;
  });
  log('Colors with BrickLink mappings', { count: withBl.length });

  // Upsert in batches
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
        log('Batch upsert failed', { offset: i, error: error.message });
      } else {
        updated += rows.length;
      }
    }
  }

  log('Done enriching rb_colors', { updated });

  // Verify
  const { data: check } = await supabase
    .from('rb_colors')
    .select('id')
    .not('external_ids', 'is', null);

  log('Verification: rows with external_ids', { count: check?.length ?? 0 });
}

main().catch(err => {
  log('Fatal error', {
    error: err instanceof Error ? err.message : String(err),
  });
  process.exit(1);
});
