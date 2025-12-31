#!/usr/bin/env npx tsx
/**
 * Export User Set IDs
 *
 * Exports all user set IDs (owned and wishlist) to a JSON file for backup.
 * Run this BEFORE nuking user minifigs to preserve the ability to reimport.
 *
 * Usage:
 *   npx tsx scripts/export-user-set-ids.ts
 *   npx tsx scripts/export-user-set-ids.ts --output my-sets.json
 */

import { writeFileSync } from 'node:fs';
import { createSupabaseClient } from './minifig-mapping-core';

const DEFAULT_OUTPUT = 'user-set-ids-export.json';

type ExportData = {
  exportedAt: string;
  userId: string | null;
  owned: string[];
  wishlist: string[];
  counts: {
    owned: number;
    wishlist: number;
    total: number;
  };
};

async function main() {
  // Parse command line args
  const args = process.argv.slice(2);
  let outputPath = DEFAULT_OUTPUT;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--output' || args[i] === '-o') {
      outputPath = args[i + 1] ?? DEFAULT_OUTPUT;
      i++;
    }
  }

  console.log('[export] Starting user set ID export...');

  const supabase = createSupabaseClient();

  // Query all user_sets (single user system, so no user_id filter needed)
  const { data: userSets, error } = await supabase
    .from('user_sets')
    .select('set_num, status, user_id')
    .order('set_num');

  if (error) {
    console.error('[export] Failed to fetch user sets:', error.message);
    process.exit(1);
  }

  if (!userSets || userSets.length === 0) {
    console.log('[export] No user sets found. Nothing to export.');
    process.exit(0);
  }

  // Get user ID (should be same for all rows in single-user system)
  const userId = userSets[0]?.user_id ?? null;

  // Separate by status
  const owned: string[] = [];
  const wishlist: string[] = [];

  for (const set of userSets) {
    if (set.status === 'owned') {
      owned.push(set.set_num);
    } else if (set.status === 'want') {
      wishlist.push(set.set_num);
    }
    // Ignore other statuses (if any)
  }

  const exportData: ExportData = {
    exportedAt: new Date().toISOString(),
    userId,
    owned,
    wishlist,
    counts: {
      owned: owned.length,
      wishlist: wishlist.length,
      total: owned.length + wishlist.length,
    },
  };

  // Write to file
  writeFileSync(outputPath, JSON.stringify(exportData, null, 2));

  console.log('[export] Export complete!');
  console.log(`[export]   Output: ${outputPath}`);
  console.log(`[export]   Owned sets: ${owned.length}`);
  console.log(`[export]   Wishlist sets: ${wishlist.length}`);
  console.log(`[export]   Total: ${owned.length + wishlist.length}`);
}

main().catch(err => {
  console.error('[export] Fatal error:', err);
  process.exit(1);
});
