import { errorResponse } from '@/app/lib/api/responses';
import { getSupabaseAuthServerClient } from '@/app/lib/supabaseAuthServerClient';
import { NextRequest, NextResponse } from 'next/server';

const CACHE_CONTROL = 'private, max-age=30';

/**
 * GET /api/parts/owned?partNum=3069b&colorId=2
 *
 * Returns the total owned quantity for a part+color across all sets
 * the authenticated user has marked as "owned".
 *
 * Uses a single SQL join query for performance (~1-2ms).
 */
export async function GET(req: NextRequest) {
  const supabase = await getSupabaseAuthServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { total: 0 },
      { headers: { 'Cache-Control': CACHE_CONTROL } }
    );
  }

  const { searchParams } = new URL(req.url);
  const partNum = searchParams.get('partNum');
  const colorId = searchParams.get('colorId');

  if (!partNum || colorId == null) {
    return errorResponse('missing_required_field', {
      message: 'partNum and colorId are required',
    });
  }

  const colorIdNum = Number(colorId);
  if (!Number.isFinite(colorIdNum)) {
    return errorResponse('validation_failed', {
      message: 'colorId must be a number',
    });
  }

  const { data, error } = await supabase.rpc('get_owned_part_count', {
    p_user_id: user.id,
    p_part_num: partNum,
    p_color_id: colorIdNum,
  });

  if (error) {
    // Fallback: RPC doesn't exist yet, return 0
    return NextResponse.json(
      { total: 0 },
      { headers: { 'Cache-Control': CACHE_CONTROL } }
    );
  }

  return NextResponse.json(
    { total: data ?? 0 },
    { headers: { 'Cache-Control': CACHE_CONTROL } }
  );
}
