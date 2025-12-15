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
const LOG_PREFIX = '[minifig-mapping:all]';

// Parse CLI flags
const FORCE_RESYNC = process.argv.includes('--force');

async function buildMappingsForAllSets() {
  const supabase = createSupabaseClient();

  // eslint-disable-next-line no-console
  console.log(`${LOG_PREFIX} Loading sets with minifigs from RB catalog...`);

  // Paginate through the RPC function to get all sets
  // PostgREST has a default limit of 1000 rows
  const allCandidates: string[] = [];
  const pageSize = 1000;
  let offset = 0;

  while (true) {
    const { data: page, error: pageErr } = await supabase
      .rpc('get_sets_with_minifigs')
      .range(offset, offset + pageSize - 1);

    if (pageErr) {
      // eslint-disable-next-line no-console
      console.error(`${LOG_PREFIX} Failed to get sets with minifigs:`, pageErr);
      throw pageErr;
    }

    if (!page || page.length === 0) break;

    allCandidates.push(...page.map(s => s.set_num).filter(Boolean));

    // eslint-disable-next-line no-console
    console.log(`${LOG_PREFIX} Loaded ${allCandidates.length} sets so far...`);

    if (page.length < pageSize) break;
    offset += pageSize;
  }

  const candidateSets = allCandidates as string[];

  if (candidateSets.length === 0) {
    // eslint-disable-next-line no-console
    console.log(`${LOG_PREFIX} No sets with minifigs found.`);
    return;
  }

  // eslint-disable-next-line no-console
  console.log(
    `${LOG_PREFIX} Found ${candidateSets.length} sets with minifigs in RB catalog.`
  );

  let setsToProcess = candidateSets;

  // Unless --force, filter out sets that have already been synced successfully
  if (!FORCE_RESYNC) {
    // Get bl_sets sync status for ALL candidate sets (we need to check them all)
    // Query in batches to avoid hitting query limits
    const BATCH_SIZE = 1000;
    const syncedSets = new Set<string>();

    for (let i = 0; i < candidateSets.length; i += BATCH_SIZE) {
      const batch = candidateSets.slice(i, i + BATCH_SIZE);
      const { data: blSets } = await supabase
        .from('bl_sets')
        .select('set_num, minifig_sync_status')
        .in('set_num', batch);

      for (const set of blSets ?? []) {
        if (set.minifig_sync_status === 'ok') {
          syncedSets.add(set.set_num);
        }
      }
    }

    // eslint-disable-next-line no-console
    console.log(
      `${LOG_PREFIX} Already synced: ${syncedSets.size} sets. Remaining: ${candidateSets.length - syncedSets.size} sets.`
    );

    // Filter out synced sets
    setsToProcess = candidateSets.filter(s => !syncedSets.has(s));
  }

  // Apply final limit
  setsToProcess = setsToProcess.slice(0, MAX_SETS_PER_RUN);

  if (setsToProcess.length === 0) {
    // eslint-disable-next-line no-console
    console.log(
      `${LOG_PREFIX} No unsynced sets found. Use --force to re-process already-synced sets.`
    );
    return;
  }

  // eslint-disable-next-line no-console
  console.log(
    `${LOG_PREFIX} ${FORCE_RESYNC ? 'Re-processing' : 'Processing'} ${setsToProcess.length} sets (cap: ${MAX_SETS_PER_RUN})${FORCE_RESYNC ? ' [FORCED]' : ''}.`
  );

  await processSets(supabase, setsToProcess);
}

async function processSets(
  supabase: ReturnType<typeof createSupabaseClient>,
  setNums: string[]
) {
  // Phase 1: Map minifigs for each set
  const allPairs: Array<{ rbFigId: string; blItemId: string }> = [];
  let setsProcessed = 0;
  let setsSkipped = 0;
  let setsErrored = 0;

  for (let i = 0; i < setNums.length; i++) {
    const setNum = setNums[i]!;
    const progress = `[${i + 1}/${setNums.length}]`;

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
        `${LOG_PREFIX} Progress: ${i + 1}/${setNums.length} sets checked (${setsProcessed} processed, ${setsSkipped} skipped, ${setsErrored} errors)`
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

buildMappingsForAllSets().catch(err => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exitCode = 1;
});
