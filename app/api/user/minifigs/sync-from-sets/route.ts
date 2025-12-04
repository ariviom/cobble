import { getSetMinifigsLocal } from '@/app/lib/catalog';
import { getSupabaseAuthServerClient } from '@/app/lib/supabaseAuthServerClient';
import { loadUserMinifigSyncPreferences } from '@/app/lib/userMinifigSyncPreferences';
import type { Enums, Tables } from '@/supabase/types';
import { NextRequest, NextResponse } from 'next/server';

type SyncResponse = {
  ok: boolean;
  updated: number;
};

export async function POST(
  req: NextRequest
): Promise<NextResponse<SyncResponse>> {
  try {
    const supabase = await getSupabaseAuthServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { ok: false, updated: 0 },
        { status: 401 }
      );
    }

    const forceParam = req.nextUrl.searchParams.get('force');
    const force =
      forceParam === '1' ||
      forceParam === 'true' ||
      (forceParam ?? '').toLowerCase() === 'yes';

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
      console.error('sync-from-sets: failed to load user_sets', {
        userId: user.id,
        error: setsError.message,
      });
      return NextResponse.json(
        { ok: false, updated: 0 },
        { status: 500 }
      );
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
        console.error('sync-from-sets: getSetMinifigsLocal failed', {
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
      console.error('sync-from-sets: failed to load user_minifigs', {
        userId: user.id,
        error: existingError.message,
      });
      return NextResponse.json(
        { ok: false, updated: 0 },
        { status: 500 }
      );
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
      console.error('sync-from-sets: upsert user_minifigs failed', {
        userId: user.id,
        error: upsertError.message,
      });
      return NextResponse.json(
        { ok: false, updated: 0 },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, updated: upserts.length });
  } catch (err) {
    console.error('sync-from-sets: unexpected error', {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { ok: false, updated: 0 },
      { status: 500 }
    );
  }
}


