import { errorResponse } from '@/app/lib/api/responses';
import { enrichMinifigs } from '@/app/lib/services/minifigEnrichment';
import { logger } from '@/lib/metrics';
import { NextRequest, NextResponse } from 'next/server';

const MAX_BATCH_SIZE = 50;

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) ?? {};
    const figNumsRaw = Array.isArray(body.figNums) ? body.figNums : [];
    const includeSubparts =
      typeof body.includeSubparts === 'boolean' ? body.includeSubparts : true;
    const forceRefresh =
      typeof body.forceRefresh === 'boolean' ? body.forceRefresh : false;

    if (!figNumsRaw.length) {
      return errorResponse('validation_failed', {
        details: { message: 'figNums is required' },
      });
    }

    const trimmed = figNumsRaw
      .map((f: unknown) => (typeof f === 'string' ? f.trim() : ''))
      .filter(Boolean);

    if (!trimmed.length) {
      return errorResponse('validation_failed', {
        details: { message: 'figNums must contain non-empty strings' },
      });
    }

    const limited = trimmed.slice(0, MAX_BATCH_SIZE);
    const truncated = trimmed.length > MAX_BATCH_SIZE;

    const results = await enrichMinifigs(limited, {
      includeSubparts,
      forceRefresh,
    });

    return NextResponse.json({
      results: Object.fromEntries(results),
      truncated,
    });
  } catch (err) {
    logger.error('minifig_enrich.route_failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return errorResponse('enrichment_failed');
  }
}
