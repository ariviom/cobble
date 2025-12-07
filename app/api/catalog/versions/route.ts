import { getCatalogReadClient } from '@/app/lib/db/catalogAccess';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const querySchema = z.object({
  sources: z
    .string()
    .optional()
    .transform(val =>
      val
        ? val
            .split(',')
            .map(s => s.trim())
            .filter(Boolean)
        : []
    ),
});

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const parsed = querySchema.safeParse(Object.fromEntries(searchParams.entries()));
  if (!parsed.success) {
    return NextResponse.json({ error: 'validation_failed' }, { status: 400 });
  }

  // Default: return all sources if none specified
  const sources =
    parsed.data.sources.length > 0
      ? parsed.data.sources
      : [
          'themes',
          'colors',
          'part_categories',
          'parts',
          'sets',
          'minifigs',
          'inventories',
          'inventory_parts',
          'inventory_minifigs',
        ];

  try {
    const supabase = getCatalogReadClient();
    const { data, error } = await supabase
      .from('rb_download_versions')
      .select('source, version')
      .in('source', sources);

    if (error) {
      return NextResponse.json({ error: 'version_read_failed' }, { status: 500 });
    }

    const versions: Record<string, string | null> = {};
    for (const row of data ?? []) {
      if (row && typeof row.source === 'string') {
        versions[row.source] =
          typeof row.version === 'string' && row.version.trim() ? row.version : null;
      }
    }

    return NextResponse.json({ versions });
  } catch {
    return NextResponse.json({ error: 'version_unexpected_error' }, { status: 500 });
  }
}


