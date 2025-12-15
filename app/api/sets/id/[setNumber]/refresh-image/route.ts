import { errorResponse } from '@/app/lib/api/responses';
import { getCatalogWriteClient } from '@/app/lib/db/catalogAccess';
import { getSetSummary } from '@/app/lib/rebrickable';
import { incrementCounter, logger } from '@/lib/metrics';
import { NextResponse } from 'next/server';

export async function POST(
  _req: Request,
  { params }: { params: { setNumber: string } }
) {
  const trimmed = params.setNumber.trim();

  if (!trimmed) {
    return errorResponse('validation_failed', {
      message: 'Missing or empty setNumber',
    });
  }

  try {
    // Fetch latest data from Rebrickable (cached on server side).
    const summary = await getSetSummary(trimmed);
    const imageUrl =
      typeof summary.imageUrl === 'string' && summary.imageUrl.trim().length > 0
        ? summary.imageUrl.trim()
        : null;

    if (!imageUrl) {
      incrementCounter('set_image_refresh_no_url', { setNumber: trimmed });
      return NextResponse.json(
        { imageUrl: null },
        { status: 200, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    // Upsert the corrected image URL into rb_sets using service role client.
    const supabase = getCatalogWriteClient();
    const { error } = await supabase
      .from('rb_sets')
      .update({
        image_url: imageUrl,
        // best-effort timestamp; column has default so we don't rely on it here
        last_updated_at: new Date().toISOString(),
      })
      .eq('set_num', trimmed);

    if (error) {
      logger.error('set_image_refresh_update_failed', {
        setNumber: trimmed,
        error: error.message,
      });
      incrementCounter('set_image_refresh_update_failed', {
        setNumber: trimmed,
      });
      // Still return the URL so the client can use it immediately.
      return NextResponse.json(
        { imageUrl },
        { status: 200, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    incrementCounter('set_image_refresh_success', { setNumber: trimmed });
    return NextResponse.json(
      { imageUrl },
      { status: 200, headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    logger.error('set_image_refresh_failed', {
      setNumber: trimmed,
      error: err instanceof Error ? err.message : String(err),
    });
    incrementCounter('set_image_refresh_failed', { setNumber: trimmed });
    return errorResponse('rebrickable_failed', {
      message: 'Failed to refresh set image from Rebrickable',
    });
  }
}
