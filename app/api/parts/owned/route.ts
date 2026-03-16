import { errorResponse } from '@/app/lib/api/responses';
import { getCatalogReadClient } from '@/app/lib/db/catalogAccess';
import { getSupabaseAuthServerClient } from '@/app/lib/supabaseAuthServerClient';
import { NextRequest, NextResponse } from 'next/server';

const CACHE_CONTROL = 'private, max-age=30';

/**
 * GET /api/parts/owned?partNum=3069b&colorId=2
 *
 * Returns the total owned quantity for a part+color across all sets
 * the authenticated user has marked as "owned".
 *
 * Paradigm: "Owned" means the user owns the SET, so all parts in that
 * set's inventory are considered owned. We sum quantity from
 * rb_inventory_parts for matching sets.
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

  // Get all sets the user has marked as owned
  const { data: ownedSets, error: setsError } = await supabase
    .from('user_sets')
    .select('set_num')
    .eq('user_id', user.id)
    .eq('owned', true);

  if (setsError || !ownedSets?.length) {
    return NextResponse.json(
      { total: 0 },
      { headers: { 'Cache-Control': CACHE_CONTROL } }
    );
  }

  const ownedSetNums = ownedSets.map(s => s.set_num);

  // Find all inventory entries for this part+color in those sets
  const catalog = getCatalogReadClient();
  let total = 0;

  for (let i = 0; i < ownedSetNums.length; i += 200) {
    const batch = ownedSetNums.slice(i, i + 200);

    // Get inventory IDs for these sets
    const { data: inventories } = await catalog
      .from('rb_inventories')
      .select('id')
      .in('set_num', batch);

    if (!inventories?.length) continue;

    const invIds = inventories.map(inv => inv.id);

    for (let j = 0; j < invIds.length; j += 200) {
      const invBatch = invIds.slice(j, j + 200);
      const { data: parts } = await catalog
        .from('rb_inventory_parts')
        .select('quantity')
        .in('inventory_id', invBatch)
        .eq('part_num', partNum)
        .eq('color_id', colorIdNum)
        .eq('is_spare', false);

      for (const p of parts ?? []) {
        total += p.quantity;
      }
    }
  }

  return NextResponse.json(
    { total },
    { headers: { 'Cache-Control': CACHE_CONTROL } }
  );
}
