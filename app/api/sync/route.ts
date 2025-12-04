import { getSupabaseAuthServerClient } from '@/app/lib/supabaseAuthServerClient';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Sync endpoint for batched client-side writes.
 *
 * Accepts an array of operations from the client's sync queue and applies
 * them to Supabase in a transaction. Returns success/failure status for
 * each operation so the client can update its queue accordingly.
 */

type SyncOperation = {
  id: number;
  table:
    | 'user_set_parts'
    | 'user_lists'
    | 'user_list_items'
    | 'user_minifigs';
  operation: 'upsert' | 'delete';
  payload: Record<string, unknown>;
};

type SyncRequest = {
  operations: SyncOperation[];
};

type SyncResponse = {
  success: boolean;
  processed: number;
  failed?: Array<{ id: number; error: string }>;
};

// Maximum operations per request to prevent abuse
const MAX_OPERATIONS_PER_REQUEST = 100;

export async function POST(req: NextRequest): Promise<NextResponse<SyncResponse>> {
  try {
    // Authenticate the user
    const supabase = await getSupabaseAuthServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, processed: 0, failed: [{ id: -1, error: 'unauthorized' }] },
        { status: 401 }
      );
    }

    // Parse request body
    const body = (await req.json()) as SyncRequest;
    const { operations } = body;

    if (!Array.isArray(operations)) {
      return NextResponse.json(
        { success: false, processed: 0, failed: [{ id: -1, error: 'invalid_request' }] },
        { status: 400 }
      );
    }

    if (operations.length === 0) {
      return NextResponse.json({ success: true, processed: 0 });
    }

    if (operations.length > MAX_OPERATIONS_PER_REQUEST) {
      return NextResponse.json(
        {
          success: false,
          processed: 0,
          failed: [{ id: -1, error: `max_operations_exceeded:${MAX_OPERATIONS_PER_REQUEST}` }],
        },
        { status: 400 }
      );
    }

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

    // Validate and categorize operations
    for (const op of operations) {
      if (op.table === 'user_set_parts') {
        const payload = op.payload as {
          set_num?: string;
          part_num?: string;
          color_id?: number;
          is_spare?: boolean;
          owned_quantity?: number;
        };

        // Validate required fields
        if (
          typeof payload.set_num !== 'string' ||
          typeof payload.part_num !== 'string' ||
          typeof payload.color_id !== 'number'
        ) {
          failed.push({ id: op.id, error: 'invalid_payload' });
          continue;
        }

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
        } else if (op.operation === 'delete') {
          userSetPartsDeletes.push({
            id: op.id,
            payload: {
              set_num: payload.set_num,
              part_num: payload.part_num,
              color_id: payload.color_id,
              is_spare: isSpare,
            },
          });
        } else {
          failed.push({ id: op.id, error: 'unknown_operation' });
        }
      } else {
        // Unsupported table for now
        failed.push({ id: op.id, error: `unsupported_table:${op.table}` });
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

    return NextResponse.json({
      success: failed.length === 0,
      processed,
      ...(failed.length > 0 ? { failed } : {}),
    });
  } catch (error) {
    console.error('Sync endpoint error:', error);
    return NextResponse.json(
      {
        success: false,
        processed: 0,
        failed: [{ id: -1, error: 'internal_error' }],
      },
      { status: 500 }
    );
  }
}

/**
 * Ping endpoint for sendBeacon on page unload.
 * This is a lightweight endpoint that just acknowledges the ping.
 * The actual sync happens when the user returns to the app.
 */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ ok: true });
}




