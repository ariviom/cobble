import { createClient, SupabaseClient } from '@supabase/supabase-js'

import type { Database } from '@/supabase/types'
import { getSetSubsets } from './bricklink-script-client'

export function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required env var: ${name}`)
  }
  return value
}

export function normalizeName(name: string | null | undefined): string {
  if (!name) return ''
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function createSupabaseClient(): SupabaseClient<Database> {
  return createClient<Database>(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
  )
}

export type BlMinifig = {
  minifigNo: string
  name: string | null
  quantity: number
  imageUrl: string | null
}

/**
 * Process a single set: fetch BL minifigs, cache them, and create RB→BL mappings.
 * Returns true if processed, false if skipped (already synced).
 */
export async function processSetForMinifigMapping(
  supabase: SupabaseClient<Database>,
  setNum: string,
  logPrefix: string,
): Promise<boolean> {
  // Check if we already have a successful sync for this set.
  const { data: blSet, error: blSetErr } = await supabase
    .from('bl_sets')
    .select('minifig_sync_status,last_minifig_sync_at')
    .eq('set_num', setNum)
    .maybeSingle()

  if (blSetErr) {
    // eslint-disable-next-line no-console
    console.error(`${logPrefix} Failed to read bl_sets for`, {
      setNum,
      error: blSetErr.message,
    })
    return false
  }

  if (blSet?.minifig_sync_status === 'ok') {
    // eslint-disable-next-line no-console
    console.log(`${logPrefix} Skipping ${setNum}, already synced (status=ok).`)
    return false
  }

  // Fetch BrickLink set subsets (minifigs).
  let blMinifigs: BlMinifig[] = []
  try {
    const subsets = await getSetSubsets(setNum)
    blMinifigs = subsets
      .filter(entry => entry.item?.type === 'MINIFIG')
      .map(entry => ({
        minifigNo: entry.item.no,
        name: entry.item.name ?? null,
        quantity:
          typeof entry.quantity === 'number' && entry.quantity > 0
            ? entry.quantity
            : 1,
        imageUrl: entry.item.image_url ?? null,
      }))
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`${logPrefix} Failed to fetch BL subsets for set`, setNum, err)
    await supabase.from('bl_sets').upsert({
      set_num: setNum,
      minifig_sync_status: 'error',
      last_error:
        err instanceof Error ? err.message : String(err ?? 'unknown error'),
      last_minifig_sync_at: new Date().toISOString(),
    })
    return false
  }

  // Upsert BL set sync status.
  await supabase.from('bl_sets').upsert(
    {
      set_num: setNum,
      minifig_sync_status: 'ok',
      last_minifig_sync_at: new Date().toISOString(),
    },
    { onConflict: 'set_num' },
  )

  // Cache BL set minifigs.
  if (blMinifigs.length > 0) {
    const blSetRows = blMinifigs.map(m => ({
      set_num: setNum,
      minifig_no: m.minifigNo,
      name: m.name,
      quantity: m.quantity,
      image_url: m.imageUrl,
      last_refreshed_at: new Date().toISOString(),
    }))

    const { error: upsertErr } = await supabase
      .from('bl_set_minifigs')
      .upsert(blSetRows)
    if (upsertErr) {
      // eslint-disable-next-line no-console
      console.error(
        `${logPrefix} Failed to upsert bl_set_minifigs for`,
        setNum,
        upsertErr.message,
      )
    }
  }

  // Map RB minifigs in this set to BL minifigs by normalized name.
  const mappingResult = await createMinifigMappingsForSet(
    supabase,
    setNum,
    blMinifigs,
    logPrefix,
  )

  if (mappingResult.count > 0) {
    // eslint-disable-next-line no-console
    console.log(
      `${logPrefix} Mapped ${mappingResult.count} figs for set ${setNum}.`,
    )

    const setLinkRows = mappingResult.pairs.map(({ rbFigId, blItemId }) => ({
      set_num: setNum,
      minifig_no: blItemId,
      rb_fig_id: rbFigId,
      last_refreshed_at: new Date().toISOString(),
    }))

    const { error: linkErr } = await supabase
      .from('bl_set_minifigs')
      .upsert(setLinkRows)

    if (linkErr) {
      // eslint-disable-next-line no-console
      console.error(
        `${logPrefix} Failed to store per-set RB links for`,
        setNum,
        linkErr.message,
      )
    }
  }

  return true
}

type MappingResult = {
  count: number
  pairs: { rbFigId: string; blItemId: string }[]
}

type RbCandidate = {
  fig_num: string
  name: string
  quantity: number
  normName: string
  tokens: Set<string>
}

type BlCandidate = {
  minifigNo: string
  name: string
  quantity: number
  normName: string
  tokens: Set<string>
}

function tokenize(name: string): Set<string> {
  const norm = normalizeName(name)
  if (!norm) return new Set()
  return new Set(norm.split(/\s+/).filter(Boolean))
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0
  let intersection = 0
  for (const token of a) {
    if (b.has(token)) intersection += 1
  }
  const union = a.size + b.size - intersection
  return union === 0 ? 0 : intersection / union
}

async function createMinifigMappingsForSet(
  supabase: SupabaseClient<Database>,
  setNum: string,
  blMinifigs: BlMinifig[],
  logPrefix: string,
): Promise<MappingResult> {
  if (blMinifigs.length === 0) {
    return { count: 0, pairs: [] }
  }

  // Load RB inventories for this set.
  const { data: inventories, error: invErr } = await supabase
    .from('rb_inventories')
    .select('id')
    .eq('set_num', setNum)

  if (invErr) {
    // eslint-disable-next-line no-console
    console.error(
      `${logPrefix} Failed to load RB inventories for set`,
      setNum,
      invErr.message,
    )
    return { count: 0, pairs: [] }
  }

  const inventoryIds = (inventories ?? []).map(row => row.id)
  if (inventoryIds.length === 0) {
    return { count: 0, pairs: [] }
  }

  // Load RB inventory minifigs.
  const { data: invMinifigs, error: invFigErr } = await supabase
    .from('rb_inventory_minifigs')
    .select('inventory_id,fig_num,quantity')
    .in('inventory_id', inventoryIds)

  if (invFigErr) {
    // eslint-disable-next-line no-console
    console.error(
      `${logPrefix} Failed to load RB inventory minifigs for set`,
      setNum,
      invFigErr.message,
    )
    return { count: 0, pairs: [] }
  }

  if (!invMinifigs || invMinifigs.length === 0) {
    return { count: 0, pairs: [] }
  }

  // Aggregate quantities by fig_num.
  const figQuantityMap = new Map<string, number>()
  for (const row of invMinifigs) {
    const current = figQuantityMap.get(row.fig_num) ?? 0
    figQuantityMap.set(row.fig_num, current + (row.quantity ?? 0))
  }

  const figNums = Array.from(figQuantityMap.keys())

  // Load RB minifig names.
  const { data: figs, error: figsErr } = await supabase
    .from('rb_minifigs')
    .select('fig_num,name')
    .in('fig_num', figNums)

  if (figsErr) {
    // eslint-disable-next-line no-console
    console.error(
      `${logPrefix} Failed to load rb_minifigs for set`,
      setNum,
      figsErr.message,
    )
    return { count: 0, pairs: [] }
  }

  const nameByFig = new Map<string, string>()
  for (const row of figs ?? []) {
    nameByFig.set(row.fig_num, row.name)
  }

  const rbCandidates: RbCandidate[] = figNums.map(figNum => {
    const name = nameByFig.get(figNum) ?? figNum
    const normName = normalizeName(name)
    return {
      fig_num: figNum,
      name,
      quantity: figQuantityMap.get(figNum) ?? 0,
      normName,
      tokens: tokenize(name),
    }
  })

  if (rbCandidates.length === 0) {
    return { count: 0, pairs: [] }
  }

  const blCandidates: BlCandidate[] = blMinifigs.map(bl => {
    const normName = normalizeName(bl.name)
    return {
      minifigNo: bl.minifigNo,
      name: bl.name ?? bl.minifigNo,
      quantity: bl.quantity,
      normName,
      tokens: tokenize(bl.name ?? bl.minifigNo),
    }
  })

  // Build normalized name lookup for BL minifigs.
  const normBlByName = new Map<string, BlCandidate[]>()
  for (const bl of blCandidates) {
    const key = bl.normName
    if (!key) continue
    const list = normBlByName.get(key) ?? []
    list.push(bl)
    normBlByName.set(key, list)
  }

  const unmatchedRb = new Map<string, RbCandidate>()
  for (const rb of rbCandidates) {
    unmatchedRb.set(rb.fig_num, rb)
  }
  const matchedBl = new Set<string>()

  // Create mappings where normalized names match uniquely.
  const mappingRows: Database['public']['Tables']['bricklink_minifig_mappings']['Insert'][] =
    []
  const pairedIds: { rbFigId: string; blItemId: string }[] = []

  function recordMatch(
    rb: RbCandidate,
    bl: BlCandidate,
    confidence: number,
    source: string,
  ) {
    mappingRows.push({
      rb_fig_id: rb.fig_num,
      bl_item_id: bl.minifigNo,
      confidence,
      source,
    })
    pairedIds.push({ rbFigId: rb.fig_num, blItemId: bl.minifigNo })
    unmatchedRb.delete(rb.fig_num)
    matchedBl.add(bl.minifigNo)
  }

  for (const rb of rbCandidates) {
    if (!rb.normName) continue
    const candidates =
      normBlByName.get(rb.normName)?.filter(bl => !matchedBl.has(bl.minifigNo)) ??
      []
    if (candidates.length === 1) {
      recordMatch(rb, candidates[0]!, 1, 'set:name-normalized')
    }
  }

  // Similarity-based matching for remaining figs (lowered threshold for divergent naming).
  const SIM_THRESHOLD = 0.25
  const SECOND_GAP = 0.10
  for (const rb of Array.from(unmatchedRb.values())) {
    let best: { bl: BlCandidate; score: number } | null = null
    let second = 0
    for (const bl of blCandidates) {
      if (matchedBl.has(bl.minifigNo)) continue
      const score = jaccardSimilarity(rb.tokens, bl.tokens)
      if (score > (best?.score ?? 0)) {
        second = best?.score ?? 0
        best = { bl, score }
      } else if (score > second) {
        second = score
      }
    }
    if (
      best &&
      best.score >= SIM_THRESHOLD &&
      best.score - second >= SECOND_GAP
    ) {
      recordMatch(rb, best.bl, best.score, 'set:name-similarity')
    }
  }

  // Greedy best-match fallback: if equal counts remain, pair by best available similarity.
  // This handles cases where RB/BL naming conventions diverge significantly.
  let remainingRb = Array.from(unmatchedRb.values())
  let remainingBl = blCandidates.filter(bl => !matchedBl.has(bl.minifigNo))

  if (remainingRb.length > 0 && remainingRb.length === remainingBl.length) {
    // Sort RB by name length (shorter = more generic, match last)
    const sortedRb = [...remainingRb].sort(
      (a, b) => b.name.length - a.name.length,
    )
    for (const rb of sortedRb) {
      if (!unmatchedRb.has(rb.fig_num)) continue
      const available = blCandidates.filter(
        bl => !matchedBl.has(bl.minifigNo),
      )
      if (available.length === 0) break

      let best: { bl: BlCandidate; score: number } | null = null
      for (const bl of available) {
        const score = jaccardSimilarity(rb.tokens, bl.tokens)
        if (!best || score > best.score) {
          best = { bl, score }
        }
      }
      if (best) {
        recordMatch(rb, best.bl, best.score, 'set:greedy-fallback')
      }
    }
  }

  // Final fallback: if exactly one RB and one BL remain, pair them.
  remainingRb = Array.from(unmatchedRb.values())
  remainingBl = blCandidates.filter(bl => !matchedBl.has(bl.minifigNo))
  if (remainingRb.length === 1 && remainingBl.length === 1) {
    recordMatch(remainingRb[0]!, remainingBl[0]!, 0.5, 'set:single-fig')
  }

  if (mappingRows.length === 0) {
    return { count: 0, pairs: [] }
  }

  const { error: mapErr } = await supabase
    .from('bricklink_minifig_mappings')
    .upsert(mappingRows, { onConflict: 'rb_fig_id' })

  if (mapErr) {
    // eslint-disable-next-line no-console
    console.error(
      `${logPrefix} Failed to upsert fig mappings for set`,
      setNum,
      mapErr.message,
    )
    return { count: 0, pairs: [] }
  }

  return { count: mappingRows.length, pairs: pairedIds }
}

