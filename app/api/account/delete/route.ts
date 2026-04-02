import 'server-only';

import { NextResponse, type NextRequest } from 'next/server';

import { withCsrfProtection } from '@/app/lib/middleware/csrf';
import { deleteUserAccount } from '@/app/lib/services/accountDeletion';
import { getSupabaseAuthServerClient } from '@/app/lib/supabaseAuthServerClient';
import { logger } from '@/lib/metrics';

export const DELETE = withCsrfProtection(async (_request: NextRequest) => {
  try {
    const supabase = await getSupabaseAuthServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: 'unauthorized', message: 'Not authenticated.' },
        { status: 401 }
      );
    }

    await deleteUserAccount(user.id);

    // Sign out the session after deletion
    await supabase.auth.signOut();

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error('api.account_delete.failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: 'deletion_failed', message: 'Failed to delete account.' },
      { status: 500 }
    );
  }
});
