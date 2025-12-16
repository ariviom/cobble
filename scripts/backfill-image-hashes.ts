#!/usr/bin/env tsx
/**
 * Backfill image hashes for existing minifigs in the database
 * This script processes RB minifigs and BL set minifigs to generate perceptual hashes
 * for their images, enabling visual similarity matching
 */

import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../supabase/types';
import { generateImageHash } from './lib/imageHash';
import { requireEnv } from './minifig-mapping-core';

dotenv.config();
if (process.env.NODE_ENV !== 'production') {
  dotenv.config({ path: '.env.local', override: true });
}

const BATCH_SIZE = 50;
const DELAY_BETWEEN_BATCHES_MS = 2000; // 2 seconds between batches
const DELAY_BETWEEN_IMAGES_MS = 200; // 200ms between individual images

async function main() {
  const supabase = createClient<Database>(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY')
  );

  const mode = process.argv[2] || 'both'; // 'rb', 'bl', or 'both'

  console.log('[backfill-hashes] Starting image hash backfill...');
  console.log(`[backfill-hashes] Mode: ${mode}`);

  if (mode === 'rb' || mode === 'both') {
    await backfillRebrickableHashes(supabase);
  }

  if (mode === 'bl' || mode === 'both') {
    await backfillBrickLinkHashes(supabase);
  }

  console.log('[backfill-hashes] ✅ Backfill complete!');
}

/**
 * Backfill image hashes for Rebrickable minifigs
 */
async function backfillRebrickableHashes(
  supabase: ReturnType<typeof createClient<Database>>
) {
  console.log('\n[backfill-hashes] Processing Rebrickable minifig images...');

  // Get all rb_minifig_images without hashes
  const { data: images, error } = await supabase
    .from('rb_minifig_images')
    .select('fig_num, image_url')
    .is('image_hash', null)
    .not('image_url', 'is', null);

  if (error) {
    console.error('[backfill-hashes] Error fetching RB images:', error);
    return;
  }

  if (!images || images.length === 0) {
    console.log('[backfill-hashes] No RB images to process.');
    return;
  }

  console.log(`[backfill-hashes] Found ${images.length} RB images to hash`);

  let processed = 0;
  let succeeded = 0;
  let failed = 0;

  // Process in batches
  for (let i = 0; i < images.length; i += BATCH_SIZE) {
    const batch = images.slice(i, i + BATCH_SIZE);

    console.log(
      `[backfill-hashes] Processing RB batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(images.length / BATCH_SIZE)}...`
    );

    for (const image of batch) {
      try {
        const imageHash = await generateImageHash(image.image_url);

        // Update the database
        const { error: updateError } = await supabase
          .from('rb_minifig_images')
          .update({
            image_hash: imageHash,
            image_hash_algorithm: 'phash',
          })
          .eq('fig_num', image.fig_num);

        if (updateError) {
          console.error(
            `[backfill-hashes] Error updating hash for ${image.fig_num}:`,
            updateError
          );
          failed++;
        } else {
          succeeded++;
        }

        processed++;

        // Progress update every 10 images
        if (processed % 10 === 0) {
          console.log(
            `[backfill-hashes] Progress: ${processed}/${images.length} (${succeeded} succeeded, ${failed} failed)`
          );
        }

        // Delay between images
        await new Promise(resolve =>
          setTimeout(resolve, DELAY_BETWEEN_IMAGES_MS)
        );
      } catch (error) {
        console.error(
          `[backfill-hashes] Failed to hash ${image.fig_num}:`,
          error
        );
        failed++;
        processed++;
      }
    }

    // Delay between batches
    if (i + BATCH_SIZE < images.length) {
      console.log(
        `[backfill-hashes] Waiting ${DELAY_BETWEEN_BATCHES_MS}ms before next batch...`
      );
      await new Promise(resolve =>
        setTimeout(resolve, DELAY_BETWEEN_BATCHES_MS)
      );
    }
  }

  console.log(
    `[backfill-hashes] ✅ RB processing complete: ${succeeded} succeeded, ${failed} failed`
  );
}

/**
 * Backfill image hashes for BrickLink set minifigs
 */
async function backfillBrickLinkHashes(
  supabase: ReturnType<typeof createClient<Database>>
) {
  console.log('\n[backfill-hashes] Processing BrickLink set minifig images...');

  // Get all bl_set_minifigs without hashes and with image URLs
  const { data: minifigs, error } = await supabase
    .from('bl_set_minifigs')
    .select('set_num, minifig_no, image_url')
    .is('image_hash', null)
    .not('image_url', 'is', null);

  if (error) {
    console.error('[backfill-hashes] Error fetching BL minifigs:', error);
    return;
  }

  if (!minifigs || minifigs.length === 0) {
    console.log('[backfill-hashes] No BL minifigs to process.');
    return;
  }

  console.log(`[backfill-hashes] Found ${minifigs.length} BL minifigs to hash`);

  let processed = 0;
  let succeeded = 0;
  let failed = 0;

  // Process in batches
  for (let i = 0; i < minifigs.length; i += BATCH_SIZE) {
    const batch = minifigs.slice(i, i + BATCH_SIZE);

    console.log(
      `[backfill-hashes] Processing BL batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(minifigs.length / BATCH_SIZE)}...`
    );

    for (const minifig of batch) {
      try {
        if (!minifig.image_url) {
          console.log(`  ⚠️  Skipping ${minifig.minifig_no} - no image URL`);
          continue;
        }
        const imageHash = await generateImageHash(minifig.image_url);

        // Update the database
        const { error: updateError } = await supabase
          .from('bl_set_minifigs')
          .update({
            image_hash: imageHash,
            image_hash_algorithm: 'phash',
          })
          .eq('set_num', minifig.set_num)
          .eq('minifig_no', minifig.minifig_no);

        if (updateError) {
          console.error(
            `[backfill-hashes] Error updating hash for ${minifig.set_num}/${minifig.minifig_no}:`,
            updateError
          );
          failed++;
        } else {
          succeeded++;
        }

        processed++;

        // Progress update every 10 images
        if (processed % 10 === 0) {
          console.log(
            `[backfill-hashes] Progress: ${processed}/${minifigs.length} (${succeeded} succeeded, ${failed} failed)`
          );
        }

        // Delay between images
        await new Promise(resolve =>
          setTimeout(resolve, DELAY_BETWEEN_IMAGES_MS)
        );
      } catch (error) {
        console.error(
          `[backfill-hashes] Failed to hash ${minifig.set_num}/${minifig.minifig_no}:`,
          error
        );
        failed++;
        processed++;
      }
    }

    // Delay between batches
    if (i + BATCH_SIZE < minifigs.length) {
      console.log(
        `[backfill-hashes] Waiting ${DELAY_BETWEEN_BATCHES_MS}ms before next batch...`
      );
      await new Promise(resolve =>
        setTimeout(resolve, DELAY_BETWEEN_BATCHES_MS)
      );
    }
  }

  console.log(
    `[backfill-hashes] ✅ BL processing complete: ${succeeded} succeeded, ${failed} failed`
  );
}

main().catch(error => {
  console.error('[backfill-hashes] Fatal error:', error);
  process.exit(1);
});
