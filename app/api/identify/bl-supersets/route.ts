import { blGetPartSupersets, type BLSupersetItem } from '@/app/lib/bricklink';
import { getSetSummary } from '@/app/lib/rebrickable';
import { consumeRateLimit, getClientIp } from '@/lib/rateLimit';
import { NextRequest, NextResponse } from 'next/server';

const RATE_WINDOW_MS =
  Number.parseInt(process.env.BL_RATE_WINDOW_MS ?? '', 10) || 60_000;
const RATE_LIMIT_PER_MINUTE =
  Number.parseInt(process.env.BL_RATE_LIMIT_PER_MINUTE ?? '', 10) || 30;

export async function GET(req: NextRequest) {
	const { searchParams } = new URL(req.url);
	const blPart = searchParams.get('part');
	const blColorIdRaw = searchParams.get('blColorId');
	if (!blPart) return NextResponse.json({ error: 'missing_bl_part' });
	const clientIp = (await getClientIp(req)) ?? 'unknown';
	const ipLimit = await consumeRateLimit(`ip:${clientIp}`, {
		windowMs: RATE_WINDOW_MS,
		maxHits: RATE_LIMIT_PER_MINUTE,
	});
	if (!ipLimit.allowed) {
		return NextResponse.json(
			{
				error: 'rate_limited',
				scope: 'ip',
				retryAfterSeconds: ipLimit.retryAfterSeconds,
			},
			{
				status: 429,
				headers: { 'Retry-After': String(ipLimit.retryAfterSeconds) },
			}
		);
	}
	const blColorId = blColorIdRaw && blColorIdRaw.trim() !== '' ? Number(blColorIdRaw) : undefined;
	try {
		let supersets: BLSupersetItem[] = [];
		try {
			supersets = await blGetPartSupersets(blPart, blColorId);
		} catch {}
		let sets = (supersets ?? []).map(s => ({
			setNumber: s.setNumber,
			name: s.name,
			year: 0,
			imageUrl: s.imageUrl,
			quantity: s.quantity,
		}));
		// Enrich with RB set images (and year) when possible
		try {
			const top = sets.slice(0, 20);
			const enriched = await Promise.all(
				top.map(async set => {
					try {
						const summary = await getSetSummary(set.setNumber);
						return {
							...set,
							year: summary.year ?? set.year,
							imageUrl: summary.imageUrl ?? set.imageUrl,
						};
					} catch {
						return set;
					}
				})
			);
			sets = [...enriched, ...sets.slice(top.length)];
		} catch {}
		if (process.env.NODE_ENV !== 'production') {
			try {
				console.log('identify/bl-supersets', {
					blPart,
					blColorId: typeof blColorId === 'number' ? blColorId : null,
					count: sets.length,
					sample: sets.length ? sets[0] : null,
				});
			} catch {}
		}
		return NextResponse.json({ sets });
	} catch (err) {
		if (process.env.NODE_ENV !== 'production') {
			try {
				console.log('identify/bl-supersets failed', {
					part: blPart,
					error: err instanceof Error ? err.message : String(err),
				});
			} catch {}
		}
		return NextResponse.json({ error: 'identify_bl_supersets_failed', sets: [] });
	}
}


