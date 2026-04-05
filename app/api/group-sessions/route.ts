import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { errorResponse } from '@/app/lib/api/responses';
import { withCsrfProtection } from '@/app/lib/middleware/csrf';
import { getEntitlements, hasFeature } from '@/app/lib/services/entitlements';
import { createGroupSession } from '@/app/lib/services/groupSessions';
import { checkAndIncrementUsage } from '@/app/lib/services/usageCounters';
import { getSupabaseAuthServerClient } from '@/app/lib/supabaseAuthServerClient';
import { logger } from '@/lib/metrics';

const SEARCH_PARTY_MONTHLY_LIMIT = 2;

function currentMonthStartIsoUTC(): string {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
  ).toISOString();
}

type CreateSessionBody = {
  setNumber: string;
};

const createSessionSchema = z.object({
  setNumber: z.string().trim().min(1, 'set_number_required'),
});

export const POST = withCsrfProtection(async (req: NextRequest) => {
  let body: CreateSessionBody;
  try {
    body = (await req.json()) as CreateSessionBody;
  } catch {
    return errorResponse('validation_failed', {
      message: 'invalid_json',
    });
  }

  const parsed = createSessionSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse('validation_failed', {
      details: parsed.error.flatten(),
    });
  }

  const { setNumber } = parsed.data;

  try {
    const supabase = await getSupabaseAuthServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      logger.warn('group_sessions.create.unauthorized', {
        error: userError?.message,
      });
      return errorResponse('unauthorized');
    }

    const entitlements = await getEntitlements(user.id, { supabase });
    if (!hasFeature(entitlements, 'search_party.unlimited')) {
      // Quota is measured in *distinct sets* activated this month, not in
      // create events. If the host already has any group_sessions row for
      // this set_num in the current calendar month, they've already "spent"
      // the slot on this set — restarts, reuse, and fresh-starts on the same
      // set are free. The counter only increments when a new set is being
      // activated for the first time this month.
      const { data: priorForSet, error: priorLookupError } = await supabase
        .from('group_sessions')
        .select('id')
        .eq('host_user_id', user.id)
        .eq('set_num', setNumber)
        .gte('created_at', currentMonthStartIsoUTC())
        .limit(1)
        .maybeSingle();

      if (priorLookupError) {
        logger.error('group_sessions.create.prior_lookup_failed', {
          userId: user.id,
          setNumber,
          error: priorLookupError.message,
        });
        // Fall through to the counter check on lookup error — fail-closed on
        // the stricter (counting) path rather than silently skipping quota.
      }

      if (!priorForSet) {
        const usage = await checkAndIncrementUsage({
          userId: user.id,
          featureKey: 'search_party_host:monthly',
          windowKind: 'monthly',
          limit: SEARCH_PARTY_MONTHLY_LIMIT,
          // Don't pass the user's supabase client - let it use service role by default
        });
        if (!usage.allowed) {
          logger.warn('group_sessions.create.quota_exceeded', {
            userId: user.id,
            limit: usage.limit,
            resetAt: usage.resetAt,
          });
          return errorResponse('quota_exceeded', {
            message: `You've reached your limit of ${usage.limit} Search Party sets this month. Upgrade to Plus for unlimited, or wait until ${new Date(usage.resetAt).toLocaleDateString()}.`,
            details: {
              limit: usage.limit,
              remaining: usage.remaining,
              resetAt: usage.resetAt,
            },
          });
        }
      }
    }

    const result = await createGroupSession(supabase, user.id, setNumber);

    if (result.kind === 'insert_failed') {
      return errorResponse('unknown_error');
    }

    return NextResponse.json({ session: result.session });
  } catch (err) {
    logger.error('group_sessions.create.unexpected', {
      setNumber,
      error: err instanceof Error ? err.message : String(err),
    });
    return errorResponse('unknown_error');
  }
});
