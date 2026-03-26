import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { errorResponse } from '@/app/lib/api/responses';
import { withCsrfProtection } from '@/app/lib/middleware/csrf';
import { getEntitlements, hasFeature } from '@/app/lib/services/entitlements';
import { createGroupSession } from '@/app/lib/services/groupSessions';
import { checkAndIncrementUsage } from '@/app/lib/services/usageCounters';
import { getSupabaseAuthServerClient } from '@/app/lib/supabaseAuthServerClient';
import { logger } from '@/lib/metrics';

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
      const usage = await checkAndIncrementUsage({
        userId: user.id,
        featureKey: 'search_party_host:monthly',
        windowKind: 'monthly',
        limit: 2,
        // Don't pass the user's supabase client - let it use service role by default
      });
      if (!usage.allowed) {
        logger.warn('group_sessions.create.quota_exceeded', {
          userId: user.id,
          limit: usage.limit,
          resetAt: usage.resetAt,
        });
        return errorResponse('quota_exceeded', {
          message: `You've reached your limit of ${usage.limit} Search Party sessions this month. Upgrade to Plus for unlimited sessions or wait until ${new Date(usage.resetAt).toLocaleDateString()}.`,
          details: {
            limit: usage.limit,
            remaining: usage.remaining,
            resetAt: usage.resetAt,
          },
        });
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
