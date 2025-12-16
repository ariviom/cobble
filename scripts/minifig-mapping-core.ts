import { createClient, SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/supabase/types';
import {
  getMinifigParts,
  getSetSubsets,
  ScriptBLMinifigPart,
} from './bricklink-script-client';

// Dynamically import image hash functions only when needed (avoids WASM issues in Next.js)
let imageHashModule: typeof import('./lib/imageHash') | null = null;
async function getImageHashModule() {
  if (!imageHashModule) {
    imageHashModule = await import('./lib/imageHash');
  }
  return imageHashModule;
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export function normalizeName(name: string | null | undefined): string {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function createSupabaseClient(): SupabaseClient<Database> {
  return createClient<Database>(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY')
  );
}

export type BlMinifig = {
  minifigNo: string;
  name: string | null;
  quantity: number;
  imageUrl: string | null;
  imageHash?: string | null;
};

export type SetMappingResult = {
  processed: boolean;
  skipped: boolean;
  error: boolean;
  pairs: { rbFigId: string; blItemId: string }[];
};

/**
 * Process a single set: fetch BL minifigs, cache them, and create RB→BL mappings.
 * Returns { processed: true, pairs: [...] } if processed, { processed: false, skipped: true } if already synced, or { error: true } on errors.
 */
export async function processSetForMinifigMapping(
  supabase: SupabaseClient<Database>,
  setNum: string,
  logPrefix: string,
  force = false
): Promise<SetMappingResult> {
  // Check if we already have a successful sync for this set.
  const { data: blSet, error: blSetErr } = await supabase
    .from('bl_sets')
    .select('minifig_sync_status,last_minifig_sync_at')
    .eq('set_num', setNum)
    .maybeSingle();

  if (blSetErr) {
    // eslint-disable-next-line no-console
    console.error(`${logPrefix} Failed to read bl_sets for`, {
      setNum,
      error: blSetErr.message,
    });
    return { processed: false, skipped: false, error: true, pairs: [] };
  }

  if (!force && blSet?.minifig_sync_status === 'ok') {
    // Skip already-synced sets unless force is enabled
    return { processed: false, skipped: true, error: false, pairs: [] };
  }

  // Fetch BrickLink set subsets (minifigs).
  let blMinifigs: BlMinifig[] = [];
  try {
    const subsets = await getSetSubsets(setNum);
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
      }));
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(
      `${logPrefix} Failed to fetch BL subsets for set`,
      setNum,
      err
    );
    await supabase.from('bl_sets').upsert({
      set_num: setNum,
      minifig_sync_status: 'error',
      last_error:
        err instanceof Error ? err.message : String(err ?? 'unknown error'),
      last_minifig_sync_at: new Date().toISOString(),
    });
    return { processed: false, skipped: false, error: true, pairs: [] };
  }

  // Upsert BL set sync status.
  await supabase.from('bl_sets').upsert(
    {
      set_num: setNum,
      minifig_sync_status: 'ok',
      last_minifig_sync_at: new Date().toISOString(),
    },
    { onConflict: 'set_num' }
  );

  // Cache BL set minifigs with image hashes.
  if (blMinifigs.length > 0) {
    // Generate image hashes for BL minifigs with image URLs
    const blSetRows = await Promise.all(
      blMinifigs.map(async m => {
        let imageHash: string | null = null;
        if (m.imageUrl) {
          try {
            const { generateImageHash } = await getImageHashModule();
            imageHash = await generateImageHash(m.imageUrl);
          } catch (error) {
            // Silently fail - hash generation is optional
            imageHash = null;
          }
        }

        return {
          set_num: setNum,
          minifig_no: m.minifigNo,
          name: m.name,
          quantity: m.quantity,
          image_url: m.imageUrl,
          image_hash: imageHash,
          image_hash_algorithm: imageHash ? 'phash' : null,
          last_refreshed_at: new Date().toISOString(),
        };
      })
    );

    const { error: upsertErr } = await supabase
      .from('bl_set_minifigs')
      .upsert(blSetRows);
    if (upsertErr) {
      // eslint-disable-next-line no-console
      console.error(
        `${logPrefix} Failed to upsert bl_set_minifigs for`,
        setNum,
        upsertErr.message
      );
    }
  }

  // Fetch BL minifigs with image hashes from database for mapping
  const { data: blMinifigsWithHashes } = await supabase
    .from('bl_set_minifigs')
    .select('minifig_no, name, quantity, image_url, image_hash')
    .eq('set_num', setNum);

  // Convert to BlMinifig format with hashes
  const blMinifigsForMapping: (BlMinifig & { imageHash?: string | null })[] = (
    blMinifigsWithHashes || []
  ).map(m => ({
    minifigNo: m.minifig_no,
    name: m.name,
    quantity: m.quantity,
    imageUrl: m.image_url,
    imageHash: m.image_hash,
  }));

  // Map RB minifigs in this set to BL minifigs by normalized name.
  const mappingResult = await createMinifigMappingsForSet(
    supabase,
    setNum,
    blMinifigsForMapping,
    logPrefix
  );

  if (mappingResult.count > 0) {
    // eslint-disable-next-line no-console
    console.log(
      `${logPrefix} Mapped ${mappingResult.count} figs for set ${setNum}.`
    );

    const setLinkRows = mappingResult.pairs.map(({ rbFigId, blItemId }) => ({
      set_num: setNum,
      minifig_no: blItemId,
      rb_fig_id: rbFigId,
      last_refreshed_at: new Date().toISOString(),
    }));

    const { error: linkErr } = await supabase
      .from('bl_set_minifigs')
      .upsert(setLinkRows);

    if (linkErr) {
      // eslint-disable-next-line no-console
      console.error(
        `${logPrefix} Failed to store per-set RB links for`,
        setNum,
        linkErr.message
      );
    }
  }

  return {
    processed: true,
    skipped: false,
    error: false,
    pairs: mappingResult.pairs,
  };
}

