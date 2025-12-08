import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { z } from 'zod';

import { errorResponse } from '@/app/lib/api/responses';
import { getSupabaseAuthServerClient } from '@/app/lib/supabaseAuthServerClient';
import { logger } from '@/lib/metrics';
import type { Tables } from '@/supabase/types';

type CreateSessionBody = {
  setNumber: string;
};

type GroupSessionRow = Tables<'group_sessions'>;

const createSessionSchema = z.object({
  setNumber: z.string().trim().min(1, 'set_number_required'),
});

function generateSlug(): string {
  // Short, URL-safe slug for sharing sessions. Collision probability is
  // negligible given the small expected volume; the UNIQUE constraint on slug
  // will guard at the database level.
  return crypto.randomBytes(6).toString('base64url').slice(0, 10).toLowerCase();
}

export async function POST(req: NextRequest) {
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

    // Reuse an existing active session for this host + set when possible so
    // multiple clicks on "Search Party" do not create duplicate sessions.
    const {
      data: existing,
      error: existingError,
    } = await supabase
      .from('group_sessions')
      .select('*')
      .eq('host_user_id', user.id as GroupSessionRow['host_user_id'])
      .eq('set_num', setNumber as GroupSessionRow['set_num'])
      .eq('is_active', true as GroupSessionRow['is_active'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingError) {
      logger.error('group_sessions.create.lookup_failed', {
        setNumber,
        userId: user.id,
        error: existingError.message,
      });
    }

    if (existing) {
      return NextResponse.json({
        session: {
          id: existing.id,
          slug: existing.slug,
          setNumber: existing.set_num,
          isActive: existing.is_active,
        },
      });
    }

    let lastError: unknown = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const slug = generateSlug();

      const {
        data: created,
        error: insertError,
      } = await supabase
        .from('group_sessions')
        .insert({
          host_user_id: user.id as GroupSessionRow['host_user_id'],
          set_num: setNumber as GroupSessionRow['set_num'],
          slug,
        })
        .select('*')
        .maybeSingle();

      if (!insertError && created) {
        return NextResponse.json({
          session: {
            id: created.id,
            slug: created.slug,
            setNumber: created.set_num,
            isActive: created.is_active,
          },
        });
      }

      lastError = insertError;

      // If slug collided (unique_violation), try again with a new slug.
      if (!insertError || insertError.code !== '23505') {
        break;
      }
    }

    logger.error('group_sessions.create.insert_failed', {
      setNumber,
      userId: user.id,
      error:
        lastError instanceof Error
          ? lastError.message
          : JSON.stringify(lastError),
    });
    return errorResponse('unknown_error');
  } catch (err) {
    logger.error('group_sessions.create.unexpected', {
      setNumber,
      error: err instanceof Error ? err.message : String(err),
    });
    return errorResponse('unknown_error');
  }
}





