import dotenv from 'dotenv';

import {
  createSupabaseClient,
  processMinifigComponentMappings,
  processSetForMinifigMapping,
} from './minifig-mapping-core';

// Load environment variables with Next.js-style precedence:
// - Production: ".env" only
// - Non-production: ".env" then ".env.local" (local overrides base)
dotenv.config();
if (process.env.NODE_ENV !== 'production') {
  dotenv.config({ path: '.env.local', override: true });
}

// Total daily API budget: 2500 calls
// We split between set mapping (1 call per set) and component mapping (1 call per unique minifig)
const MAX_SETS_PER_RUN = Number(process.env.MINIFIG_MAPPING_MAX_SETS ?? 500);
const MAX_COMPONENT_API_CALLS = Number(
  process.env.MINIFIG_COMPONENT_API_BUDGET ?? 500
);
const LOG_PREFIX = '[minifig-mapping:user]';

// Parse CLI flags
const FORCE_RESYNC = process.argv.includes('--force');

async function buildMappingsForUserSets() {
  const supabase = createSupabaseClient();

  // Select distinct set_nums from user_sets
  const { data: candidateSets, error: setsErr } = await supabase
    .from('user_sets')
    .select('set_num')
    .neq('set_num', '')
    .order('created_at', { ascending: false }) // Most recently added first
    .limit(MAX_SETS_PER_RUN * 2); // Fetch extra to account for filtering

  if (setsErr) throw setsErr;
  if (!candidateSets || candidateSets.length === 0) {
    // eslint-disable-next-line no-console
    console.log(`${LOG_PREFIX} No candidate user sets found.`);
    return;
  }

  const uniqueSetNums = Array.from(
    new Set(candidateSets.map(row => row.set_num))
  );

  // Unless --force, filter out sets that have already been synced successfully
  let setsToProcess = uniqueSetNums;

  if (!FORCE_RESYNC) {
    const { data: blSets } = await supabase
      .from('bl_sets')
      .select('set_num, minifig_sync_status')
      .in('set_num', uniqueSetNums);

    const syncedSets = new Set(
      blSets?.filter(s => s.minifig_sync_status === 'ok').map(s => s.set_num) ??
        []
    );

    setsToProcess = uniqueSetNums.filter(s => !syncedSets.has(s));
  }

  // Apply final limit
  setsToProcess = setsToProcess.slice(0, MAX_SETS_PER_RUN);

  if (setsToProcess.length === 0) {
    // eslint-disable-next-line no-console
    console.log(
      `${LOG_PREFIX} No unsynced user sets found. Use --force to re-process already-synced sets.`
    );
    return;
  }

  // eslint-disable-next-line no-console
  console.log(
    `${LOG_PREFIX} ${FORCE_RESYNC ? 'Re-processing' : 'Processing'} ${setsToProcess.length} distinct user sets (cap: ${MAX_SETS_PER_RUN})${FORCE_RESYNC ? ' [FORCED]' : ''}.`
  );

  // Phase 1: Map minifigs for each set
  const allPairs: Array<{ rbFigId: string; blItemId: string }> = [];
  let setsProcessed = 0;
  let setsSkipped = 0;
  let setsErrored = 0;

  for (let i = 0; i < setsToProcess.length; i++) {
    const setNum = setsToProcess[i]!;
    const progress = `[${i + 1}/${setsToProcess.length}]`;

    const result = await processSetForMinifigMapping(
      supabase,
      setNum,
      LOG_PREFIX,
      FORCE_RESYNC
    );

    if (result.processed) {
      setsProcessed++;
      allPairs.push(...result.pairs);
      // eslint-disable-next-line no-console
      console.log(
        `${LOG_PREFIX} ${progress} Processed ${setNum}: ${result.pairs.length} minifig mappings`
      );
    } else if (result.skipped) {
      setsSkipped++;
    } else if (result.error) {
      setsErrored++;
    }

    // Log progress every 50 sets
    if ((i + 1) % 50 === 0) {
      // eslint-disable-next-line no-console
      console.log(
        `${LOG_PREFIX} Progress: ${i + 1}/${setsToProcess.length} sets checked (${setsProcessed} processed, ${setsSkipped} skipped, ${setsErrored} errors)`
      );
    }
  }

  // eslint-disable-next-line no-console
  console.log(
    `${LOG_PREFIX} Phase 1 complete: ${setsProcessed} sets processed, ${setsSkipped} skipped, ${setsErrored} errors, ${allPairs.length} minifig pairs.`
  );

  // Phase 2: Map component parts for minifig pairs (with rate limiting)
  if (allPairs.length > 0 && MAX_COMPONENT_API_CALLS > 0) {
    // eslint-disable-next-line no-console
    console.log(
      `${LOG_PREFIX} Phase 2: Mapping component parts (budget: ${MAX_COMPONENT_API_CALLS} API calls)...`
    );

    const { apiCallsMade, partsMapped } = await processMinifigComponentMappings(
      supabase,
      allPairs,
      MAX_COMPONENT_API_CALLS,
      LOG_PREFIX
    );

    // eslint-disable-next-line no-console
    console.log(
      `${LOG_PREFIX} Phase 2 complete: ${apiCallsMade} API calls, ${partsMapped} parts mapped.`
    );
  } else if (allPairs.length === 0) {
    // eslint-disable-next-line no-console
    console.log(
      `${LOG_PREFIX} Phase 2 skipped: No minifig pairs to process component mappings.`
    );
  }
}

buildMappingsForUserSets().catch(err => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exitCode = 1;
});