type MappingResult = {
  count: number;
  pairs: { rbFigId: string; blItemId: string }[];
};

type RbCandidate = {
  fig_num: string;
  name: string;
  quantity: number;
  normName: string;
  tokens: Set<string>;
  imageHash?: string | null;
  imageUrl?: string | null;
};

type BlCandidate = {
  minifigNo: string;
  name: string;
  quantity: number;
  normName: string;
  tokens: Set<string>;
  imageHash?: string | null;
  imageUrl?: string | null;
};

function tokenize(name: string): Set<string> {
  const norm = normalizeName(name);
  if (!norm) return new Set();
  return new Set(norm.split(/\s+/).filter(Boolean));
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection += 1;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Find longest common substring between two strings
 */
function longestCommonSubstring(a: string, b: string): string {
  const m = a.length;
  const n = b.length;
  let maxLen = 0;
  let endIndex = 0;

  // DP table
  const dp: number[][] = Array(m + 1)
    .fill(0)
    .map(() => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
        if (dp[i][j] > maxLen) {
          maxLen = dp[i][j];
          endIndex = i;
        }
      }
    }
  }

  return maxLen > 0 ? a.substring(endIndex - maxLen, endIndex) : '';
}

/**
 * Calculate substring similarity (character-level longest common substring)
 */
function substringSimilarity(a: string, b: string): number {
  const aLower = a.toLowerCase();
  const bLower = b.toLowerCase();
  const lcs = longestCommonSubstring(aLower, bLower);

  // Require minimum length to avoid spurious matches
  if (lcs.length < 3) return 0;

  const maxLen = Math.max(a.length, b.length);
  return maxLen > 0 ? lcs.length / maxLen : 0;
}

/**
 * Extract key name (primary character/theme identifier)
 * Typically the first significant word before hyphen/comma
 */
function extractKeyName(name: string): string {
  // Remove common prefixes and get first significant word
  const cleaned = name.replace(/^(the|a|an)\s+/i, '').trim();

  // Match first word (letters and numbers, min 3 chars)
  const match = cleaned.match(/^([A-Za-z0-9]{3,})/);
  return match ? match[1].toLowerCase() : '';
}

/**
 * Check if two names have matching key identifiers
 */
function keyNameMatch(a: string, b: string): number {
  const keyA = extractKeyName(a);
  const keyB = extractKeyName(b);

  if (!keyA || !keyB) return 0;
  return keyA === keyB ? 1.0 : 0.0;
}

/**
 * Calculate confidence boost based on set size
 * Smaller sets have higher certainty due to fewer possible combinations
 */
function calculateSetSizeBoost(
  totalFigs: number,
  baseSimilarity: number
): number {
  if (totalFigs === 1) {
    // Single fig set - perfect certainty
    return 1.0 - baseSimilarity; // Boost to 1.0
  }

  if (totalFigs === 2) {
    // 2-fig set - very high boost for good matches
    if (baseSimilarity >= 0.3) return 0.3;
    if (baseSimilarity >= 0.2) return 0.2;
    return 0.1;
  }

  if (totalFigs === 3) {
    // 3-fig set - moderate boost
    if (baseSimilarity >= 0.4) return 0.2;
    if (baseSimilarity >= 0.3) return 0.15;
    return 0.05;
  }

  if (totalFigs <= 5) {
    // Small sets still get some boost
    return Math.max(0, 0.1 - (totalFigs - 4) * 0.03);
  }

  // Larger sets get minimal boost
  return Math.max(0, 0.05 - (totalFigs - 6) * 0.01);
}

/**
 * Check if a BL fig is the only viable option for an RB fig
 * Returns true if no other BL fig has decent similarity (>0.3)
 */
function isOnlyViableOption(
  rb: RbCandidate,
  targetBl: BlCandidate,
  availableBl: BlCandidate[],
  imageSimilarityMap: Map<string, number | null>
): boolean {
  const alternatives = availableBl.filter(
    bl => bl.minifigNo !== targetBl.minifigNo
  );

  for (const alt of alternatives) {
    const imageKey = `${rb.fig_num}-${alt.minifigNo}`;
    const imageSim = imageSimilarityMap.get(imageKey) || null;
    const { score } = calculateCombinedSimilarity(rb, alt, imageSim);

    if (score > 0.3) {
      return false; // Has viable alternative
    }
  }

  return true; // No viable alternatives
}

/**
 * Detect duplicate mappings (multiple RB figs mapping to same BL fig)
 * Returns valid mappings and logs conflicts
 */
