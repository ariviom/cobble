import { errorResponse } from '@/app/lib/api/responses';
import { getColors } from '@/app/lib/rebrickable';
import { logger } from '@/lib/metrics';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const colors = await getColors();
    return NextResponse.json({
      colors: colors.map(c => ({ id: c.id, name: c.name })),
    });
  } catch (err) {
    logger.error('colors.route.failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return errorResponse('external_service_error', {
      message: 'Failed to fetch colors',
    });
  }
}
