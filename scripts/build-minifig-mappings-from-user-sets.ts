import 'dotenv/config';

import {
  createSupabaseClient,
  processMinifigComponentMappings,
  processSetForMinifigMapping,
} from './minifig-mapping-core';

// Total daily API budget: 2500 calls
// We split between set mapping (1 call per set) and component mapping (1 call per unique minifig)
const MAX_SETS_PER_RUN = Number(process.env.MINIFIG_MAPPING_MAX_SETS ?? 500);
const MAX_COMPONENT_API_CALLS = Number(
  process.env.MINIFIG_COMPONENT_API_BUDGET ?? 500
);
const LOG_PREFIX = '[minifig-mapping:user]';

async function buildMappingsForUserSets() {
  const supabase = createSupabaseClient();

  // Select distinct set_nums from user_sets.
  const { data: candidateSets, error: setsErr } = await supabase
    .from('user_sets')
    .select('set_num')
    .neq('set_num', '')
    .limit(MAX_SETS_PER_RUN);

  if (setsErr) throw setsErr;
  if (!candidateSets || candidateSets.length === 0) {
    // eslint-disable-next-line no-console
    console.log(`${LOG_PREFIX} No candidate user sets found.`);
    return;
  }

  const uniqueSetNums = Array.from(
    new Set(candidateSets.map(row => row.set_num))
  );

  // eslint-disable-next-line no-console
  console.log(
    `${LOG_PREFIX} Processing up to ${uniqueSetNums.length} distinct user sets (cap ${MAX_SETS_PER_RUN}).`
  );

  // Phase 1: Map minifigs for each set
  const allPairs: Array<{ rbFigId: string; blItemId: string }> = [];
  let setsProcessed = 0;

  for (const setNum of uniqueSetNums) {
    const result = await processSetForMinifigMapping(
      supabase,
      setNum,
      LOG_PREFIX
    );
    if (result.processed) {
      setsProcessed++;
      allPairs.push(...result.pairs);
    }
  }

  // eslint-disable-next-line no-console
  console.log(
    `${LOG_PREFIX} Phase 1 complete: ${setsProcessed} sets processed, ${allPairs.length} minifig pairs.`
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
  }
}

buildMappingsForUserSets().catch(err => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exitCode = 1;
});
