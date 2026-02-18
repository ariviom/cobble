import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { errorResponse } from '@/app/lib/api/responses';
import { getCatalogWriteClient } from '@/app/lib/db/catalogAccess';
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
        return (
          normalized === '1' || normalized === 'true' || normalized === 'yes'
        );
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
      .select('set_num,owned')
      .eq('user_id', user.id)
      .eq('owned', true);

    if (setsError) {
      logger.error('user_minifigs.sync_from_sets.user_sets_failed', {
        userId: user.id,
        error: setsError.message,
      });
      return errorResponse('unknown_error');
    }

    const sets = (userSets ?? []) as Array<
      Pick<Tables<'user_sets'>, 'set_num' | 'owned'>
    >;

    if (sets.length === 0) {
      return NextResponse.json({ ok: true, updated: 0 });
    }

    // Get minifigs for all owned sets from RB catalog
    const catalogClient = getCatalogWriteClient();
    const setNums = sets.filter(s => s.owned && s.set_num).map(s => s.set_num);

    // Get inventories for these sets
    const { data: inventories, error: invError } = await catalogClient
      .from('rb_inventories')
      .select('id, set_num')
      .in('set_num', setNums)
      .not('set_num', 'like', 'fig-%');

    if (invError) {
      logger.error('user_minifigs.sync_from_sets.inventories_failed', {
        userId: user.id,
        error: invError.message,
      });
      return errorResponse('unknown_error');
    }

    if (!inventories || inventories.length === 0) {
      return NextResponse.json({ ok: true, updated: 0 });
    }

    const invIds = inventories.map(inv => inv.id);

    // Get all minifigs for these inventories
    const { data: invMinifigs, error: imError } = await catalogClient
      .from('rb_inventory_minifigs')
      .select('inventory_id, fig_num, quantity')
      .in('inventory_id', invIds);

    if (imError) {
      logger.error('user_minifigs.sync_from_sets.inventory_minifigs_failed', {
        userId: user.id,
        error: imError.message,
      });
      return errorResponse('unknown_error');
    }

    // Map fig_num to BL minifig ID
    const figNums = [...new Set((invMinifigs ?? []).map(im => im.fig_num))];

    if (figNums.length === 0) {
      return NextResponse.json({ ok: true, updated: 0 });
    }

    const { data: rbMinifigs } = await catalogClient
      .from('rb_minifigs')
      .select('fig_num, bl_minifig_id')
      .in('fig_num', figNums);

    const figToBlId = new Map<string, string>();
    for (const m of rbMinifigs ?? []) {
      figToBlId.set(m.fig_num, m.bl_minifig_id ?? m.fig_num);
    }

    // Track minifig contributions
    // Map: bl_minifig_no -> { owned: number }
    const contributions = new Map<string, { owned: number }>();

    for (const im of invMinifigs ?? []) {
      const blMinifigNo = figToBlId.get(im.fig_num) ?? im.fig_num;
      const entry = contributions.get(blMinifigNo) ?? { owned: 0 };
      entry.owned += im.quantity ?? 1;
      contributions.set(blMinifigNo, entry);
    }

    if (contributions.size === 0) {
      return NextResponse.json({ ok: true, updated: 0 });
    }

    // Get existing user minifigs
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

    for (const [blMinifigNo, counts] of contributions.entries()) {
      const existing = existingMap.get(blMinifigNo);
      const hasOwned = counts.owned > 0;
      const computedStatus: Enums<'set_status'> | null = hasOwned
        ? 'owned'
        : null;

      let nextStatus: Enums<'set_status'> | null = null;

      if (existing?.status === 'owned') {
        nextStatus = 'owned';
      } else if (existing?.status === 'want') {
        if (computedStatus === 'owned') {
          nextStatus = 'owned';
        } else {
          nextStatus = 'want';
        }
      } else {
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
        fig_num: blMinifigNo,
        status: nextStatus,
        created_at: existing
          ? (undefined as unknown as string)
          : new Date().toISOString(),
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

    return NextResponse.json({
      ok: true,
      updated: upserts.length,
    });
  } catch (err) {
    logger.error('user_minifigs.sync_from_sets.unexpected_error', {
      error: err instanceof Error ? err.message : String(err),
    });
    return errorResponse('unknown_error');
  }
});
