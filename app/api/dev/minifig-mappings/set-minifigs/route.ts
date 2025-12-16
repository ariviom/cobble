import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabaseServiceRoleClient';

// Development-only route for fetching all minifigs from a set

export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { error: 'This endpoint is only available in development' },
      { status: 403 }
    );
  }

  const searchParams = request.nextUrl.searchParams;
  const setNum = searchParams.get('set_num');

  if (!setNum) {
    return NextResponse.json(
      { error: 'set_num parameter is required' },
      { status: 400 }
    );
  }

  const supabase = getSupabaseServiceRoleClient();

  try {
    // Get all BL minifigs for this set
    const { data: blMinifigs, error: blErr } = await supabase
      .from('bl_set_minifigs')
      .select('minifig_no, name, quantity, rb_fig_id, image_url')
      .eq('set_num', setNum)
      .order('name');

    if (blErr) throw blErr;

    if (!blMinifigs || blMinifigs.length === 0) {
      return NextResponse.json({
        set_num: setNum,
        minifigs: [],
      });
    }

    // Use stored image_url if available, otherwise construct from minifig_no
    const minifigsWithImages = blMinifigs.map(m => ({
      ...m,
      image_url:
        m.image_url ||
        `https://img.bricklink.com/ItemImage/MN/0/${m.minifig_no}.png`,
      rb_fig_id: m.rb_fig_id ?? null,
    }));

    return NextResponse.json({
      set_num: setNum,
      minifigs: minifigsWithImages,
    });
  } catch (error) {
    console.error('[set-minifigs] Failed to fetch set minifigs:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch set minifigs',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
