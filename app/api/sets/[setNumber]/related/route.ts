import 'server-only';

import { getRelatedSets } from '@/app/lib/catalog/relatedSets';
import { getSetSummaryLocal } from '@/app/lib/catalog/sets';
import { NextResponse, type NextRequest } from 'next/server';

type RouteParams = {
  setNumber: string;
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<RouteParams> }
) {
  const { setNumber } = await params;
  const url = request.nextUrl;
  const limit = Math.min(Number(url.searchParams.get('limit')) || 8, 24);
  const offset = Math.max(Number(url.searchParams.get('offset')) || 0, 0);

  // Accept themeId/year as query params to avoid redundant summary lookup
  // on pagination requests (client already has this data from the initial SSR).
  const qThemeId = Number(url.searchParams.get('themeId'));
  const qYear = Number(url.searchParams.get('year'));

  let themeId: number | null = Number.isFinite(qThemeId) ? qThemeId : null;
  let year = Number.isFinite(qYear) ? qYear : 0;

  // Fallback: fetch summary if params not provided (e.g., direct API call)
  if (themeId == null) {
    const summary = await getSetSummaryLocal(setNumber).catch(() => null);
    if (!summary || summary.themeId == null) {
      return NextResponse.json({ sets: [], total: 0 });
    }
    themeId = summary.themeId;
    year = summary.year;
  }

  const result = await getRelatedSets(themeId, setNumber, year, limit, offset);

  return NextResponse.json(result);
}
