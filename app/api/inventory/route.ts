import { getSetInventoryRows } from '@/app/lib/services/inventory';
import { NextRequest, NextResponse } from 'next/server';

// Inventory data changes infrequently - cache for 5 minutes, serve stale for 1 hour
const CACHE_CONTROL = 'public, max-age=300, stale-while-revalidate=3600';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const set = searchParams.get('set');
  if (!set) return NextResponse.json({ error: 'missing_set' }, { status: 400 });
  try {
    const rows = await getSetInventoryRows(set);
    return NextResponse.json(
      { rows },
      { headers: { 'Cache-Control': CACHE_CONTROL } }
    );
  } catch (err) {
    console.error('Inventory fetch failed:', {
      setNumber: set,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    return NextResponse.json({ error: 'inventory_failed' }, { status: 500 });
  }
}