function detectDuplicateMappings(
  mappings: Database['public']['Tables']['bricklink_minifig_mappings']['Insert'][],
  logPrefix: string
): {
  valid: Database['public']['Tables']['bricklink_minifig_mappings']['Insert'][];
  conflicts: Array<{ rb_fig_ids: string[]; bl_item_id: string; kept: string }>;
} {
  const byBlItem = new Map<string, typeof mappings>();

  // Group by BL item ID
  for (const mapping of mappings) {
    const existing = byBlItem.get(mapping.bl_item_id) || [];
    existing.push(mapping);
    byBlItem.set(mapping.bl_item_id, existing);
  }

  const valid: typeof mappings = [];
  const conflicts: Array<{
    rb_fig_ids: string[];
    bl_item_id: string;
    kept: string;
  }> = [];

  // Resolve conflicts
  for (const [blItemId, group] of byBlItem) {
    if (group.length === 1) {
      valid.push(group[0]!);
    } else {
      // Multiple RB figs map to same BL fig - keep highest confidence
      const sorted = group.sort(
        (a, b) => (b.confidence ?? 0) - (a.confidence ?? 0)
      );
      const winner = sorted[0]!;
      valid.push(winner);

      conflicts.push({
        rb_fig_ids: group.map(m => m.rb_fig_id),
        bl_item_id: blItemId,
        kept: winner.rb_fig_id,
      });

      // eslint-disable-next-line no-console
      console.warn(
        `${logPrefix} Duplicate mapping detected for BL ${blItemId}:`,
        `Kept ${winner.rb_fig_id} (${(winner.confidence ?? 0).toFixed(2)}),`,
        `rejected ${group
          .slice(1)
          .map(m => `${m.rb_fig_id} (${(m.confidence ?? 0).toFixed(2)})`)
          .join(', ')}`
      );
    }
  }

  return { valid, conflicts };
}

/**
 * Find matches based on unique part counts within the set
 * Returns map of RB fig_num → BL minifig_no for unique matches
 */
function findUniquePartCountMatches(
  rbFigs: RbCandidate[],
  blFigs: BlCandidate[]
): Map<string, { blMinifigNo: string; verified: boolean }> {
  const matches = new Map<string, { blMinifigNo: string; verified: boolean }>();

  // Count occurrences of each part count
  const rbPartCounts = new Map<number, string[]>();
  const blPartCounts = new Map<number, string[]>();

  for (const rb of rbFigs) {
    const list = rbPartCounts.get(rb.quantity) || [];
    list.push(rb.fig_num);
    rbPartCounts.set(rb.quantity, list);
  }

  for (const bl of blFigs) {
    const list = blPartCounts.get(bl.quantity) || [];
    list.push(bl.minifigNo);
    blPartCounts.set(bl.quantity, list);
  }

  // Match figs where part count appears exactly once in both RB and BL
  for (const [partCount, rbFigIds] of rbPartCounts) {
    if (rbFigIds.length === 1 && blPartCounts.has(partCount)) {
      const blFigIds = blPartCounts.get(partCount)!;
      if (blFigIds.length === 1) {
        const rbFig = rbFigs.find(f => f.fig_num === rbFigIds[0])!;
        const blFig = blFigs.find(f => f.minifigNo === blFigIds[0])!;

        // Verify with name similarity to avoid false positives
        const nameSim = jaccardSimilarity(rbFig.tokens, blFig.tokens);
        const substringSim = substringSimilarity(rbFig.name, blFig.name);
        const keyNameSim = keyNameMatch(rbFig.name, blFig.name);
        const combinedNameSim = Math.max(nameSim, substringSim, keyNameSim);

        // Require at least some name similarity (0.2) to confirm match
        const verified = combinedNameSim >= 0.2;

        matches.set(rbFigIds[0], {
          blMinifigNo: blFigIds[0],
          verified,
        });
      }
    }
  }

  return matches;
}

/**
 * Calculate combined similarity score using multiple dimensions
 * Weights optimized for character name matching and substring similarity
 */
function calculateCombinedSimilarity(
  rb: RbCandidate,
  bl: BlCandidate,
  imageSimilarity: number | null = null
): { score: number; imageSimilarity: number | null } {
  // Token-based similarity (Jaccard)
  const jaccardSim = jaccardSimilarity(rb.tokens, bl.tokens);

  // Character-level substring similarity
  const substringSim = substringSimilarity(rb.name, bl.name);

  // Key name match (character identifier)
  const keyNameSim = keyNameMatch(rb.name, bl.name);

  // Part count similarity (normalized, closer counts = higher score)
  const rbPartCount = rb.quantity;
  const blPartCount = bl.quantity;
  const maxCount = Math.max(rbPartCount, blPartCount);
  const partCountSim =
    maxCount > 0 ? 1 - Math.abs(rbPartCount - blPartCount) / maxCount : 0;

  // Calculate weighted score with updated weights:
  // - Substring: 0.35 (highest - character names are most reliable)
  // - Key name: 0.20 (precise character identifier)
  // - Jaccard: 0.20 (token-based matching)
  // - Image: 0.20 (visual similarity when available)
  // - Part count: 0.05 (low weight - unique counts handled separately)
  let score: number;
  if (imageSimilarity !== null && imageSimilarity >= 0) {
    score =
      jaccardSim * 0.2 +
      substringSim * 0.35 +
      keyNameSim * 0.2 +
      partCountSim * 0.05 +
      imageSimilarity * 0.2;
  } else {
    // Without image: redistribute weight proportionally
    score =
      jaccardSim * 0.25 +
      substringSim * 0.44 +
      keyNameSim * 0.25 +
      partCountSim * 0.06;
  }

  return { score, imageSimilarity };
}

