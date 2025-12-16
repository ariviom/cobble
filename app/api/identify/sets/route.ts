import { errorResponse } from '@/app/lib/api/responses';
import { logger } from '@/lib/metrics';
import { NextRequest, NextResponse } from 'next/server';

import {
  handleMinifigIdentify,
  handlePartIdentify,
  looksLikeBricklinkFig,
} from './handlers';

/**
 * GET /api/identify/sets
 *
 * Identify a part or minifigure and return sets containing it.
 *
 * Query params:
 * - part: Part ID or minifig ID (required)
 * - colorId: Rebrickable color ID (optional)
 * - blColorId: BrickLink color ID (optional, mapped to RB if colorId not provided)
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const part = searchParams.get('part');
  const colorIdRaw = searchParams.get('colorId');
  const blColorIdRaw = searchParams.get('blColorId');

  if (!part) {
    return errorResponse('missing_required_field', {
      message: 'Part parameter is required',
    });
  }

  // Check if this is a minifig identification request
  const isMinifig = part.startsWith('fig:') || looksLikeBricklinkFig(part);

  if (isMinifig) {
    return handleMinifigRequest(part);
  }

  return handlePartRequest(part, colorIdRaw, blColorIdRaw);
}

/**
 * Handle minifig identification requests.
 */
async function handleMinifigRequest(part: string) {
  const token = part.startsWith('fig:') ? part.slice(4).trim() : part.trim();

  if (!token) {
    return errorResponse('missing_required_field', {
      message: 'Minifig ID is required',
      details: {
        part: { partNum: part, name: '', imageUrl: null },
        sets: [],
      },
    });
  }

  try {
    const result = await handleMinifigIdentify(part);
    return NextResponse.json(result);
  } catch (err) {
    logger.warn('identify.sets.minifig.failed', {
      part,
      error: err instanceof Error ? err.message : String(err),
    });
    return errorResponse('identify_sets_failed', {
      message: 'Failed to identify minifig sets',
      details: {
        part: { partNum: part, name: '', imageUrl: null },
        sets: [],
      },
    });
  }
}

/**
 * Handle part identification requests.
 */
async function handlePartRequest(
  part: string,
  colorIdRaw: string | null,
  blColorIdRaw: string | null
) {
  const colorId =
    colorIdRaw && colorIdRaw.trim() !== '' ? Number(colorIdRaw) : undefined;
  const blColorId =
    blColorIdRaw && blColorIdRaw.trim() !== ''
      ? Number(blColorIdRaw)
      : undefined;

  try {
    const result = await handlePartIdentify(part, { colorId, blColorId });
    return NextResponse.json(result);
  } catch (err) {
    logger.warn('identify.sets.failed', {
      part,
      error: err instanceof Error ? err.message : String(err),
    });
    return errorResponse('identify_sets_failed', {
      message: 'Failed to identify part sets',
      details: {
        part: { partNum: part, name: '', imageUrl: null },
        sets: [],
      },
    });
  }
}
