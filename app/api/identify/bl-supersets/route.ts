import { blGetPartSupersets, type BLSupersetItem } from '@/app/lib/bricklink';
import { getSetSummary, type PartInSet } from '@/app/lib/rebrickable';
import { incrementCounter, logEvent } from '@/lib/metrics';
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
  if (!blPart) {
    incrementCounter('identify_supersets_validation_failed');
    return NextResponse.json({ error: 'missing_bl_part' });
  }
  const clientIp = (await getClientIp(req)) ?? 'unknown';
  const ipLimit = await consumeRateLimit(`ip:${clientIp}`, {
    windowMs: RATE_WINDOW_MS,
    maxHits: RATE_LIMIT_PER_MINUTE,
  });
  if (!ipLimit.allowed) {
    incrementCounter('identify_supersets_rate_limited');
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
  const blColorId =
    blColorIdRaw && blColorIdRaw.trim() !== ''
      ? Number(blColorIdRaw)
      : undefined;
  try {
    let supersets: BLSupersetItem[] = [];
    try {
      supersets = await blGetPartSupersets(blPart, blColorId);
    } catch {}
    let sets: PartInSet[] = (supersets ?? []).map(s => ({
      setNumber: s.setNumber,
      name: s.name,
      year: 0,
      imageUrl: s.imageUrl,
      quantity: s.quantity,
      numParts: null,
      themeId: null,
      themeName: null,
    }));
    // Enrich with RB set images (and year/name/numParts/theme) when possible
    try {
      const top = sets.slice(0, 20);
      const enriched = await Promise.all(
        top.map(async set => {
          try {
            const summary = await getSetSummary(set.setNumber);
            return {
              ...set,
              name: summary.name ?? set.name,
              year: summary.year ?? set.year,
              imageUrl: summary.imageUrl ?? set.imageUrl,
              numParts: summary.numParts ?? set.numParts ?? null,
              themeId: summary.themeId ?? set.themeId ?? null,
              themeName: summary.themeName ?? set.themeName ?? null,
            };
          } catch {
            return set;
          }
        })
      );
      sets = [...enriched, ...sets.slice(top.length)];
    } catch {}
    // Final safety: ensure name is present (fallback to setNumber).
    sets = sets.map(s => ({
      ...s,
      name: s.name && s.name.trim() ? s.name : s.setNumber,
    }));
    incrementCounter('identify_supersets_fetched', { count: sets.length });
    logEvent('identify_supersets_response', {
      part: blPart,
      count: sets.length,
    });
    if (process.env.NODE_ENV !== 'production') {
      logEvent('identify.bl_supersets', {
        blPart,
        blColorId: typeof blColorId === 'number' ? blColorId : null,
        count: sets.length,
        sample: sets.length ? sets[0] : null,
      });
    }
    return NextResponse.json({ sets });
  } catch (err) {
    incrementCounter('identify_supersets_failed', {
      part: blPart,
      error: err instanceof Error ? err.message : String(err),
    });
    if (process.env.NODE_ENV !== 'production') {
      logEvent('identify.bl_supersets_failed', {
        part: blPart,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return NextResponse.json({
      error: 'identify_bl_supersets_failed',
      sets: [],
    });
  }
}