async function createMinifigMappingsForSet(
  supabase: SupabaseClient<Database>,
  setNum: string,
  blMinifigs: BlMinifig[],
  logPrefix: string
): Promise<MappingResult> {
  if (blMinifigs.length === 0) {
    return { count: 0, pairs: [] };
  }

  // Load RB inventories for this set (ALL versions).
  const { data: inventories, error: invErr } = await supabase
    .from('rb_inventories')
    .select('id, version')
    .eq('set_num', setNum)
    .order('version', { ascending: true });

  if (invErr) {
    // eslint-disable-next-line no-console
    console.error(
      `${logPrefix} Failed to load RB inventories for set`,
      setNum,
      invErr.message
    );
    return { count: 0, pairs: [] };
  }

  const inventoryIds = (inventories ?? []).map(row => row.id);
  if (inventoryIds.length === 0) {
    return { count: 0, pairs: [] };
  }

  if (inventories && inventories.length > 1) {
    // eslint-disable-next-line no-console
    console.log(
      `${logPrefix} Set ${setNum} has ${inventories.length} inventory versions (using union of all)`
    );
  }

  // Load RB inventory minifigs.
  const { data: invMinifigs, error: invFigErr } = await supabase
    .from('rb_inventory_minifigs')
    .select('inventory_id,fig_num,quantity')
    .in('inventory_id', inventoryIds);

  if (invFigErr) {
    // eslint-disable-next-line no-console
    console.error(
      `${logPrefix} Failed to load RB inventory minifigs for set`,
      setNum,
      invFigErr.message
    );
    return { count: 0, pairs: [] };
  }

  if (!invMinifigs || invMinifigs.length === 0) {
    return { count: 0, pairs: [] };
  }

  // Aggregate quantities by fig_num.
  const figQuantityMap = new Map<string, number>();
  for (const row of invMinifigs) {
    const current = figQuantityMap.get(row.fig_num) ?? 0;
    figQuantityMap.set(row.fig_num, current + (row.quantity ?? 0));
  }

  const figNums = Array.from(figQuantityMap.keys());

  // Load RB minifig names and image hashes.
  const { data: figs, error: figsErr } = await supabase
    .from('rb_minifigs')
    .select('fig_num,name')
    .in('fig_num', figNums);

  if (figsErr) {
    // eslint-disable-next-line no-console
    console.error(
      `${logPrefix} Failed to load rb_minifigs for set`,
      setNum,
      figsErr.message
    );
    return { count: 0, pairs: [] };
  }

  // Load RB minifig image hashes
  const { data: rbImages } = await supabase
    .from('rb_minifig_images')
    .select('fig_num,image_url,image_hash')
    .in('fig_num', figNums);

  const nameByFig = new Map<string, string>();
  const imageDataByFig = new Map<
    string,
    { url: string | null; hash: string | null }
  >();

  for (const row of figs ?? []) {
    nameByFig.set(row.fig_num, row.name);
  }

  for (const img of rbImages ?? []) {
    imageDataByFig.set(img.fig_num, {
      url: img.image_url,
      hash: img.image_hash,
    });
  }

  const rbCandidates: RbCandidate[] = figNums.map(figNum => {
    const name = nameByFig.get(figNum) ?? figNum;
    const normName = normalizeName(name);
    const imageData = imageDataByFig.get(figNum);
    return {
      fig_num: figNum,
      name,
      quantity: figQuantityMap.get(figNum) ?? 0,
      normName,
      tokens: tokenize(name),
      imageUrl: imageData?.url ?? null,
      imageHash: imageData?.hash ?? null,
    };
  });

  if (rbCandidates.length === 0) {
    return { count: 0, pairs: [] };
  }

  const blCandidates: BlCandidate[] = blMinifigs.map(bl => {
    const normName = normalizeName(bl.name);
    return {
      minifigNo: bl.minifigNo,
      name: bl.name ?? bl.minifigNo,
      quantity: bl.quantity,
      normName,
      tokens: tokenize(bl.name ?? bl.minifigNo),
      imageHash: bl.imageHash ?? null,
      imageUrl: bl.imageUrl ?? null,
    };
  });

  // Build normalized name lookup for BL minifigs.
  const normBlByName = new Map<string, BlCandidate[]>();
  for (const bl of blCandidates) {
    const key = bl.normName;
    if (!key) continue;
    const list = normBlByName.get(key) ?? [];
    list.push(bl);
    normBlByName.set(key, list);
  }

  const unmatchedRb = new Map<string, RbCandidate>();
  for (const rb of rbCandidates) {
    unmatchedRb.set(rb.fig_num, rb);
  }
  const matchedBl = new Set<string>();

  // Create mappings where normalized names match uniquely.
  const mappingRows: Database['public']['Tables']['bricklink_minifig_mappings']['Insert'][] =
    [];
  const pairedIds: { rbFigId: string; blItemId: string }[] = [];

  function recordMatch(
    rb: RbCandidate,
    bl: BlCandidate,
    confidence: number,
    source: string,
    imageSimilarity: number | null = null
  ) {
    mappingRows.push({
      rb_fig_id: rb.fig_num,
      bl_item_id: bl.minifigNo,
      confidence,
      source,
      image_similarity: imageSimilarity,
      image_match_attempted: rb.imageHash && bl.imageHash ? true : false,
    });
    pairedIds.push({ rbFigId: rb.fig_num, blItemId: bl.minifigNo });
    unmatchedRb.delete(rb.fig_num);
    matchedBl.add(bl.minifigNo);
  }

  for (const rb of rbCandidates) {
    if (!rb.normName) continue;
    const candidates =
      normBlByName
        .get(rb.normName)
        ?.filter(bl => !matchedBl.has(bl.minifigNo)) ?? [];
    if (candidates.length === 1) {
      recordMatch(rb, candidates[0]!, 1, 'set:name-normalized');
    }
  }

  // Unique part count matching (high confidence for unique counts within set)
  const uniquePartMatches = findUniquePartCountMatches(
    Array.from(unmatchedRb.values()),
    blCandidates.filter(bl => !matchedBl.has(bl.minifigNo))
  );

  for (const [rbFigId, match] of uniquePartMatches) {
    const rb = unmatchedRb.get(rbFigId);
    const bl = blCandidates.find(b => b.minifigNo === match.blMinifigNo);

    if (rb && bl && match.verified) {
      // High confidence for verified unique part count matches
      recordMatch(rb, bl, 0.95, 'set:unique-part-count');
    }
  }

  // Similarity-based matching for remaining figs (using combined name + image similarity).
  const SIM_THRESHOLD = 0.25;
  const SECOND_GAP = 0.1;
  for (const rb of Array.from(unmatchedRb.values())) {
    let best: {
      bl: BlCandidate;
      score: number;
      imageSimilarity: number | null;
    } | null = null;
    let second = 0;
    for (const bl of blCandidates) {
      if (matchedBl.has(bl.minifigNo)) continue;

      // Calculate image similarity if both hashes are available
      let imageSimilarity: number | null = null;
      if (rb.imageHash && bl.imageHash) {
        try {
          const { calculateImageSimilarity } = await getImageHashModule();
          imageSimilarity = calculateImageSimilarity(
            rb.imageHash,
            bl.imageHash
          );
        } catch (error) {
          // Hash calculation failed, skip image similarity
          imageSimilarity = null;
        }
      }

      // Get combined similarity score
      const { score } = calculateCombinedSimilarity(rb, bl, imageSimilarity);

      if (score > (best?.score ?? 0)) {
        second = best?.score ?? 0;
        best = { bl, score, imageSimilarity };
      } else if (score > second) {
        second = score;
      }
    }
    if (
      best &&
      best.score >= SIM_THRESHOLD &&
      best.score - second >= SECOND_GAP
    ) {
      // Apply set size confidence boost
      const totalFigs = rbCandidates.length;
      const boost = calculateSetSizeBoost(totalFigs, best.score);
      const finalConfidence = Math.min(1.0, best.score + boost);

      recordMatch(
        rb,
        best.bl,
        finalConfidence,
        'set:combined-similarity',
        best.imageSimilarity
      );
    }
  }

  // Greedy best-match fallback: if equal counts remain, pair by best available similarity.
  // This handles cases where RB/BL naming conventions diverge significantly.
  let remainingRb = Array.from(unmatchedRb.values());
  let remainingBl = blCandidates.filter(bl => !matchedBl.has(bl.minifigNo));

  if (remainingRb.length > 0 && remainingRb.length === remainingBl.length) {
    // Sort RB by name length (shorter = more generic, match last)
    const sortedRb = [...remainingRb].sort(
      (a, b) => b.name.length - a.name.length
    );
    for (const rb of sortedRb) {
      if (!unmatchedRb.has(rb.fig_num)) continue;
      const available = blCandidates.filter(bl => !matchedBl.has(bl.minifigNo));
      if (available.length === 0) break;

      let best: {
        bl: BlCandidate;
        score: number;
        imageSimilarity: number | null;
      } | null = null;
      for (const bl of available) {
        // Calculate image similarity if both hashes are available
        let imageSimilarity: number | null = null;
        if (rb.imageHash && bl.imageHash) {
          try {
            const { calculateImageSimilarity } = await getImageHashModule();
            imageSimilarity = calculateImageSimilarity(
              rb.imageHash,
              bl.imageHash
            );
          } catch (error) {
            imageSimilarity = null;
          }
        }

        const { score } = calculateCombinedSimilarity(rb, bl, imageSimilarity);
        if (!best || score > best.score) {
          best = { bl, score, imageSimilarity };
        }
      }
      if (best) {
        // Apply set size boost to greedy fallback matches
        const totalFigs = rbCandidates.length;
        const boost = calculateSetSizeBoost(totalFigs, best.score);
        const finalConfidence = Math.min(1.0, best.score + boost);

        recordMatch(
          rb,
          best.bl,
          finalConfidence,
          'set:greedy-fallback',
          best.imageSimilarity
        );
      }
    }
  }

  // Stage 4.5: Process of Elimination
  // If most figs are high-confidence and only 1-2 low-confidence remain, boost them
  remainingRb = Array.from(unmatchedRb.values());
  remainingBl = blCandidates.filter(bl => !matchedBl.has(bl.minifigNo));

  const totalFigsInSet = rbCandidates.length;
  const highConfMatches = mappingRows.filter(
    m => (m.confidence ?? 0) >= 0.7
  ).length;
  const highConfRatio = highConfMatches / totalFigsInSet;

  if (
    highConfRatio >= 0.75 && // Most figs solved (75%+)
    remainingRb.length >= 1 &&
    remainingRb.length <= 2 && // 1-2 low-conf remain
    remainingRb.length === remainingBl.length && // Equal counts
    rbCandidates.length === blCandidates.length // Complete set (no mismatches)
  ) {
    // Build image similarity cache for checking alternatives
    const imageSimilarityCache = new Map<string, number | null>();

    for (const rb of remainingRb) {
      let best: {
        bl: BlCandidate;
        score: number;
        imageSimilarity: number | null;
      } | null = null;

      for (const bl of remainingBl) {
        // Calculate image similarity if available
        let imageSimilarity: number | null = null;
        if (rb.imageHash && bl.imageHash) {
          try {
            const { calculateImageSimilarity } = await getImageHashModule();
            imageSimilarity = calculateImageSimilarity(
              rb.imageHash,
              bl.imageHash
            );
          } catch {
            imageSimilarity = null;
          }
        }

        const imageKey = `${rb.fig_num}-${bl.minifigNo}`;
        imageSimilarityCache.set(imageKey, imageSimilarity);

        const { score } = calculateCombinedSimilarity(rb, bl, imageSimilarity);

        if (score > (best?.score ?? 0)) {
          best = { bl, score, imageSimilarity };
        }
      }

      if (
        best &&
        isOnlyViableOption(rb, best.bl, remainingBl, imageSimilarityCache)
      ) {
        recordMatch(rb, best.bl, 0.9, 'set:elimination', best.imageSimilarity);
      }
    }
  }

  // Stage 5: Final fallback - if exactly one RB and one BL remain, pair them.
  remainingRb = Array.from(unmatchedRb.values());
  remainingBl = blCandidates.filter(bl => !matchedBl.has(bl.minifigNo));
  if (remainingRb.length === 1 && remainingBl.length === 1) {
    // Single remaining fig gets perfect confidence (only option)
    recordMatch(remainingRb[0]!, remainingBl[0]!, 1.0, 'set:single-fig');
  }

  if (mappingRows.length === 0) {
    return { count: 0, pairs: [] };
  }

  // Duplicate Prevention: Ensure no two RB figs map to same BL fig
  const { valid: validMappings, conflicts } = detectDuplicateMappings(
    mappingRows,
    logPrefix
  );

  if (conflicts.length > 0) {
    // eslint-disable-next-line no-console
    console.warn(
      `${logPrefix} Resolved ${conflicts.length} duplicate mapping(s) for set ${setNum}`
    );
  }

  // Check for existing manually approved mappings - we should NOT overwrite these
  const rbFigIds = validMappings.map(m => m.rb_fig_id);
  const { data: existingMappings } = await supabase
    .from('bricklink_minifig_mappings')
    .select('rb_fig_id, bl_item_id, confidence, source, manually_approved')
    .in('rb_fig_id', rbFigIds);

  const manuallyApproved = new Set(
    (existingMappings || [])
      .filter(m => m.manually_approved === true)
      .map(m => m.rb_fig_id)
  );

  // Filter out manually approved mappings from the update
  const mappingsToUpsert = validMappings.filter(
    m => !manuallyApproved.has(m.rb_fig_id)
  );

  if (manuallyApproved.size > 0) {
    // eslint-disable-next-line no-console
    console.log(
      `${logPrefix} Preserving ${manuallyApproved.size} manually approved mapping(s) for set ${setNum}`
    );
  }

  if (mappingsToUpsert.length === 0) {
    // eslint-disable-next-line no-console
    console.log(
      `${logPrefix} All mappings for set ${setNum} are manually approved - no updates needed`
    );
    return { count: validMappings.length, pairs: pairedIds };
  }

  const { error: mapErr } = await supabase
    .from('bricklink_minifig_mappings')
    .upsert(mappingsToUpsert, { onConflict: 'rb_fig_id' });

  if (mapErr) {
    // eslint-disable-next-line no-console
    console.error(
      `${logPrefix} Failed to upsert fig mappings for set`,
      setNum,
      mapErr.message
    );
    return { count: 0, pairs: [] };
  }

  // Log mapping quality for observability.
  const confidences = mappingsToUpsert.map(row => row.confidence ?? 0);
  const total = confidences.length;
  const avgConfidence =
    confidences.reduce((sum, v) => sum + v, 0) / (total || 1);
  const minConfidence = confidences.length ? Math.min(...confidences) : null;
  const lowConfidenceCount = confidences.filter(v => v < 0.5).length;
  // eslint-disable-next-line no-console
  console.log(`${logPrefix} Mapping stats for set ${setNum}`, {
    total: validMappings.length,
    updated: mappingsToUpsert.length,
    preserved: manuallyApproved.size,
    lowConfidenceCount,
    minConfidence,
    avgConfidence: Number.isFinite(avgConfidence) ? avgConfidence : null,
  });

  return { count: validMappings.length, pairs: pairedIds };
}

