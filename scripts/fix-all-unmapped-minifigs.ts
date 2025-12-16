#!/usr/bin/env tsx
/**
 * Scan all sets for unmapped BL minifigs and attempt to match them
 * to unlinked RB minifigs from all inventory versions
 */

import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../supabase/types';
import { requireEnv, normalizeName } from './minifig-mapping-core';

dotenv.config();
if (process.env.NODE_ENV !== 'production') {
  dotenv.config({ path: '.env.local', override: true });
}

const BATCH_SIZE = 50;
const DELAY_MS = 500;

type UnmappedFix = {
  setNum: string;
  blItemId: string;
  blName: string;
  rbFigId: string;
  rbName: string;
  confidence: number;
  matchScore: number;
};

/**
 * Calculate enhanced similarity between two names
 */
function calculateNameSimilarity(name1: string, name2: string): number {
  const norm1 = normalizeName(name1);
  const norm2 = normalizeName(name2);

  if (!norm1 || !norm2) return 0;

  // Exact match
  if (norm1 === norm2) return 1.0;

  // Word-based matching
  const words1 = norm1.split(/\s+/).filter(w => w.length >= 3);
  const words2 = norm2.split(/\s+/).filter(w => w.length >= 3);

  if (words1.length === 0 || words2.length === 0) return 0;

  let matchCount = 0;
  let totalWords = Math.max(words1.length, words2.length);

  for (const word1 of words1) {
    for (const word2 of words2) {
      if (word1 === word2) {
        matchCount += 1.0;
      } else if (word1.includes(word2) || word2.includes(word1)) {
        matchCount += 0.5;
      } else if (word1.length >= 4 && word2.length >= 4) {
        // Substring similarity
        let maxCommon = 0;
        for (let i = 0; i < word1.length; i++) {
          for (let j = 0; j < word2.length; j++) {
            let k = 0;
            while (
              i + k < word1.length &&
              j + k < word2.length &&
              word1[i + k] === word2[j + k]
            ) {
              k++;
            }
            maxCommon = Math.max(maxCommon, k);
          }
        }
        if (maxCommon >= 4) {
          matchCount +=
            (maxCommon / Math.max(word1.length, word2.length)) * 0.3;
        }
      }
    }
  }

  return Math.min(1.0, matchCount / totalWords);
}

async function main() {
  const dryRun = process.argv[2] === '--dry-run';
  const maxSets = Number(process.argv[3] || 0); // 0 = unlimited

  console.log('[fix-unmapped] 🚀 Starting unmapped minifig fix...');
  console.log(`[fix-unmapped] Mode: ${dryRun ? '🔍 DRY RUN' : '✍️  LIVE'}`);
  if (maxSets > 0) {
    console.log(`[fix-unmapped] Max sets: ${maxSets}`);
  }

  const supabase = createClient<Database>(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY')
  );

  // Find all sets with unmapped BL minifigs
  console.log('[fix-unmapped] 🔍 Finding sets with unmapped minifigs...');

  const { data: fallbackSets, error: fallbackErr } = await supabase
    .from('bl_set_minifigs')
    .select('set_num')
    .is('rb_fig_id', null);

  if (fallbackErr) {
    console.error('[fix-unmapped] ❌ Error fetching sets:', fallbackErr);
    return;
  }

  const uniqueSets = Array.from(
    new Set(fallbackSets?.map(s => s.set_num) || [])
  );
  console.log(
    `[fix-unmapped] Found ${uniqueSets.length} sets with unmapped minifigs`
  );

  await processSets(
    supabase,
    uniqueSets.slice(0, maxSets || undefined),
    dryRun
  );
}

