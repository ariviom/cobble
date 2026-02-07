import { errorResponse } from '@/app/lib/api/responses';
import type { ApiErrorResponse } from '@/app/lib/domain/errors';
import { withCsrfProtection } from '@/app/lib/middleware/csrf';
import { getSupabaseAuthServerClient } from '@/app/lib/supabaseAuthServerClient';
import { getSupabaseServerClient } from '@/app/lib/supabaseServerClient';
import { logger } from '@/lib/metrics';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

// ─── Types ───────────────────────────────────────────────────────────────

export type RecentSetFromCloud = {
  setNumber: string;
  name: string;
  year: number;
  numParts: number;
  imageUrl: string | null;
  themeId: number | null;
  lastViewedAt: string;
};

export type RecentSetsResponse = {
  sets: RecentSetFromCloud[];
};

// ─── GET: Pull recent sets ───────────────────────────────────────────────

export async function GET(): Promise<
  NextResponse<RecentSetsResponse | ApiErrorResponse>
> {
  const supabase = await getSupabaseAuthServerClient();

  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return errorResponse('unauthorized');
    }

    // Fetch recent sets (user-scoped, RLS)
    const { data: recentRows, error } = await supabase
      .from('user_recent_sets')
      .select('set_num, last_viewed_at')
      .eq('user_id', user.id)
      .order('last_viewed_at', { ascending: false })
      .limit(100);

    if (error) {
      logger.error('recent_sets.query_failed', {
        userId: user.id,
        error: error.message,
      });
      return errorResponse('unknown_error');
    }

    const rows = recentRows ?? [];
    if (rows.length === 0) {
      return NextResponse.json({ sets: [] } satisfies RecentSetsResponse);
    }

    // Fetch metadata from rb_sets (anon-readable, no RLS needed)
    const setNums = rows.map(r => r.set_num);
    const anonClient = getSupabaseServerClient();
    const { data: metaRows } = await anonClient
      .from('rb_sets')
      .select('set_num, name, year, num_parts, image_url, theme_id')
      .in('set_num', setNums);

    const metaMap = new Map((metaRows ?? []).map(m => [m.set_num, m]));

    const sets: RecentSetFromCloud[] = rows.map(row => {
      const meta = metaMap.get(row.set_num);
      return {
        setNumber: row.set_num,
        name: meta?.name ?? row.set_num,
        year: meta?.year ?? 0,
        numParts: meta?.num_parts ?? 0,
        imageUrl: meta?.image_url ?? null,
        themeId: meta?.theme_id ?? null,
        lastViewedAt: row.last_viewed_at,
      };
    });

    return NextResponse.json({ sets } satisfies RecentSetsResponse);
  } catch (err) {
    logger.error('recent_sets.unexpected_failure', {
      error: err instanceof Error ? err.message : String(err),
    });
    return errorResponse('unknown_error');
  }
}

// ─── POST: Push a viewed set ─────────────────────────────────────────────

const postSchema = z.object({
  set_num: z.string().min(1).max(30),
});

export const POST = withCsrfProtection(
  async (
    req: NextRequest
  ): Promise<NextResponse<{ ok: true } | ApiErrorResponse>> => {
    const supabase = await getSupabaseAuthServerClient();

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        return errorResponse('unauthorized');
      }

      const parsed = postSchema.safeParse(await req.json());
      if (!parsed.success) {
        return errorResponse('validation_failed');
      }

      const { error } = await supabase.from('user_recent_sets').upsert(
        {
          user_id: user.id,
          set_num: parsed.data.set_num,
          last_viewed_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,set_num' }
      );

      if (error) {
        logger.error('recent_sets.upsert_failed', {
          userId: user.id,
          setNum: parsed.data.set_num,
          error: error.message,
        });
        return errorResponse('unknown_error');
      }

      return NextResponse.json({ ok: true as const });
    } catch (err) {
      logger.error('recent_sets.post_unexpected', {
        error: err instanceof Error ? err.message : String(err),
      });
      return errorResponse('unknown_error');
    }
  }
);