// =============================================================================
// MINIFIG COMPONENT PART MAPPING
// =============================================================================

type BlMinifigPartEntry = {
  bl_part_id: string;
  bl_color_id: number;
  name: string | null;
  quantity: number;
};

/**
 * Check if a BL minifig has had its component parts synced.
 */
async function isMinifigPartsSynced(
  supabase: SupabaseClient<Database>,
  blMinifigNo: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('bricklink_minifigs')
    .select('parts_sync_status')
    .eq('item_id', blMinifigNo)
    .maybeSingle();

  if (error) {
    return false;
  }

  return data?.parts_sync_status === 'ok';
}

/**
 * Fetch and cache BL minifig component parts.
 * Returns the list of parts, or null if already synced or on error.
 */
async function fetchAndCacheMinifigParts(
  supabase: SupabaseClient<Database>,
  blMinifigNo: string,
  logPrefix: string
): Promise<BlMinifigPartEntry[] | null> {
  // Check if already synced
  if (await isMinifigPartsSynced(supabase, blMinifigNo)) {
    return null; // Already synced, skip API call
  }

  let blParts: ScriptBLMinifigPart[] = [];
  try {
    blParts = await getMinifigParts(blMinifigNo);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(
      `${logPrefix} Failed to fetch BL parts for minifig`,
      blMinifigNo,
      err
    );
    // Mark as error so we don't retry indefinitely
    await supabase.from('bricklink_minifigs').upsert(
      {
        item_id: blMinifigNo,
        name: blMinifigNo, // Placeholder name
        parts_sync_status: 'error',
        last_parts_sync_at: new Date().toISOString(),
      },
      { onConflict: 'item_id' }
    );
    return null;
  }

  const parts: BlMinifigPartEntry[] = blParts.map(p => ({
    bl_part_id: p.item.no,
    bl_color_id: p.color_id ?? 0,
    name: p.item.name ?? null,
    quantity: p.quantity ?? 1,
  }));

  // Cache in bl_minifig_parts
  if (parts.length > 0) {
    const rows = parts.map(p => ({
      bl_minifig_no: blMinifigNo,
      bl_part_id: p.bl_part_id,
      bl_color_id: p.bl_color_id,
      name: p.name,
      quantity: p.quantity,
      last_refreshed_at: new Date().toISOString(),
    }));

    const { error: upsertErr } = await supabase
      .from('bl_minifig_parts')
      .upsert(rows);

    if (upsertErr) {
      // eslint-disable-next-line no-console
      console.error(
        `${logPrefix} Failed to cache bl_minifig_parts for`,
        blMinifigNo,
        upsertErr.message
      );
    }
  }

  // Update sync status
  await supabase.from('bricklink_minifigs').upsert(
    {
      item_id: blMinifigNo,
      name: blMinifigNo, // Placeholder name, will be overwritten if entry exists
      parts_sync_status: 'ok',
      last_parts_sync_at: new Date().toISOString(),
    },
    { onConflict: 'item_id' }
  );

  return parts;
}

