import 'server-only';

import { getBlToRbColorMap } from '@/app/lib/colors/colorMapping';
import { getCatalogReadClient } from '@/app/lib/db/catalogAccess';
import { errorResponse } from '@/app/lib/api/responses';
import { withCsrfProtection } from '@/app/lib/middleware/csrf';
import { getSupabaseAuthServerClient } from '@/app/lib/supabaseAuthServerClient';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const requestSchema = z.object({
  parts: z
    .array(
      z.object({
        blPartId: z.string().min(1),
        blColorId: z.number().int().min(0),
      })
    )
    .max(500),
  minifigs: z
    .array(
      z.object({
        blMinifigId: z.string().min(1),
      })
    )
    .max(200),
});

type MappedPart = {
  blPartId: string;
  blColorId: number;
  rbPartNum: string | null;
  rbColorId: number | null;
};

type MappedMinifig = {
  blMinifigId: string;
  rbFigNum: string | null;
};

export const POST = withCsrfProtection(async (req: NextRequest) => {
  const supabase = await getSupabaseAuthServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return errorResponse('unauthorized');

  const parsed = requestSchema.safeParse(await req.json());
  if (!parsed.success) {
    return errorResponse('validation_failed', {
      details: parsed.error.flatten(),
    });
  }

  const { parts, minifigs } = parsed.data;
  const catalog = getCatalogReadClient();

  // Map colors
  const blToRbColor = await getBlToRbColorMap();

  // Map parts — collect unique BL part IDs
  const uniqueBlPartIds = [...new Set(parts.map(p => p.blPartId))];
  const blToRbPart = new Map<string, string>();

  // Query rb_parts for bl_part_id matches (batch in chunks of 200)
  for (let i = 0; i < uniqueBlPartIds.length; i += 200) {
    const batch = uniqueBlPartIds.slice(i, i + 200);
    const { data } = await catalog
      .from('rb_parts')
      .select('part_num, bl_part_id')
      .in('bl_part_id', batch);

    for (const row of data ?? []) {
      if (row.bl_part_id) {
        blToRbPart.set(row.bl_part_id, row.part_num);
      }
    }
  }

  const mappedParts: MappedPart[] = parts.map(p => ({
    blPartId: p.blPartId,
    blColorId: p.blColorId,
    rbPartNum: blToRbPart.get(p.blPartId) ?? p.blPartId,
    rbColorId: blToRbColor.get(p.blColorId) ?? null,
  }));

  // Map minifigs
  const uniqueBlMinifigIds = [...new Set(minifigs.map(m => m.blMinifigId))];
  const blToRbMinifig = new Map<string, string>();

  for (let i = 0; i < uniqueBlMinifigIds.length; i += 200) {
    const batch = uniqueBlMinifigIds.slice(i, i + 200);
    const { data } = await catalog
      .from('rb_minifigs')
      .select('fig_num, bl_minifig_id')
      .in('bl_minifig_id', batch);

    for (const row of data ?? []) {
      if (row.bl_minifig_id) {
        blToRbMinifig.set(row.bl_minifig_id, row.fig_num);
      }
    }
  }

  const mappedMinifigs: MappedMinifig[] = minifigs.map(m => ({
    blMinifigId: m.blMinifigId,
    rbFigNum: blToRbMinifig.get(m.blMinifigId) ?? null,
  }));

  return NextResponse.json({ parts: mappedParts, minifigs: mappedMinifigs });
});
