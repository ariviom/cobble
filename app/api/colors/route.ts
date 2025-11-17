import { NextResponse } from 'next/server';
import { getColors } from '@/app/lib/rebrickable';

export async function GET() {
	try {
		const colors = await getColors();
		return NextResponse.json({
			colors: colors.map(c => ({ id: c.id, name: c.name })),
		});
	} catch (err) {
		console.error('Colors fetch failed:', {
			error: err instanceof Error ? err.message : String(err),
			stack: err instanceof Error ? err.stack : undefined,
		});
		return NextResponse.json({ error: 'colors_failed' }, { status: 500 });
	}
}