/**
 * Load RB minifig parts from the Rebrickable catalog (via Supabase).
 */
async function loadRbMinifigParts(
  supabase: SupabaseClient<Database>,
  rbFigId: string
): Promise<Array<{ part_num: string; color_id: number; quantity: number }>> {
  const { data, error } = await supabase
    .from('rb_minifig_parts')
    .select('part_num, color_id, quantity')
    .eq('fig_num', rbFigId);

  if (error || !data) {
    return [];
  }

  return data;
}

/**
 * Load cached BL minifig parts from Supabase.
 */
async function loadBlMinifigParts(
  supabase: SupabaseClient<Database>,
  blMinifigNo: string
): Promise<BlMinifigPartEntry[]> {
  const { data, error } = await supabase
    .from('bl_minifig_parts')
    .select('bl_part_id, bl_color_id, name, quantity')
    .eq('bl_minifig_no', blMinifigNo);

  if (error || !data) {
    return [];
  }

  return data;
}

// Minifig part categories for matching
type PartCategory =
  | 'head'
  | 'torso'
  | 'legs'
  | 'hips'
  | 'arms'
  | 'hands'
  | 'accessory'
  | 'other';

function categorizePartByName(name: string | null): PartCategory {
  if (!name) return 'other';
  const lower = name.toLowerCase();
  if (lower.includes('head') || lower.includes('face')) return 'head';
  if (lower.includes('torso') || lower.includes('body')) return 'torso';
  if (lower.includes('leg') && !lower.includes('hips')) return 'legs';
  if (lower.includes('hips')) return 'hips';
  if (lower.includes('arm')) return 'arms';
  if (lower.includes('hand')) return 'hands';
  return 'accessory';
}

