import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { errorResponse } from '@/app/lib/api/responses';
import type { ApiErrorResponse } from '@/app/lib/domain/errors';
import { withCsrfProtection } from '@/app/lib/middleware/csrf';
import {
  syncMinifigsFromSets,
  type MinifigSyncResult,
} from '@/app/lib/services/minifigSync';
import { getSupabaseAuthServerClient } from '@/app/lib/supabaseAuthServerClient';
import { logger } from '@/lib/metrics';

type SyncResponse = {
  ok: boolean;
  updated: number;
  listItemsSynced?: number;
};

const searchSchema = z.object({
  force: z
    .string()
    .optional()
    .transform(value => {
      if (!value) return false;
      const normalized = value.toLowerCase();
      return (
        normalized === '1' || normalized === 'true' || normalized === 'yes'
      );
    }),
});

export const POST = withCsrfProtection(async function POST(
  req: NextRequest
): Promise<NextResponse<SyncResponse | ApiErrorResponse>> {
  try {
    const supabase = await getSupabaseAuthServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      logger.warn('user_minifigs.sync_from_sets.unauthorized', {
        error: authError?.message,
      });
      return errorResponse('unauthorized');
    }

    const parsedQuery = searchSchema.safeParse({
      force: req.nextUrl.searchParams.get('force') ?? undefined,
    });
    if (!parsedQuery.success) {
      return errorResponse('validation_failed', {
        details: parsedQuery.error.flatten(),
      });
    }

    const result: MinifigSyncResult | null = await syncMinifigsFromSets(
      supabase,
      user.id,
      { force: parsedQuery.data.force }
    );

    // null means sync was skipped (preference disabled and not forced)
    if (result === null) {
      return NextResponse.json({ ok: true, updated: 0 });
    }

    return NextResponse.json({
      ok: true,
      updated: result.updated,
      listItemsSynced: result.listItemsSynced,
    });
  } catch (err) {
    logger.error('user_minifigs.sync_from_sets.unexpected_error', {
      error: err instanceof Error ? err.message : String(err),
    });
    return errorResponse('unknown_error');
  }
});
