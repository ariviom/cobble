import { getSupabaseServiceRoleClient } from '@/app/lib/supabaseServiceRoleClient';
import { logger } from '@/lib/metrics';
import { NextResponse } from 'next/server';

type RequestBody = {
  setNumber: string;
  rbFigIds: string[];
  exportType: 'bricklink' | 'rebrickable' | 'pickABrick';
  missingOnly: boolean;
};

type ConfidenceDistribution = {
  total: number;
  perfect: number;
  high: number;
  medium: number;
  low: number;
  unmapped: number;
  avg: number | null;
  manuallyApproved: number;
};

/**
 * POST /api/export/log-confidence
 *
 * Logs the confidence distribution for minifig mappings in an export.
 * This is a fire-and-forget logging endpoint for observability.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RequestBody;
    const { setNumber, rbFigIds, exportType, missingOnly } = body;

    if (!setNumber || !Array.isArray(rbFigIds)) {
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400 }
      );
    }

    // If no minifigs in export, just log that
    if (rbFigIds.length === 0) {
      logger.info('export.confidence_distribution', {
        setNumber,
        exportType,
        missingOnly,
        minifigCount: 0,
        distribution: null,
      });
      return NextResponse.json({ logged: true });
    }

    const supabase = getSupabaseServiceRoleClient();

    // Fetch confidence scores for the exported minifigs
    const { data: mappings, error } = await supabase
      .from('bricklink_minifig_mappings')
      .select('rb_fig_id, confidence, manually_approved')
      .in('rb_fig_id', rbFigIds);

    if (error) {
      logger.warn('export.confidence_distribution.fetch_error', {
        setNumber,
        exportType,
        error: error.message,
      });
      return NextResponse.json({ logged: false, error: error.message });
    }

    // Build a map of confidence scores
    const confidenceMap = new Map(
      (mappings ?? []).map(m => [
        m.rb_fig_id,
        {
          confidence: m.confidence as number | null,
          manuallyApproved: m.manually_approved ?? false,
        },
      ])
    );

    // Calculate distribution
    const confidences: number[] = [];
    let unmapped = 0;
    let manuallyApproved = 0;

    for (const rbFigId of rbFigIds) {
      const mapping = confidenceMap.get(rbFigId);
      if (!mapping) {
        unmapped++;
        continue;
      }
      if (mapping.manuallyApproved) {
        manuallyApproved++;
        // Manually approved mappings are treated as perfect confidence
        confidences.push(1.0);
      } else if (mapping.confidence !== null) {
        confidences.push(mapping.confidence);
      } else {
        unmapped++;
      }
    }

    const distribution: ConfidenceDistribution = {
      total: rbFigIds.length,
      perfect: confidences.filter(c => c === 1.0).length,
      high: confidences.filter(c => c >= 0.7 && c < 1.0).length,
      medium: confidences.filter(c => c >= 0.5 && c < 0.7).length,
      low: confidences.filter(c => c < 0.5).length,
      unmapped,
      avg:
        confidences.length > 0
          ? confidences.reduce((a, b) => a + b, 0) / confidences.length
          : null,
      manuallyApproved,
    };

    logger.info('export.confidence_distribution', {
      setNumber,
      exportType,
      missingOnly,
      minifigCount: rbFigIds.length,
      distribution,
    });

    // Warn if significant portion is low confidence
    const lowConfidenceRatio =
      distribution.total > 0
        ? (distribution.low + distribution.unmapped) / distribution.total
        : 0;

    if (lowConfidenceRatio > 0.1) {
      logger.warn('export.low_confidence_warning', {
        setNumber,
        exportType,
        lowConfidencePercent: (lowConfidenceRatio * 100).toFixed(1),
        affectedMinifigs: distribution.low + distribution.unmapped,
        totalMinifigs: distribution.total,
      });
    }

    return NextResponse.json({ logged: true, distribution });
  } catch (err) {
    logger.error('export.confidence_distribution.error', {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ logged: false }, { status: 500 });
  }
}
