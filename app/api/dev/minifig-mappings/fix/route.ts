import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { errorResponse } from '@/app/lib/api/responses';
import { getCatalogWriteClient } from '@/app/lib/db/catalogAccess';
import { logger } from '@/lib/metrics';

// Development-only route for fixing minifig mappings at the set level

const FixMappingSchema = z.object({
  set_num: z.string(),
  rb_fig_id: z.string(),
  old_bl_minifig_no: z.string(),
  new_bl_minifig_no: z.string().optional(),
  action: z.enum(['update', 'delete', 'approve']),
  notes: z.string().optional(),
});

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return errorResponse('forbidden', {
      message: 'This endpoint is only available in development',
    });
  }

  try {
    const body = await request.json();
    const input = FixMappingSchema.parse(body);

    const supabase = getCatalogWriteClient();

    if (input.action === 'delete') {
      // Delete the specific set-minifig mapping
      const { error: deleteErr } = await supabase
        .from('bl_set_minifigs')
        .delete()
        .eq('set_num', input.set_num)
        .eq('rb_fig_id', input.rb_fig_id)
        .eq('minifig_no', input.old_bl_minifig_no);

      if (deleteErr) throw deleteErr;

      // Also delete from global mapping if this was the only set using it
      const { data: otherSets } = await supabase
        .from('bl_set_minifigs')
        .select('set_num')
        .eq('rb_fig_id', input.rb_fig_id)
        .eq('minifig_no', input.old_bl_minifig_no);

      if (!otherSets || otherSets.length === 0) {
        await supabase
          .from('bricklink_minifig_mappings')
          .delete()
          .eq('rb_fig_id', input.rb_fig_id)
          .eq('bl_item_id', input.old_bl_minifig_no);
      }

      return NextResponse.json({
        success: true,
        action: 'deleted',
        set_num: input.set_num,
        rb_fig_id: input.rb_fig_id,
      });
    }

    if (input.action === 'update') {
      if (!input.new_bl_minifig_no) {
        return NextResponse.json(
          { error: 'new_bl_minifig_no is required for update action' },
          { status: 400 }
        );
      }

      // Get the BL minifig details from bl_set_minifigs (we know it exists there)
      const { data: blMinifig, error: blErr } = await supabase
        .from('bl_set_minifigs')
        .select('minifig_no, name, image_url')
        .eq('set_num', input.set_num)
        .eq('minifig_no', input.new_bl_minifig_no)
        .single();

      if (blErr || !blMinifig) {
        return errorResponse('not_found', {
          message: 'BrickLink minifig not found in this set',
          details: {
            minifig_no: input.new_bl_minifig_no,
            set_num: input.set_num,
          },
        });
      }

      // Strategy: Update the target BL minifig to point to the new RB fig
      // and unlink the old BL minifig (so it stays available)

      // Step 1: If the target is mapped to a different RB fig, unlink it first
      const { data: existingTarget } = await supabase
        .from('bl_set_minifigs')
        .select('rb_fig_id')
        .eq('set_num', input.set_num)
        .eq('minifig_no', input.new_bl_minifig_no)
        .maybeSingle();

      if (
        existingTarget &&
        existingTarget.rb_fig_id &&
        existingTarget.rb_fig_id !== input.rb_fig_id
      ) {
        await supabase
          .from('bl_set_minifigs')
          .update({ rb_fig_id: null })
          .eq('set_num', input.set_num)
          .eq('minifig_no', input.new_bl_minifig_no);
      }

      // Step 2: Unlink the old BL minifig (the one we're remapping FROM)
      // This keeps it available for future remapping
      const { error: unlinkErr } = await supabase
        .from('bl_set_minifigs')
        .update({ rb_fig_id: null })
        .eq('set_num', input.set_num)
        .eq('minifig_no', input.old_bl_minifig_no)
        .eq('rb_fig_id', input.rb_fig_id);

      if (unlinkErr) throw unlinkErr;

      // Step 3: Update the target BL minifig to point to the new RB fig
      const { error: updateErr } = await supabase
        .from('bl_set_minifigs')
        .update({
          rb_fig_id: input.rb_fig_id,
          last_refreshed_at: new Date().toISOString(),
        })
        .eq('set_num', input.set_num)
        .eq('minifig_no', input.new_bl_minifig_no);

      if (updateErr) throw updateErr;

      // Update or create global mapping with manual approval flag
      const { error: mappingErr } = await supabase
        .from('bricklink_minifig_mappings')
        .upsert(
          {
            rb_fig_id: input.rb_fig_id,
            bl_item_id: input.new_bl_minifig_no,
            confidence: 1.0, // Manual mappings get perfect confidence
            source: 'manual',
            manual_review: true,
            manually_approved: true, // Mark as manually approved
            reviewed_at: new Date().toISOString(),
            review_notes:
              input.notes ??
              `Manually corrected from ${input.old_bl_minifig_no}`,
          },
          { onConflict: 'rb_fig_id' }
        );

      if (mappingErr) {
        logger.warn('minifig_mapping.global_update_failed', {
          error: mappingErr.message,
        });
      }

      return NextResponse.json({
        success: true,
        action: 'updated',
        set_num: input.set_num,
        rb_fig_id: input.rb_fig_id,
        old_bl_minifig_no: input.old_bl_minifig_no,
        new_bl_minifig_no: input.new_bl_minifig_no,
      });
    }

    if (input.action === 'approve') {
      // Mark the mapping as manually approved in the global table
      const { error: approveErr } = await supabase
        .from('bricklink_minifig_mappings')
        .update({
          manual_review: true,
          manually_approved: true,
          confidence: 1.0, // Manual approval = perfect confidence
          reviewed_at: new Date().toISOString(),
          review_notes: input.notes ?? 'Manually approved',
        })
        .eq('rb_fig_id', input.rb_fig_id)
        .eq('bl_item_id', input.old_bl_minifig_no);

      if (approveErr) {
        logger.warn('minifig_mapping.approve_failed', {
          error: approveErr.message,
        });
      }

      return NextResponse.json({
        success: true,
        action: 'approved',
        set_num: input.set_num,
        rb_fig_id: input.rb_fig_id,
        bl_minifig_no: input.old_bl_minifig_no,
      });
    }

    return errorResponse('invalid_format', {
      message: 'Invalid action specified',
    });
  } catch (error) {
    logger.error('minifig_mapping.fix_failed', {
      error: error instanceof Error ? error.message : String(error),
    });

    if (error instanceof z.ZodError) {
      return errorResponse('validation_failed', {
        message: 'Invalid request',
        details: { errors: error.errors },
      });
    }

    return errorResponse('mapping_fix_failed', {
      message: 'Failed to fix mapping',
      details: {
        error: error instanceof Error ? error.message : String(error),
      },
    });
  }
}
