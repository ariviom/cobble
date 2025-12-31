import { errorResponse } from '@/app/lib/api/responses';
import { withCsrfProtection } from '@/app/lib/middleware/csrf';
import { getSupabaseAuthServerClient } from '@/app/lib/supabaseAuthServerClient';
import { incrementCounter } from '@/lib/metrics';
import { consumeRateLimit, getClientIp } from '@/lib/rateLimit';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const RATE_LIMIT = {
  WINDOW_MS: 60 * 60 * 1000, // 1 hour
  MAX_SUBMISSIONS: 5,
};

const feedbackSchema = z.object({
  name: z.string().min(1).max(100),
  message: z.string().min(1).max(2000),
});

/**
 * Sanitize user input by stripping HTML tags and normalizing whitespace.
 * Defense in depth: DB constraints also enforce length limits.
 */
function sanitizeInput(input: string): string {
  return (
    input
      // Strip HTML tags
      .replace(/<[^>]*>/g, '')
      // Strip script content
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      // Normalize whitespace (collapse multiple spaces/newlines)
      .replace(/\s+/g, ' ')
      .trim()
  );
}

export const POST = withCsrfProtection(async (req: NextRequest) => {
  try {
    // Authenticate the user
    const supabase = await getSupabaseAuthServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      incrementCounter('feedback_unauthorized');
      return errorResponse('unauthorized', {
        message: 'You must be signed in to submit feedback.',
      });
    }

    // Rate limiting per user
    const userId = user.id;
    const userLimit = await consumeRateLimit(`feedback:user:${userId}`, {
      windowMs: RATE_LIMIT.WINDOW_MS,
      maxHits: RATE_LIMIT.MAX_SUBMISSIONS,
    });

    if (!userLimit.allowed) {
      incrementCounter('feedback_rate_limited');
      return NextResponse.json(
        {
          error: 'rate_limited',
          message: `Too many feedback submissions. Please try again in ${Math.ceil(userLimit.retryAfterSeconds / 60)} minutes.`,
          retryAfterSeconds: userLimit.retryAfterSeconds,
        },
        {
          status: 429,
          headers: { 'Retry-After': String(userLimit.retryAfterSeconds) },
        }
      );
    }

    // IP-based rate limiting as additional protection
    const clientIp = (await getClientIp(req)) ?? 'unknown';
    const ipLimit = await consumeRateLimit(`feedback:ip:${clientIp}`, {
      windowMs: RATE_LIMIT.WINDOW_MS,
      maxHits: RATE_LIMIT.MAX_SUBMISSIONS * 2, // More lenient for shared IPs
    });

    if (!ipLimit.allowed) {
      incrementCounter('feedback_ip_rate_limited');
      return NextResponse.json(
        {
          error: 'rate_limited',
          message:
            'Too many requests from this network. Please try again later.',
          retryAfterSeconds: ipLimit.retryAfterSeconds,
        },
        {
          status: 429,
          headers: { 'Retry-After': String(ipLimit.retryAfterSeconds) },
        }
      );
    }

    // Validate request body
    const body = await req.json();
    const parsed = feedbackSchema.safeParse(body);

    if (!parsed.success) {
      incrementCounter('feedback_validation_failed');
      return errorResponse('validation_failed', {
        details: parsed.error.flatten(),
      });
    }

    const { name, message } = parsed.data;

    // Sanitize inputs
    const sanitizedName = sanitizeInput(name);
    const sanitizedMessage = sanitizeInput(message);

    // Validate sanitized lengths (in case sanitization reduced length below minimum)
    if (sanitizedName.length === 0 || sanitizedName.length > 100) {
      incrementCounter('feedback_invalid_name');
      return errorResponse('validation_failed', {
        message: 'Name must be between 1 and 100 characters.',
      });
    }

    if (sanitizedMessage.length === 0 || sanitizedMessage.length > 2000) {
      incrementCounter('feedback_invalid_message');
      return errorResponse('validation_failed', {
        message: 'Message must be between 1 and 2000 characters.',
      });
    }

    // Get user email
    const userEmail = user.email ?? 'no-email@brick-party.com';

    // Insert feedback into database
    const { data, error: insertError } = await supabase
      .from('user_feedback')
      .insert({
        user_id: userId,
        email: userEmail,
        name: sanitizedName,
        message: sanitizedMessage,
      })
      .select('id, created_at')
      .single();

    if (insertError) {
      incrementCounter('feedback_insert_failed');
      return errorResponse('database_error', {
        message: 'Failed to submit feedback. Please try again.',
      });
    }

    incrementCounter('feedback_submitted');
    return NextResponse.json(
      {
        success: true,
        id: data.id,
        created_at: data.created_at,
      },
      { status: 201 }
    );
  } catch {
    incrementCounter('feedback_unexpected_error');
    return errorResponse('server_error', {
      message: 'An unexpected error occurred. Please try again.',
    });
  }
});
