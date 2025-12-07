import { NextResponse } from 'next/server';

import { getSupabaseAuthServerClient } from '@/app/lib/supabaseAuthServerClient';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabaseServiceRoleClient';
import { getUserMinifigs } from '@/app/lib/server/getUserMinifigs';

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
    | { error: string }
  >
> {
  try {
    const authClient = await getSupabaseAuthServerClient();
    const { data: auth } = await authClient.auth.getUser();
    const user = auth.user;

    if (!user) {
      return NextResponse.json({ minifigs: [] }, { status: 401 });
    }

    const supabase = getSupabaseServiceRoleClient();
    const minifigs = await getUserMinifigs({
      userId: user.id,
      supabase,
      onDemandLimit: 5,
    });

    return NextResponse.json({ minifigs });
  } catch (err) {
    console.error('[user-minifigs] unexpected error', err);
    return NextResponse.json({ error: 'unexpected_error' }, { status: 500 });
  }
}

