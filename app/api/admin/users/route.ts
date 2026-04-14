import { NextRequest, NextResponse } from 'next/server';

import { isAdmin } from '@/app/lib/server/requireAdmin';
import { getSupabaseAuthServerClient } from '@/app/lib/supabaseAuthServerClient';
import { listAdminUsers } from '@/app/lib/services/adminUsers';

const MAX_PAGE_SIZE = 50;
const DEFAULT_PAGE_SIZE = 25;

export async function GET(req: NextRequest) {
  const supabase = await getSupabaseAuthServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!isAdmin(user)) {
    return new NextResponse(null, { status: 404 });
  }

  const url = new URL(req.url);
  const rawQ = url.searchParams.get('q');
  const q = rawQ && rawQ.length > 0 ? rawQ : undefined;
  const pageRaw = Number(url.searchParams.get('page') || '0');
  const sizeRaw = Number(url.searchParams.get('pageSize') || DEFAULT_PAGE_SIZE);

  const page =
    Number.isFinite(pageRaw) && pageRaw >= 0 ? Math.floor(pageRaw) : 0;
  const pageSize = Number.isFinite(sizeRaw)
    ? Math.min(Math.max(1, Math.floor(sizeRaw)), MAX_PAGE_SIZE)
    : DEFAULT_PAGE_SIZE;

  const result = await listAdminUsers({
    ...(q !== undefined && { q }),
    page,
    pageSize,
  });
  return NextResponse.json(result, {
    headers: { 'Cache-Control': 'private, no-store' },
  });
}
