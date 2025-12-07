import { getSetInventoryRowsWithMeta } from '@/app/lib/services/inventory';
import { incrementCounter, logEvent } from '@/lib/metrics';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

// Inventory data changes infrequently - cache for 5 minutes, serve stale for 1 hour
const CACHE_CONTROL = 'public, max-age=300, stale-while-revalidate=3600';

const querySchema = z.object({
  set: z.string().min(1).max(200),
  // Optional: include minifig mapping metadata in response
  includeMeta: z.enum(['true', 'false']).optional(),
});

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const parsed = querySchema.safeParse(Object.fromEntries(searchParams.entries()));
  if (!parsed.success) {
    incrementCounter('inventory_validation_failed', { issues: parsed.error.flatten() });
    return NextResponse.json({ error: 'validation_failed' }, { status: 400 });
  }
  const set = parsed.data.set;
  const includeMeta = parsed.data.includeMeta === 'true';
  
  try {
    const result = await getSetInventoryRowsWithMeta(set);
    incrementCounter('inventory_fetched', { setNumber: set });
    logEvent('inventory_response', { 
      setNumber: set, 
      count: result.rows.length,
      minifigsMapped: result.minifigMappingMeta?.mappedCount,
      syncTriggered: result.minifigMappingMeta?.syncTriggered,
    });
    
    // Return rows and optionally include metadata
    const response: {
      rows: typeof result.rows;
      meta?: typeof result.minifigMappingMeta;
    } = { rows: result.rows };
    
    if (includeMeta && result.minifigMappingMeta) {
      response.meta = result.minifigMappingMeta;
    }
    
    return NextResponse.json(response, { 
      headers: { 'Cache-Control': CACHE_CONTROL } 
    });
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
