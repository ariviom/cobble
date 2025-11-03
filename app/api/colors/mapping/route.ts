import { getColors } from '@/app/lib/rebrickable';
import { NextResponse } from 'next/server';

// Fallback mappings for colors without external_ids (legacy/common colors)
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
    const mapping: Record<number, number> = {};

    for (const color of colors) {
      // Try to get BrickLink color ID from external_ids
      const blExt = color.external_ids?.BrickLink?.ext_ids;
      if (blExt && blExt.length > 0) {
        // Use the first BrickLink color ID (most common case)
        mapping[color.id] = blExt[0]!;
      } else if (FALLBACK_COLOR_MAP[color.id] != null) {
        // Fall back to hardcoded mapping for common colors
        mapping[color.id] = FALLBACK_COLOR_MAP[color.id]!;
      }
    }

    // Merge fallback mappings that might not be in API results
    return NextResponse.json({ mapping }, { headers: { 'Cache-Control': 'public, max-age=3600' } });
  } catch (err) {
    console.error('Failed to generate color mapping:', err);
    // Return fallback mapping only if API fails
    return NextResponse.json({ mapping: FALLBACK_COLOR_MAP }, { status: 200 });
  }
}


