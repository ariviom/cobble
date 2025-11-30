import 'dotenv/config'

import {
  createSupabaseClient,
  processSetForMinifigMapping,
} from './minifig-mapping-core'

const MAX_SETS_PER_RUN = Number(process.env.MINIFIG_MAPPING_MAX_SETS ?? 2500)
const LOG_PREFIX = '[minifig-mapping:all]'

async function buildMappingsForAllSets() {
  const supabase = createSupabaseClient()

  // Select candidate sets from rb_sets.
  const { data: candidateSets, error: setsErr } = await supabase
    .from('rb_sets')
    .select('set_num')
    .limit(MAX_SETS_PER_RUN)

  if (setsErr) throw setsErr
  if (!candidateSets || candidateSets.length === 0) {
    // eslint-disable-next-line no-console
    console.log(`${LOG_PREFIX} No candidate rb_sets found.`)
    return
  }

  const uniqueSetNums = Array.from(
    new Set(candidateSets.map(row => row.set_num)),
  )

  // eslint-disable-next-line no-console
  console.log(
    `${LOG_PREFIX} Processing up to ${uniqueSetNums.length} rb_sets (cap ${MAX_SETS_PER_RUN}).`,
  )

  for (const setNum of uniqueSetNums) {
    await processSetForMinifigMapping(supabase, setNum, LOG_PREFIX)
  }
}

buildMappingsForAllSets().catch(err => {
  // eslint-disable-next-line no-console
  console.error(err)
  process.exitCode = 1
})
