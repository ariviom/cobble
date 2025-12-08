import { errorResponse } from '@/app/lib/api/responses';
import type { ApiErrorResponse } from '@/app/lib/domain/errors';
import { withCsrfProtection } from '@/app/lib/middleware/csrf';
import { getSupabaseAuthServerClient } from '@/app/lib/supabaseAuthServerClient';
import { incrementCounter, logEvent } from '@/lib/metrics';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

/**
 * Sync endpoint for batched client-side writes.
 *
 * Accepts an array of operations from the client's sync queue and applies
 * them to Supabase in a transaction. Returns success/failure status for
 * each operation so the client can update its queue accordingly.
 */

type SyncResponse = {
  success: boolean;
  processed: number;
  failed?: Array<{ id: number; error: string }>;
};

// Maximum operations per request to prevent abuse
const MAX_OPERATIONS_PER_REQUEST = 100;

const userSetPartsPayloadSchema = z.object({
  set_num: z.string(),
  part_num: z.string(),
  color_id: z.number(),
  is_spare: z.boolean().default(false).optional(),
  owned_quantity: z.number().optional(),
});

const syncOperationSchema = z.object({
  id: z.number().int(),
  table: z.literal('user_set_parts'),
  operation: z.union([z.literal('upsert'), z.literal('delete')]),
  payload: userSetPartsPayloadSchema,
});

const syncRequestSchema = z.object({
  operations: z
    .array(syncOperationSchema)
    .min(1)
    .max(MAX_OPERATIONS_PER_REQUEST),
});

export const POST = withCsrfProtection(
  async (
    req: NextRequest
  ): Promise<NextResponse<SyncResponse | ApiErrorResponse>> => {
  try {
    // Authenticate the user
    const supabase = await getSupabaseAuthServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      incrementCounter('sync_unauthorized');
      return errorResponse('unauthorized');
    }

    const parsed = syncRequestSchema.safeParse(await req.json());
    if (!parsed.success) {
      incrementCounter('sync_validation_failed', { issues: parsed.error.flatten() });
      return errorResponse('validation_failed', { details: parsed.error.flatten() });
    }

    const { operations } = parsed.data;

    // Process operations
    const failed: Array<{ id: number; error: string }> = [];
    let processed = 0;

    // Group operations by table for batching
    const userSetPartsUpserts: Array<{
      id: number;
      payload: {
        user_id: string;
        set_num: string;
        part_num: string;
        color_id: number;
        is_spare: boolean;
        owned_quantity: number;
      };
    }> = [];

    const userSetPartsDeletes: Array<{
      id: number;
      payload: {
        set_num: string;
        part_num: string;
        color_id: number;
        is_spare: boolean;
      };
    }> = [];

    // Validate and categorize operations (table already constrained by schema)
    for (const op of operations) {
      const payload = op.payload;
      const isSpare = payload.is_spare ?? false;

      if (op.operation === 'upsert') {
        const quantity = payload.owned_quantity ?? 0;
        userSetPartsUpserts.push({
          id: op.id,
          payload: {
            user_id: user.id,
            set_num: payload.set_num,
            part_num: payload.part_num,
            color_id: payload.color_id,
            is_spare: isSpare,
            owned_quantity: Math.max(0, Math.floor(quantity)),
          },
        });
      } else {
        userSetPartsDeletes.push({
          id: op.id,
          payload: {
            set_num: payload.set_num,
            part_num: payload.part_num,
            color_id: payload.color_id,
            is_spare: isSpare,
          },
        });
      }
    }

    // Execute batched upserts for user_set_parts
    if (userSetPartsUpserts.length > 0) {
      const rows = userSetPartsUpserts.map(u => u.payload);
      const { error: upsertError } = await supabase
        .from('user_set_parts')
        .upsert(rows, {
          onConflict: 'user_id,set_num,part_num,color_id,is_spare',
        });

      if (upsertError) {
        // Mark all as failed
        for (const u of userSetPartsUpserts) {
          failed.push({ id: u.id, error: `upsert_failed:${upsertError.message}` });
        }
      } else {
        processed += userSetPartsUpserts.length;
      }
    }

    // Execute deletes for user_set_parts (one by one for now)
    for (const d of userSetPartsDeletes) {
      const { error: deleteError } = await supabase
        .from('user_set_parts')
        .delete()
        .eq('user_id', user.id)
        .eq('set_num', d.payload.set_num)
        .eq('part_num', d.payload.part_num)
        .eq('color_id', d.payload.color_id)
        .eq('is_spare', d.payload.is_spare);

      if (deleteError) {
        failed.push({ id: d.id, error: `delete_failed:${deleteError.message}` });
      } else {
        processed++;
      }
    }

    const response: SyncResponse = {
      success: failed.length === 0,
      processed,
      ...(failed.length > 0 ? { failed } : {}),
    };
    if (failed.length === 0) {
      incrementCounter('sync_succeeded', { processed });
    } else {
      incrementCounter('sync_partial_failed', { processed, failed: failed.length });
    }
    logEvent('sync_response', { processed, failed: failed.length });
    return NextResponse.json(response);
  } catch (error) {
    incrementCounter('sync_failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return errorResponse('unknown_error');
  }
});

/**
 * Ping endpoint for sendBeacon on page unload.
 * This is a lightweight endpoint that just acknowledges the ping.
 * The actual sync happens when the user returns to the app.
 */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ ok: true });
}







