import { errorResponse } from '@/app/lib/api/responses';
import { RATE_LIMIT, VALIDATION } from '@/app/lib/constants';
import type { ApiErrorResponse } from '@/app/lib/domain/errors';
import { withCsrfProtection } from '@/app/lib/middleware/csrf';
import { processSyncOperations } from '@/app/lib/services/syncOperations';
import { getSupabaseAuthServerClient } from '@/app/lib/supabaseAuthServerClient';
import { incrementCounter, logEvent } from '@/lib/metrics';
import { consumeRateLimit } from '@/lib/rateLimit';
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
  versions?: Record<string, number>;
};

// Maximum operations per request to prevent abuse
const MAX_OPERATIONS_PER_REQUEST = 100;

const userSetPartsPayloadSchema = z.object({
  set_num: z.string().min(1).max(VALIDATION.SET_NUM_MAX),
  part_num: z.string().min(1).max(VALIDATION.PART_NUM_MAX),
  color_id: z.number().int().min(0).max(VALIDATION.COLOR_ID_MAX),
  is_spare: z.boolean().default(false).optional(),
  owned_quantity: z
    .number()
    .int()
    .min(0)
    .max(VALIDATION.OWNED_QTY_MAX)
    .optional(),
});

const userLoosePartsPayloadSchema = z.object({
  part_num: z.string().min(1).max(VALIDATION.PART_NUM_MAX),
  color_id: z.number().int().min(0).max(VALIDATION.COLOR_ID_MAX),
  loose_quantity: z.number().int().min(0).max(VALIDATION.OWNED_QTY_MAX),
});

const operationField = z.union([z.literal('upsert'), z.literal('delete')]);

const syncOperationSchema = z.discriminatedUnion('table', [
  z.object({
    id: z.number().int(),
    table: z.literal('user_set_parts'),
    operation: operationField,
    payload: userSetPartsPayloadSchema,
  }),
  z.object({
    id: z.number().int(),
    table: z.literal('user_loose_parts'),
    operation: operationField,
    payload: userLoosePartsPayloadSchema,
  }),
]);

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

      // User-based rate limit
      const userLimit = await consumeRateLimit(`sync:user:${user.id}`, {
        windowMs: RATE_LIMIT.WINDOW_MS,
        maxHits: RATE_LIMIT.SYNC_MAX,
      });
      if (!userLimit.allowed) {
        return errorResponse('rate_limited', {
          status: 429,
          headers: { 'Retry-After': String(userLimit.retryAfterSeconds) },
          details: { retryAfterSeconds: userLimit.retryAfterSeconds },
        });
      }

      const parsed = syncRequestSchema.safeParse(await req.json());
      if (!parsed.success) {
        incrementCounter('sync_validation_failed', {
          issues: parsed.error.flatten(),
        });
        return errorResponse('validation_failed', {
          details: parsed.error.flatten(),
        });
      }

      const { operations } = parsed.data;

      // Delegate to service layer
      const result = await processSyncOperations(supabase, user.id, operations);

      // Format HTTP response
      const response: SyncResponse = {
        success: result.success,
        processed: result.processed,
        ...(result.failed.length > 0 ? { failed: result.failed } : {}),
        ...(result.versions ? { versions: result.versions } : {}),
      };

      if (result.failed.length === 0) {
        incrementCounter('sync_succeeded', { processed: result.processed });
      } else {
        incrementCounter('sync_partial_failed', {
          processed: result.processed,
          failed: result.failed.length,
        });
      }
      logEvent('sync_response', {
        processed: result.processed,
        failed: result.failed.length,
      });
      return NextResponse.json(response);
    } catch (error) {
      incrementCounter('sync_failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return errorResponse('unknown_error');
    }
  }
);

/**
 * Ping endpoint for sendBeacon on page unload.
 * This is a lightweight endpoint that just acknowledges the ping.
 * The actual sync happens when the user returns to the app.
 */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ ok: true });
}
