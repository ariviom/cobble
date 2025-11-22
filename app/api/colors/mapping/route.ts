import { getColors } from '@/app/lib/rebrickable';
import { NextResponse } from 'next/server';

// Fallback mappings for a handful of legacy colors in case Rebrickable data is unavailable.
const FALLBACK_COLOR_MAP: Record<number, number> = {
  0: 0, // Black
  15: 11, // White
  3: 5, // Red
  4: 7, // Yellow
  1: 15, // Blue
};

export async function GET() {
  try {
    const colors = await getColors();
    const mapping: Record<number, number> = { ...FALLBACK_COLOR_MAP };

    for (const color of colors) {
      const blExt = color.external_ids?.BrickLink?.ext_ids;
      if (blExt && blExt.length > 0) {
        mapping[color.id] = blExt[0]!;
      }
    }

    return NextResponse.json(
      { mapping },
      { headers: { 'Cache-Control': 'public, max-age=3600' } }
    );
  } catch (err) {
    console.error('Color mapping fetch failed:', {
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    // Fall back to the static map so clients can still proceed
    return NextResponse.json(
      { mapping: FALLBACK_COLOR_MAP },
      { status: 200, headers: { 'Cache-Control': 'public, max-age=60' } }
    );
  }
}
