import { getPart } from '@/app/lib/rebrickable';
import { NextRequest, NextResponse } from 'next/server';

async function resolveBrickLinkId(
  partId: string,
  depth: number = 0
): Promise<string | null> {
  if (depth > 4) return null;
  const part = await getPart(partId);
  const external = (
    part.external_ids as
      | {
          BrickLink?: {
            ext_ids?: Array<string | number>;
          };
        }
      | null
      | undefined
  )?.BrickLink;
  const ids = Array.isArray(external?.ext_ids) ? external!.ext_ids : [];
  const normalized =
    ids
      .map(id =>
        typeof id === 'number' ? String(id) : typeof id === 'string' ? id : null
      )
      .find(id => id && id.trim().length > 0) ?? null;
  if (normalized) return normalized;
  if (part.print_of && part.print_of.trim().length > 0) {
    try {
      return await resolveBrickLinkId(part.print_of.trim(), depth + 1);
    } catch {
      return null;
    }
  }
  return null;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const part = searchParams.get('part');
  if (!part || !part.trim()) {
    return NextResponse.json({ error: 'missing_part' }, { status: 400 });
  }
  try {
    const itemNo = await resolveBrickLinkId(part.trim());
    return NextResponse.json({ itemNo });
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('parts/bricklink lookup failed', {
        part,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return NextResponse.json({ error: 'part_lookup_failed' }, { status: 500 });
  }
}


