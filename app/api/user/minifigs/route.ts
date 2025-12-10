import { NextResponse } from 'next/server';

import { errorResponse } from '@/app/lib/api/responses';
import type { ApiErrorResponse } from '@/app/lib/domain/errors';
import { getUserMinifigs } from '@/app/lib/server/getUserMinifigs';
import { getSupabaseAuthServerClient } from '@/app/lib/supabaseAuthServerClient';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabaseServiceRoleClient';
import { logger } from '@/lib/metrics';

export async function GET(): Promise<
  NextResponse<
    | {
        minifigs: Array<{
          figNum: string;
          status: string | null;
          quantity: number | null;
          name: string;
          numParts: number | null;
          imageUrl: string | null;
          blId: string | null;
        }>;
      }
    | ApiErrorResponse
  >
> {
  try {
    const authClient = await getSupabaseAuthServerClient();
    const { data: auth } = await authClient.auth.getUser();
    const user = auth.user;

    if (!user) {
      return errorResponse('unauthorized');
    }

    const supabase = getSupabaseServiceRoleClient();
    const minifigs = await getUserMinifigs({
      userId: user.id,
      supabase,
      onDemandLimit: 5,
    });

    return NextResponse.json({ minifigs });
  } catch (err) {
    logger.error('user_minifigs.unexpected_error', {
      error: err instanceof Error ? err.message : String(err),
    });
    return errorResponse('unknown_error');
  }
}
