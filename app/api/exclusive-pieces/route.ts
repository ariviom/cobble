import { NextRequest, NextResponse } from 'next/server';

import { errorResponse, getRequestId } from '@/app/lib/api/responses';
import { getExclusivePieces } from '@/app/lib/services/exclusivePieces';
import { logger } from '@/lib/metrics';

/**
 * GET endpoint for theme-based exclusive pieces queries.
 * Query param: themeId (required)
 */
export async function GET(request: NextRequest) {
  const requestId = getRequestId(request);
  const { searchParams } = new URL(request.url);
  const themeIdParam = searchParams.get('themeId');

  if (!themeIdParam) {
    return errorResponse('validation_failed', {
      ...(requestId && { requestId }),
      message: 'themeId query parameter is required',
    });
  }

  const themeId = parseInt(themeIdParam, 10);
  if (Number.isNaN(themeId)) {
    return errorResponse('validation_failed', {
      ...(requestId && { requestId }),
      message: 'themeId must be a valid number',
    });
  }

  try {
    const pieces = await getExclusivePieces({ themeId });

    logger.info('exclusive_pieces.fetched', {
      requestId,
      themeId,
      count: pieces.length,
    });

    return NextResponse.json({ pieces });
  } catch (err) {
    logger.error('exclusive_pieces.route.failed', {
      requestId,
      themeId,
      error: err instanceof Error ? err.message : String(err),
    });

    return errorResponse('external_service_error', {
      ...(requestId && { requestId }),
      message: 'Failed to fetch exclusive pieces',
    });
  }
}

/**
 * POST endpoint for exclusive pieces queries.
 * Accepts either:
 * - { themeId: number } - search by theme
 * - { setNums: string[] } - search by specific sets (e.g., user's collection)
 */
export async function POST(request: NextRequest) {
  const requestId = getRequestId(request);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse('validation_failed', {
      ...(requestId && { requestId }),
      message: 'Invalid JSON body',
    });
  }

  if (!body || typeof body !== 'object') {
    return errorResponse('validation_failed', {
      ...(requestId && { requestId }),
      message: 'Request body must be an object',
    });
  }

  const { themeId, setNums } = body as {
    themeId?: unknown;
    setNums?: unknown;
  };

  // Must provide either themeId or setNums, not both
  const hasThemeId = themeId !== undefined;
  const hasSetNums = setNums !== undefined;

  if (!hasThemeId && !hasSetNums) {
    return errorResponse('validation_failed', {
      ...(requestId && { requestId }),
      message: 'Must provide either themeId or setNums',
    });
  }

  if (hasThemeId && hasSetNums) {
    return errorResponse('validation_failed', {
      ...(requestId && { requestId }),
      message: 'Provide either themeId or setNums, not both',
    });
  }

  try {
    let pieces;

    if (hasThemeId) {
      if (typeof themeId !== 'number' || Number.isNaN(themeId)) {
        return errorResponse('validation_failed', {
          ...(requestId && { requestId }),
          message: 'themeId must be a valid number',
        });
      }

      pieces = await getExclusivePieces({ themeId });

      logger.info('exclusive_pieces.fetched', {
        requestId,
        themeId,
        count: pieces.length,
      });
    } else {
      if (!Array.isArray(setNums)) {
        return errorResponse('validation_failed', {
          ...(requestId && { requestId }),
          message: 'setNums must be an array of strings',
        });
      }

      const validSetNums = setNums.filter(
        (s): s is string => typeof s === 'string' && s.length > 0
      );

      if (validSetNums.length === 0) {
        return NextResponse.json({ pieces: [] });
      }

      pieces = await getExclusivePieces({ setNums: validSetNums });

      logger.info('exclusive_pieces.fetched', {
        requestId,
        setCount: validSetNums.length,
        count: pieces.length,
      });
    }

    return NextResponse.json({ pieces });
  } catch (err) {
    logger.error('exclusive_pieces.route.failed', {
      requestId,
      error: err instanceof Error ? err.message : String(err),
    });

    return errorResponse('external_service_error', {
      ...(requestId && { requestId }),
      message: 'Failed to fetch exclusive pieces',
    });
  }
}
