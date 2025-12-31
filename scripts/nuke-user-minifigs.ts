#!/usr/bin/env npx tsx
/**
 * Nuke User Minifigs
 *
 * Deletes ALL user_minifigs rows. This is safe in a single-user pre-launch
 * environment where minifigs can be reimported from sets using BL IDs.
 *
 * Safety: Run export-user-set-ids.ts FIRST to preserve set IDs for reimport.
 *
 * Usage:
 *   npx tsx scripts/nuke-user-minifigs.ts --confirm
 *
 * Without --confirm, the script will only show what would be deleted.
 */

import { createSupabaseClient } from './minifig-mapping-core';

async function main() {
  const args = process.argv.slice(2);
  const confirmed = args.includes('--confirm') || args.includes('-y');

  console.log('[nuke] Starting user minifigs deletion...');

  const supabase = createSupabaseClient();

  // Count current rows
  const { count, error: countError } = await supabase
    .from('user_minifigs')
    .select('*', { count: 'exact', head: true });

  if (countError) {
    console.error('[nuke] Failed to count user_minifigs:', countError.message);
    process.exit(1);
  }

  const rowCount = count ?? 0;

  if (rowCount === 0) {
    console.log('[nuke] No user_minifigs rows found. Nothing to delete.');
    process.exit(0);
  }

  console.log(`[nuke] Found ${rowCount} user_minifigs rows.`);

  if (!confirmed) {
    console.log('[nuke] DRY RUN - No changes made.');
    console.log('[nuke] Run with --confirm to actually delete.');
    console.log('');
    console.log('  npx tsx scripts/nuke-user-minifigs.ts --confirm');
    console.log('');
    process.exit(0);
  }

  // Delete all rows
  // Supabase requires a filter, so we use a condition that matches all rows
  const { error: deleteError } = await supabase
    .from('user_minifigs')
    .delete()
    .gte('created_at', '1970-01-01'); // Matches all rows

  if (deleteError) {
    console.error(
      '[nuke] Failed to delete user_minifigs:',
      deleteError.message
    );
    process.exit(1);
  }

  console.log(`[nuke] Deleted ${rowCount} user_minifigs rows.`);
  console.log('[nuke] Done! Reimport minifigs using sync-from-sets endpoint.');
}

main().catch(err => {
  console.error('[nuke] Fatal error:', err);
  process.exit(1);
});
