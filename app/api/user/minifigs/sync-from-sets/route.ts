import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { errorResponse } from '@/app/lib/api/responses';
import { getSetMinifigsLocal } from '@/app/lib/catalog';
import type { ApiErrorResponse } from '@/app/lib/domain/errors';
import { withCsrfProtection } from '@/app/lib/middleware/csrf';
import { getSupabaseAuthServerClient } from '@/app/lib/supabaseAuthServerClient';
import { loadUserMinifigSyncPreferences } from '@/app/lib/userMinifigSyncPreferences';
import { logger } from '@/lib/metrics';
import type { Enums, Tables } from '@/supabase/types';

type SyncResponse = {
  ok: boolean;
  updated: number;
};

export const POST = withCsrfProtection(async function POST(
  req: NextRequest
): Promise<NextResponse<SyncResponse | ApiErrorResponse>> {
  const searchSchema = z.object({
    force: z
      .string()
      .optional()
      .transform(value => {
        if (!value) return false;
        const normalized = value.toLowerCase();
        return normalized === '1' || normalized === 'true' || normalized === 'yes';
      }),
  });

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
    const force = parsedQuery.data.force;

    if (!force) {
      const prefs = await loadUserMinifigSyncPreferences(supabase, user.id);
      if (!prefs.syncOwnedFromSets) {
        return NextResponse.json({ ok: true, updated: 0 });
      }
    }

    const { data: userSets, error: setsError } = await supabase
      .from('user_sets')
      .select<'set_num,status'>('set_num,status')
      .eq('user_id', user.id);

    if (setsError) {
      logger.error('user_minifigs.sync_from_sets.user_sets_failed', {
        userId: user.id,
        error: setsError.message,
      });
      return errorResponse('unknown_error');
    }

    const sets = (userSets ?? []) as Array<
      Pick<Tables<'user_sets'>, 'set_num' | 'status'>
    >;

    if (sets.length === 0) {
      // Nothing to aggregate; leave any existing user_minifigs rows as-is.
      return NextResponse.json({ ok: true, updated: 0 });
    }

    const contributions = new Map<string, { owned: number }>();

    for (const row of sets) {
      const status = row.status as Enums<'set_status'>;
      if (status !== 'owned') continue;
      if (!row.set_num) continue;

      let minifigs: Awaited<ReturnType<typeof getSetMinifigsLocal>> = [];
      try {
        minifigs = await getSetMinifigsLocal(row.set_num);
      } catch (err) {
        logger.error('user_minifigs.sync_from_sets.get_minifigs_failed', {
          setNum: row.set_num,
          error: err instanceof Error ? err.message : String(err),
        });
        continue;
      }

      for (const fig of minifigs) {
        if (!fig.figNum) continue;
        const entry = contributions.get(fig.figNum) ?? { owned: 0 };
        if (status === 'owned') {
          entry.owned += fig.quantity;
        }
        contributions.set(fig.figNum, entry);
      }
    }

    if (contributions.size === 0) {
      return NextResponse.json({ ok: true, updated: 0 });
    }

    const { data: existingRows, error: existingError } = await supabase
      .from('user_minifigs')
      .select<'fig_num,status,quantity'>('fig_num,status,quantity')
      .eq('user_id', user.id);

    if (existingError) {
      logger.error('user_minifigs.sync_from_sets.load_user_minifigs_failed', {
        userId: user.id,
        error: existingError.message,
      });
      return errorResponse('unknown_error');
    }

    const existingMap = new Map<
      string,
      { status: Enums<'set_status'>; quantity: number | null }
    >();
    for (const row of existingRows ?? []) {
      existingMap.set(row.fig_num, {
        status: row.status as Enums<'set_status'>,
        quantity:
          typeof row.quantity === 'number' && Number.isFinite(row.quantity)
            ? row.quantity
            : null,
      });
    }

    const upserts: Tables<'user_minifigs'>[] = [];

    for (const [figNum, counts] of contributions.entries()) {
      const existing = existingMap.get(figNum);
      const hasOwned = counts.owned > 0;
      const computedStatus: Enums<'set_status'> | null = hasOwned
        ? 'owned'
        : null;

      let nextStatus: Enums<'set_status'> | null = null;

      if (existing?.status === 'owned') {
        // Promote-only: once owned, never downgrade automatically.
        nextStatus = 'owned';
      } else if (existing?.status === 'want') {
        if (computedStatus === 'owned') {
          // Promote wishlist minifig to owned when owned sets contribute.
          nextStatus = 'owned';
        } else {
          // Keep existing wishlist even if sets no longer contribute.
          nextStatus = 'want';
        }
      } else {
        // No existing row.
        nextStatus = computedStatus;
      }

      if (!nextStatus) {
        continue;
      }

      const ownedQuantity = counts.owned > 0 ? counts.owned : null;

      let quantity: number | null = existing?.quantity ?? null;
      if (nextStatus === 'owned' && ownedQuantity != null) {
        quantity = ownedQuantity;
      }

      upserts.push({
        user_id: user.id,
        fig_num: figNum,
        status: nextStatus,
        created_at: existing ? undefined as unknown as string : new Date().toISOString(),
        updated_at: new Date().toISOString(),
        quantity: quantity ?? 0,
      } as Tables<'user_minifigs'>);
    }

    if (upserts.length === 0) {
      return NextResponse.json({ ok: true, updated: 0 });
    }

    const { error: upsertError } = await supabase
      .from('user_minifigs')
      .upsert(upserts, { onConflict: 'user_id,fig_num' });

    if (upsertError) {
      logger.error('user_minifigs.sync_from_sets.upsert_failed', {
        userId: user.id,
        error: upsertError.message,
      });
      return errorResponse('unknown_error');
    }

    return NextResponse.json({ ok: true, updated: upserts.length });
  } catch (err) {
    logger.error('user_minifigs.sync_from_sets.unexpected_error', {
      error: err instanceof Error ? err.message : String(err),
    });
    return errorResponse('unknown_error');
  }
});


