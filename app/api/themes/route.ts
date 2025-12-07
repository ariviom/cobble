import { errorResponse } from '@/app/lib/api/responses';
import { fetchThemes } from '@/app/lib/services/themes';
import { logger } from '@/lib/metrics';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const themes = await fetchThemes();
    return NextResponse.json({ themes });
  } catch (err) {
    logger.error('themes.route.failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return errorResponse('external_service_error', { message: 'Failed to fetch themes' });
  }
}
