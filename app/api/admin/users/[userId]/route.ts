import { NextRequest, NextResponse } from 'next/server';

import { isAdmin } from '@/app/lib/server/requireAdmin';
import { getSupabaseAuthServerClient } from '@/app/lib/supabaseAuthServerClient';
import { getAdminUserDetail } from '@/app/lib/services/adminUsers';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const supabase = await getSupabaseAuthServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!isAdmin(user)) {
    return new NextResponse(null, { status: 404 });
  }

  const { userId } = await params;
  const detail = await getAdminUserDetail(userId);

  if (!detail) {
    return new NextResponse(null, { status: 404 });
  }

  return NextResponse.json(detail);
}
