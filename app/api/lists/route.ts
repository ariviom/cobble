import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { errorResponse } from '@/app/lib/api/responses';
import { FREE_LIST_LIMIT } from '@/app/lib/domain/limits';
import { withCsrfProtection } from '@/app/lib/middleware/csrf';
import { getEntitlements, hasFeature } from '@/app/lib/services/entitlements';
import { getSupabaseAuthServerClient } from '@/app/lib/supabaseAuthServerClient';
import { logger } from '@/lib/metrics';

const createListSchema = z.object({
  name: z
    .string()
    .min(1, 'name_required')
    .max(200, 'name_too_long')
    .transform(s => s.trim())
    .refine(s => s.length > 0, { message: 'name_required' }),
});

export const POST = withCsrfProtection(async (req: NextRequest) => {
  try {
    // Auth
    const supabase = await getSupabaseAuthServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return errorResponse('unauthorized', { message: 'sign_in_required' });
    }

    // Validate request body
    const body = await req.json();
    const parsed = createListSchema.safeParse(body);

    if (!parsed.success) {
      return errorResponse('validation_failed', {
        details: parsed.error.flatten(),
      });
    }

    const { name } = parsed.data;

    // Check entitlements for list limit
    const entitlements = await getEntitlements(user.id);
    if (!hasFeature(entitlements, 'lists.unlimited')) {
      // Count existing non-system lists
      const { count, error: countError } = await supabase
        .from('user_lists')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('is_system', false);

      if (countError) {
        logger.error('lists.count_failed', {
          userId: user.id,
          error: countError.message,
        });
        return errorResponse('unknown_error', {
          message: 'Failed to check list count.',
        });
      }

      if ((count ?? 0) >= FREE_LIST_LIMIT) {
        return NextResponse.json(
          {
            error: 'feature_unavailable',
            reason: 'list_limit_reached',
            message: `You've reached the free limit of ${FREE_LIST_LIMIT} lists.`,
            limit: FREE_LIST_LIMIT,
          },
          { status: 403 }
        );
      }
    }

    // Create the list
    const { data, error: insertError } = await supabase
      .from('user_lists')
      .insert({
        user_id: user.id,
        name,
        is_system: false,
      })
      .select('id,name,is_system')
      .single();

    if (insertError) {
      // Handle unique constraint violation (duplicate name)
      if (insertError.code === '23505') {
        return errorResponse('validation_failed', {
          message: 'A list with that name already exists.',
        });
      }

      logger.error('lists.create_failed', {
        userId: user.id,
        error: insertError.message,
      });
      return errorResponse('unknown_error', {
        message: 'Failed to create list.',
      });
    }

    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    logger.error('lists.unexpected_error', {
      error: err instanceof Error ? err.message : String(err),
    });
    return errorResponse('unknown_error', {
      message: 'An unexpected error occurred.',
    });
  }
});
