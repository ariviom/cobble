import { getSetInventory } from '@/app/lib/rebrickable';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const set = searchParams.get('set');
  if (!set) return NextResponse.json({ error: 'missing_set' }, { status: 400 });
  try {
    const rows = await getSetInventory(set);
    return NextResponse.json({ rows });
  } catch (err) {
    console.error('Inventory fetch failed:', {
      setNumber: set,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    return NextResponse.json({ error: 'inventory_failed' }, { status: 500 });
  }
}
