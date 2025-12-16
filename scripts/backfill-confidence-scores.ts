#!/usr/bin/env tsx
/**
 * Backfill confidence scores for existing minifig mappings
 * Shows before/after comparison and processes with enhanced algorithm
 */

import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../supabase/types';
import {
  requireEnv,
  processSetForMinifigMapping,
} from './minifig-mapping-core';

dotenv.config();
if (process.env.NODE_ENV !== 'production') {
  dotenv.config({ path: '.env.local', override: true });
}

const BATCH_SIZE = 50;
const DELAY_BETWEEN_SETS_MS = 500; // Rate limiting

type MappingComparison = {
  setNum: string;
  setName: string;
  rbFigId: string;
  rbName: string;
  blItemId: string;
  blName: string;
  oldConfidence: number;
  newConfidence: number;
  oldSource: string;
  newSource: string;
  change: number;
};

type UnmappedFix = {
  setNum: string;
  setName: string;
  blItemId: string;
  blName: string;
  rbFigId: string;
  rbName: string;
  confidence: number;
  source: string;
};

async function main() {
  const minConfidence = Number(process.argv[2] || 0);
  const maxConfidence = Number(process.argv[3] || 0.7);
  const dryRun = process.argv[4] === '--dry-run';
  const maxSets = Number(process.argv[5] || 0); // 0 = unlimited

  console.log('[backfill-confidence] 🚀 Starting confidence score backfill...');
  console.log(
    `[backfill-confidence] Target: mappings with confidence ${minConfidence.toFixed(2)} - ${maxConfidence.toFixed(2)}`
  );
  console.log(
    `[backfill-confidence] Mode: ${dryRun ? '🔍 DRY RUN' : '✍️  LIVE'}`
  );
  if (maxSets > 0) {
    console.log(`[backfill-confidence] Max sets: ${maxSets}`);
  }

  const supabase = createClient<Database>(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY')
  );

  // Get existing mappings with their set information
  const { data: mappingsData, error: mappingsErr } = await supabase
    .from('bricklink_minifig_mappings')
    .select(
      `
      rb_fig_id,
      bl_item_id,
      confidence,
      source
    `
    )
    .gte('confidence', minConfidence)
    .lte('confidence', maxConfidence)
    .order('confidence', { ascending: true });

  if (mappingsErr || !mappingsData) {
    console.error(
      '[backfill-confidence] ❌ Error fetching mappings:',
      mappingsErr
    );
    return;
  }

  console.log(
    `[backfill-confidence] Found ${mappingsData.length} low-confidence mappings`
  );

  // Get set numbers for these rb_fig_ids
  const rbFigIds = mappingsData.map(m => m.rb_fig_id);
  const { data: invData, error: invErr } = await supabase
    .from('rb_inventory_minifigs')
    .select('fig_num, inventory:rb_inventories!inner(set_num)')
    .in('fig_num', rbFigIds);

  if (invErr || !invData) {
    console.error(
      '[backfill-confidence] ❌ Error fetching inventory data:',
      invErr
    );
    return;
  }

  // Group mappings by set
  const setMappings = new Map<string, typeof mappingsData>();
  for (const inv of invData) {
    const setNum = (inv.inventory as any)?.set_num;
    if (!setNum) continue;

    const mappings = mappingsData.filter(m => m.rb_fig_id === inv.fig_num);
    if (mappings.length === 0) continue;

    const existing = setMappings.get(setNum) || [];
    setMappings.set(setNum, [...existing, ...mappings]);
  }

  const setNums = Array.from(setMappings.keys()).slice(
    0,
    maxSets > 0 ? maxSets : undefined
  );
  console.log(`[backfill-confidence] Processing ${setNums.length} sets\n`);

  const comparisons: MappingComparison[] = [];
  const unmappedFixes: UnmappedFix[] = [];
  let processed = 0;
  let improved = 0;
  let degraded = 0;
  let unchanged = 0;
  let totalChangeSum = 0;
  let unmappedFixed = 0;

  // Process sets in batches
  for (let i = 0; i < setNums.length; i += BATCH_SIZE) {
    const batch = setNums.slice(i, i + BATCH_SIZE);

    console.log(
      `[backfill-confidence] 📦 Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(setNums.length / BATCH_SIZE)}`
    );

    for (const setNum of batch) {
      try {
        const oldMappings = setMappings.get(setNum) || [];
        if (oldMappings.length === 0) continue;

        // Get set name
        const { data: setData } = await supabase
          .from('rb_sets')
          .select('name')
          .eq('set_num', setNum)
          .single();

        const setName = setData?.name || setNum;

        // Get RB and BL minifig names
        const { data: rbMinifigs } = await supabase
          .from('rb_minifigs')
          .select('fig_num, name')
          .in(
            'fig_num',
            oldMappings.map(m => m.rb_fig_id)
          );

        const { data: blMinifigs } = await supabase
          .from('bl_set_minifigs')
          .select('minifig_no, name')
          .eq('set_num', setNum)
          .in(
            'minifig_no',
            oldMappings.map(m => m.bl_item_id)
          );

        const rbNameMap = new Map(
          rbMinifigs?.map(r => [r.fig_num, r.name]) || []
        );
        const blNameMap = new Map(
          blMinifigs?.map(b => [b.minifig_no, b.name]) || []
        );

        // Reprocess the set with new algorithm
        console.log(`  ⚙️  Reprocessing ${setNum} (${setName})...`);
        const result = await processSetForMinifigMapping(
          supabase,
          setNum,
          '[backfill]',
          true // force = true
        );

        if (!result.processed) {
          console.log(`  ⚠️  Skipped ${setNum}`);
          continue;
        }

        // Get updated mappings
        const { data: newMappings } = await supabase
          .from('bricklink_minifig_mappings')
          .select('rb_fig_id, bl_item_id, confidence, source')
          .in(
            'rb_fig_id',
            oldMappings.map(m => m.rb_fig_id)
          );

        if (!newMappings) continue;

        // Compare old vs new
        for (const oldMap of oldMappings) {
          const newMap = newMappings.find(
            n => n.rb_fig_id === oldMap.rb_fig_id
          );
          if (
            !newMap ||
            newMap.confidence === null ||
            oldMap.confidence === null
          )
            continue;

          const change = newMap.confidence - oldMap.confidence;
          totalChangeSum += change;

          if (Math.abs(change) >= 0.01) {
            if (change > 0) improved++;
            else degraded++;
          } else {
            unchanged++;
          }

          comparisons.push({
            setNum,
            setName,
            rbFigId: oldMap.rb_fig_id,
            rbName: rbNameMap.get(oldMap.rb_fig_id) || oldMap.rb_fig_id,
            blItemId: oldMap.bl_item_id,
            blName: blNameMap.get(oldMap.bl_item_id) || oldMap.bl_item_id,
            oldConfidence: oldMap.confidence,
            newConfidence: newMap.confidence,
            oldSource: oldMap.source || 'unknown',
            newSource: newMap.source || 'unknown',
            change,
          });

          // Show detailed comparison for significant changes
          if (Math.abs(change) >= 0.05) {
            const arrow = change > 0 ? '📈' : '📉';
            const sign = change > 0 ? '+' : '';
            console.log(
              `  ${arrow} ${oldMap.rb_fig_id}: ${oldMap.confidence.toFixed(2)} → ${newMap.confidence.toFixed(2)} (${sign}${change.toFixed(2)})`
            );
          }
        }

        // Check for unmapped BL minifigs and attempt to fix them
        const { data: unmappedBL } = await supabase
          .from('bl_set_minifigs')
          .select('minifig_no, name, rb_fig_id')
          .eq('set_num', setNum)
          .is('rb_fig_id', null);

        if (unmappedBL && unmappedBL.length > 0) {
          console.log(
            `  🔍 Found ${unmappedBL.length} unmapped BL minifigs in ${setNum}`
          );

          // Get all RB minifigs for this set from all inventory versions
          const { data: allRbFigs } = await supabase
            .from('rb_inventory_minifigs')
            .select(
              `
              fig_num,
              rb_inventories!inner(set_num)
            `
            )
            .eq('rb_inventories.set_num', setNum);

          if (allRbFigs && allRbFigs.length > 0) {
            const rbFigNums = Array.from(
              new Set(allRbFigs.map(f => f.fig_num))
            );

            // Get RB minifig names
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
              linkedRbFigs?.map(l => l.rb_fig_id) || []
            );
            const unlinkedRbFigs =
              rbMinifigDetails?.filter(rb => !linkedRbFigIds.has(rb.fig_num)) ||
              [];

            if (unlinkedRbFigs.length > 0) {
              console.log(
                `  🔍 Found ${unlinkedRbFigs.length} unlinked RB minifigs`
              );

              // Try to match unmapped BL to unlinked RB by name similarity
              for (const bl of unmappedBL) {
                let bestMatch: {
                  fig_num: string;
                  name: string;
                  score: number;
                } | null = null;

                for (const rb of unlinkedRbFigs) {
                  // Simple name-based similarity (you could enhance this)
                  const blName = (bl.name || '').toLowerCase();
                  const rbName = (rb.name || '').toLowerCase();

                  // Calculate similarity score (simplified for now)
                  let score = 0;

                  // Check for key terms
                  const blWords = blName.split(/\s+/);
                  const rbWords = rbName.split(/\s+/);

                  for (const blWord of blWords) {
                    if (blWord.length < 3) continue;
                    for (const rbWord of rbWords) {
                      if (rbWord.includes(blWord) || blWord.includes(rbWord)) {
                        score += 0.3;
                      }
                    }
                  }

                  if (score > 0 && (!bestMatch || score > bestMatch.score)) {
                    bestMatch = { fig_num: rb.fig_num, name: rb.name, score };
                  }
                }

                // If we found a reasonable match, create the mapping
                if (bestMatch && bestMatch.score >= 0.3) {
                  console.log(
                    `  ✨ Mapping ${bl.minifig_no} (${bl.name}) → ${bestMatch.fig_num} (${bestMatch.name}) [score: ${bestMatch.score.toFixed(2)}]`
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
                        `  ⚠️  Skipping ${bestMatch.fig_num} - already has manual approval`
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
                    await supabase.from('bricklink_minifig_mappings').upsert({
                      rb_fig_id: bestMatch.fig_num,
                      bl_item_id: bl.minifig_no,
                      confidence: Math.min(0.95, bestMatch.score + 0.5), // Boost confidence but cap at 0.95
                      source: 'backfill:name-match',
                      manually_approved: false,
                    });
                  }

                  unmappedFixes.push({
                    setNum,
                    setName,
                    blItemId: bl.minifig_no,
                    blName: bl.name || bl.minifig_no,
                    rbFigId: bestMatch.fig_num,
                    rbName: bestMatch.name,
                    confidence: Math.min(0.95, bestMatch.score + 0.5),
                    source: 'backfill:name-match',
                  });

                  unmappedFixed++;

                  // Remove from unlinked list so we don't map multiple BL to same RB
                  const idx = unlinkedRbFigs.findIndex(
                    r => r.fig_num === bestMatch!.fig_num
                  );
                  if (idx >= 0) {
                    unlinkedRbFigs.splice(idx, 1);
                  }
                }
              }
            }
          }
        }

        processed++;

        // Rate limiting
        if (i + 1 < setNums.length) {
          await new Promise(resolve =>
            setTimeout(resolve, DELAY_BETWEEN_SETS_MS)
          );
        }
      } catch (error) {
        console.error(`  ❌ Error processing ${setNum}:`, error);
      }
    }
  }

  // Summary statistics
  console.log('\n' + '='.repeat(80));
  console.log('📊 SUMMARY');
  console.log('='.repeat(80));
  console.log(`Sets processed: ${processed}`);
  console.log(`Total mappings: ${comparisons.length}`);
  console.log(
    `  📈 Improved: ${improved} (${((improved / comparisons.length) * 100).toFixed(1)}%)`
  );
  console.log(
    `  📉 Degraded: ${degraded} (${((degraded / comparisons.length) * 100).toFixed(1)}%)`
  );
  console.log(
    `  ➡️  Unchanged: ${unchanged} (${((unchanged / comparisons.length) * 100).toFixed(1)}%)`
  );
  console.log(
    `Average change: ${(totalChangeSum / comparisons.length).toFixed(3)}`
  );
  console.log(`\n✨ Unmapped minifigs fixed: ${unmappedFixed}`);

  // Top improvements
  const topImprovements = comparisons
    .filter(c => c.change > 0)
    .sort((a, b) => b.change - a.change)
    .slice(0, 10);

  if (topImprovements.length > 0) {
    console.log('\n🏆 Top 10 Improvements:');
    console.log('-'.repeat(80));
    for (const comp of topImprovements) {
      console.log(`${comp.setNum} | ${comp.rbName} → ${comp.blName}`);
      console.log(
        `  ${comp.oldConfidence.toFixed(2)} → ${comp.newConfidence.toFixed(2)} (+${comp.change.toFixed(2)}) | ${comp.oldSource} → ${comp.newSource}`
      );
    }
  }

  // Unmapped fixes
  if (unmappedFixes.length > 0) {
    console.log('\n✨ Unmapped Minifigs Fixed:');
    console.log('-'.repeat(80));
    for (const fix of unmappedFixes) {
      console.log(`${fix.setNum} | ${fix.blName} → ${fix.rbName}`);
      console.log(
        `  ${fix.blItemId} → ${fix.rbFigId} (confidence: ${fix.confidence.toFixed(2)}, source: ${fix.source})`
      );
    }
  }

  // Confidence distribution
  console.log('\n📊 Confidence Distribution (After):');
  console.log('-'.repeat(80));
  const bins = [0, 0.3, 0.5, 0.7, 0.9, 1.0];
  for (let i = 0; i < bins.length - 1; i++) {
    const count = comparisons.filter(
      c => c.newConfidence >= bins[i] && c.newConfidence < bins[i + 1]
    ).length;
    const pct = ((count / comparisons.length) * 100).toFixed(1);
    const bar = '█'.repeat(Math.floor(Number(pct) / 2));
    console.log(
      `${bins[i].toFixed(1)} - ${bins[i + 1].toFixed(1)}: ${count.toString().padStart(4)} (${pct.padStart(5)}%) ${bar}`
    );
  }

  console.log('\n✅ Complete!');
  if (dryRun) {
    console.log(
      'ℹ️  This was a DRY RUN. Changes were saved to demonstrate the algorithm.'
    );
    console.log('ℹ️  Run without --dry-run to apply changes permanently.');
  }
}

main().catch(error => {
  console.error('[backfill-confidence] ❌ Fatal error:', error);
  process.exit(1);
});