async function processSets(supabase: any, setNums: string[], dryRun: boolean) {
  const fixes: UnmappedFix[] = [];
  let processed = 0;
  let skipped = 0;

  for (let i = 0; i < setNums.length; i += BATCH_SIZE) {
    const batch = setNums.slice(i, i + BATCH_SIZE);

    console.log(
      `\n[fix-unmapped] 📦 Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(setNums.length / BATCH_SIZE)}`
    );

    for (const setNum of batch) {
      try {
        // Get unmapped BL minifigs
        const { data: unmappedBL } = await supabase
          .from('bl_set_minifigs')
          .select('minifig_no, name')
          .eq('set_num', setNum)
          .is('rb_fig_id', null);

        if (!unmappedBL || unmappedBL.length === 0) {
          skipped++;
          continue;
        }

        console.log(
          `  🔍 ${setNum}: ${unmappedBL.length} unmapped BL minifigs`
        );

        // Get ALL RB minifigs for this set from ALL inventory versions
        const { data: allRbFigs } = await supabase
          .from('rb_inventory_minifigs')
          .select(
            `
            fig_num,
            rb_inventories!inner(set_num)
          `
          )
          .eq('rb_inventories.set_num', setNum);

        if (!allRbFigs || allRbFigs.length === 0) {
          console.log(`  ⚠️  No RB minifigs found for ${setNum}`);
          skipped++;
          continue;
        }

        const rbFigNums = Array.from(
          new Set(allRbFigs.map((f: any) => f.fig_num))
        );

        // Get RB minifig details
        const { data: rbMinifigDetails } = await supabase
          .from('rb_minifigs')
          .select('fig_num, name')
          .in('fig_num', rbFigNums);

        // Find RB minifigs that are NOT already linked to any BL minifig in this set
        const { data: linkedRbFigs } = await supabase
          .from('bl_set_minifigs')
          .select('rb_fig_id')
          .eq('set_num', setNum)
          .not('rb_fig_id', 'is', null);

        const linkedRbFigIds = new Set(
          linkedRbFigs?.map((l: any) => l.rb_fig_id) || []
        );
        const unlinkedRbFigs =
          rbMinifigDetails?.filter(
            (rb: any) => !linkedRbFigIds.has(rb.fig_num)
          ) || [];

        if (unlinkedRbFigs.length === 0) {
          console.log(`  ⚠️  No unlinked RB minifigs available for matching`);
          skipped++;
          continue;
        }

        console.log(
          `  ✨ Attempting to match ${unmappedBL.length} BL → ${unlinkedRbFigs.length} RB`
        );

        // Try to match each unmapped BL to an unlinked RB
        const matchedInThisSet: string[] = [];

        for (const bl of unmappedBL) {
          let bestMatch: {
            fig_num: string;
            name: string;
            score: number;
          } | null = null;

          for (const rb of unlinkedRbFigs) {
            // Skip if already matched in this set
            if (matchedInThisSet.includes(rb.fig_num)) continue;

            const score = calculateNameSimilarity(
              bl.name || bl.minifig_no,
              rb.name || rb.fig_num
            );

            if (score > 0 && (!bestMatch || score > bestMatch.score)) {
              bestMatch = { fig_num: rb.fig_num, name: rb.name, score };
            }
          }

          // Only create mapping if we have decent confidence (>0.3)
          if (bestMatch && bestMatch.score >= 0.3) {
            const confidence = Math.min(0.95, bestMatch.score * 0.9 + 0.1);

            console.log(
              `    ✅ ${bl.minifig_no} → ${bestMatch.fig_num} [score: ${bestMatch.score.toFixed(2)}, conf: ${confidence.toFixed(2)}]`
            );

            if (!dryRun) {
              // Check if this RB fig already has a manually approved mapping
              const { data: existingMapping } = await supabase
                .from('bricklink_minifig_mappings')
                .select('rb_fig_id, manually_approved')
                .eq('rb_fig_id', bestMatch.fig_num)
                .maybeSingle();

              if (existingMapping?.manually_approved) {
                console.log(
                  `    ⚠️  Skipping ${bestMatch.fig_num} - already has manual approval`
                );
                continue;
              }

              // Update bl_set_minifigs
              await supabase
                .from('bl_set_minifigs')
                .update({ rb_fig_id: bestMatch.fig_num })
                .eq('set_num', setNum)
                .eq('minifig_no', bl.minifig_no);

              // Create global mapping (only if not manually approved)
              await supabase.from('bricklink_minifig_mappings').upsert(
                {
                  rb_fig_id: bestMatch.fig_num,
                  bl_item_id: bl.minifig_no,
                  confidence,
                  source: 'script:unmapped-fix',
                  manually_approved: false,
                },
                { onConflict: 'rb_fig_id' }
              );
            }

            fixes.push({
              setNum,
              blItemId: bl.minifig_no,
              blName: bl.name || bl.minifig_no,
              rbFigId: bestMatch.fig_num,
              rbName: bestMatch.name,
              confidence,
              matchScore: bestMatch.score,
            });

            matchedInThisSet.push(bestMatch.fig_num);
          }
        }

        processed++;

        // Rate limiting
        if (i + 1 < setNums.length) {
          await new Promise(resolve => setTimeout(resolve, DELAY_MS));
        }
      } catch (error) {
        console.error(`  ❌ Error processing ${setNum}:`, error);
      }
    }
  }

  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('📊 SUMMARY');
  console.log('='.repeat(80));
  console.log(`Sets processed: ${processed}`);
  console.log(`Sets skipped: ${skipped}`);
  console.log(`Total fixes: ${fixes.length}`);

  if (fixes.length > 0) {
    console.log('\n✨ Unmapped Minifigs Fixed:');
    console.log('-'.repeat(80));

    // Group by set
    const bySet = new Map<string, UnmappedFix[]>();
    for (const fix of fixes) {
      const list = bySet.get(fix.setNum) || [];
      list.push(fix);
      bySet.set(fix.setNum, list);
    }

    for (const [setNum, setFixes] of bySet) {
      console.log(`\n${setNum} (${setFixes.length} fixes):`);
      for (const fix of setFixes) {
        console.log(
          `  ${fix.blItemId} (${fix.blName}) → ${fix.rbFigId} (${fix.rbName})`
        );
        console.log(
          `    Confidence: ${fix.confidence.toFixed(2)}, Match score: ${fix.matchScore.toFixed(2)}`
        );
      }
    }

    // Statistics
    const avgConfidence =
      fixes.reduce((sum, f) => sum + f.confidence, 0) / fixes.length;
    const highConfCount = fixes.filter(f => f.confidence >= 0.7).length;
    const medConfCount = fixes.filter(
      f => f.confidence >= 0.5 && f.confidence < 0.7
    ).length;
    const lowConfCount = fixes.filter(f => f.confidence < 0.5).length;

    console.log('\n📊 Confidence Distribution:');
    console.log(
      `  High (≥0.7): ${highConfCount} (${((highConfCount / fixes.length) * 100).toFixed(1)}%)`
    );
    console.log(
      `  Med (0.5-0.7): ${medConfCount} (${((medConfCount / fixes.length) * 100).toFixed(1)}%)`
    );
    console.log(
      `  Low (<0.5): ${lowConfCount} (${((lowConfCount / fixes.length) * 100).toFixed(1)}%)`
    );
    console.log(`  Average: ${avgConfidence.toFixed(3)}`);
  }

  console.log('\n✅ Complete!');
  if (dryRun) {
    console.log('ℹ️  This was a DRY RUN. No changes were made.');
    console.log('ℹ️  Run without --dry-run to apply changes.');
  }
}

main().catch(error => {
  console.error('[fix-unmapped] ❌ Fatal error:', error);
  process.exit(1);
});
