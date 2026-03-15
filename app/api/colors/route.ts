import { errorResponse } from '@/app/lib/api/responses';
import { getDbColors } from '@/app/lib/colors/colorMapping';
import { logger } from '@/lib/metrics';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const colors = await getDbColors();
    return NextResponse.json(
      { colors },
      {
        headers: {
          'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
        },
      }
    );
  } catch (err) {
    logger.error('colors.route.failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return errorResponse('external_service_error', {
      message: 'Failed to fetch colors',
    });
  }
}
