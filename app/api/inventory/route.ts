import { getSetInventoryRows } from '@/app/lib/services/inventory';
import { incrementCounter, logEvent } from '@/lib/metrics';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

// Inventory data changes infrequently - cache for 5 minutes, serve stale for 1 hour
const CACHE_CONTROL = 'public, max-age=300, stale-while-revalidate=3600';

const querySchema = z.object({
  set: z.string().min(1).max(200),
});

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const parsed = querySchema.safeParse(Object.fromEntries(searchParams.entries()));
  if (!parsed.success) {
    incrementCounter('inventory_validation_failed', { issues: parsed.error.flatten() });
    return NextResponse.json({ error: 'validation_failed' }, { status: 400 });
  }
  const set = parsed.data.set;
  try {
    const rows = await getSetInventoryRows(set);
    incrementCounter('inventory_fetched', { setNumber: set });
    logEvent('inventory_response', { setNumber: set, count: rows.length });
    return NextResponse.json(
      { rows },
      { headers: { 'Cache-Control': CACHE_CONTROL } }
    );
  } catch (err) {
    incrementCounter('inventory_failed', {
      setNumber: set,
      error: err instanceof Error ? err.message : String(err),
    });
    console.error('Inventory fetch failed:', {
      setNumber: set,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    return NextResponse.json({ error: 'inventory_failed' }, { status: 500 });
  }
}