/**
 * Map RB minifig parts to BL minifig parts by category and position.
 * Returns mappings to persist in part_id_mappings table.
 */
async function mapMinifigComponentParts(
  supabase: SupabaseClient<Database>,
  rbFigId: string,
  blMinifigNo: string,
  logPrefix: string
): Promise<number> {
  const rbParts = await loadRbMinifigParts(supabase, rbFigId);
  const blParts = await loadBlMinifigParts(supabase, blMinifigNo);

  if (rbParts.length === 0 || blParts.length === 0) {
    return 0;
  }

  // Group parts by category
  type CategorizedPart<T> = { part: T; category: PartCategory };

  // For RB parts, we need to fetch names from rb_parts
  const rbPartNums = rbParts.map(p => p.part_num);
  const { data: rbPartDetails } = await supabase
    .from('rb_parts')
    .select('part_num, name')
    .in('part_num', rbPartNums);

  const rbNameMap = new Map<string, string>();
  for (const p of rbPartDetails ?? []) {
    rbNameMap.set(p.part_num, p.name);
  }

  const categorizedRb: CategorizedPart<(typeof rbParts)[0]>[] = rbParts.map(
    p => ({
      part: p,
      category: categorizePartByName(rbNameMap.get(p.part_num) ?? null),
    })
  );

  const categorizedBl: CategorizedPart<BlMinifigPartEntry>[] = blParts.map(
    p => ({
      part: p,
      category: categorizePartByName(p.name),
    })
  );

  // Match parts by category
  const mappings: Array<{
    rb_part_id: string;
    bl_part_id: string;
    confidence: number;
  }> = [];
  const matchedBlParts = new Set<string>();

  // Group by category for matching
  const blByCategory = new Map<
    PartCategory,
    CategorizedPart<BlMinifigPartEntry>[]
  >();
  for (const bl of categorizedBl) {
    const list = blByCategory.get(bl.category) ?? [];
    list.push(bl);
    blByCategory.set(bl.category, list);
  }

  for (const rb of categorizedRb) {
    const candidates = blByCategory.get(rb.category) ?? [];
    const available = candidates.filter(
      c => !matchedBlParts.has(c.part.bl_part_id)
    );

    if (available.length === 0) continue;

    // Prefer color match
    let matched = available.find(c => c.part.bl_color_id === rb.part.color_id);

    // If no color match, take first available in category
    if (!matched && available.length === 1) {
      matched = available[0];
    }

    if (matched) {
      mappings.push({
        rb_part_id: rb.part.part_num,
        bl_part_id: matched.part.bl_part_id,
        confidence: matched.part.bl_color_id === rb.part.color_id ? 0.9 : 0.7,
      });
      matchedBlParts.add(matched.part.bl_part_id);
    }
  }

  if (mappings.length === 0) {
    return 0;
  }

  // Persist to part_id_mappings
  const rows = mappings.map(m => ({
    rb_part_id: m.rb_part_id,
    bl_part_id: m.bl_part_id,
    source: 'minifig-component',
    confidence: m.confidence,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from('part_id_mappings')
    .upsert(rows, { onConflict: 'rb_part_id' });

  if (error) {
    // eslint-disable-next-line no-console
    console.error(
      `${logPrefix} Failed to persist part mappings for ${rbFigId}→${blMinifigNo}`,
      error.message
    );
    return 0;
  }

  // eslint-disable-next-line no-console
  console.log(
    `${logPrefix} Mapped ${mappings.length} component parts for ${rbFigId}→${blMinifigNo}`
  );

  return mappings.length;
}

/**
 * Process minifig component part mappings for a list of RB↔BL minifig pairs.
 * This function respects rate limits by tracking API calls made.
 *
 * @param pairs - List of { rbFigId, blItemId } pairs from minifig mapping
 * @param maxApiCalls - Maximum number of BrickLink API calls to make (for rate limiting)
 * @returns Number of API calls made
 */
export async function processMinifigComponentMappings(
  supabase: SupabaseClient<Database>,
  pairs: Array<{ rbFigId: string; blItemId: string }>,
  maxApiCalls: number,
  logPrefix: string
): Promise<{ apiCallsMade: number; partsMapped: number }> {
  let apiCallsMade = 0;
  let partsMapped = 0;

  for (const { rbFigId, blItemId } of pairs) {
    if (apiCallsMade >= maxApiCalls) {
      // eslint-disable-next-line no-console
      console.log(
        `${logPrefix} Rate limit reached (${maxApiCalls} API calls), stopping component mapping`
      );
      break;
    }

    // Fetch BL minifig parts (makes 1 API call if not already cached)
    const blParts = await fetchAndCacheMinifigParts(
      supabase,
      blItemId,
      logPrefix
    );

    if (blParts !== null) {
      // Made an API call (wasn't already cached)
      apiCallsMade++;
    }

    // Map RB parts to BL parts (no API calls, uses cached data)
    const mapped = await mapMinifigComponentParts(
      supabase,
      rbFigId,
      blItemId,
      logPrefix
    );
    partsMapped += mapped;
  }

  return { apiCallsMade, partsMapped };
}
