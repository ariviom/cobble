import { blGetPartPriceGuide } from '@/app/lib/bricklink';
import { mapToBrickLink } from '@/app/lib/mappings/rebrickableToBricklink';
import { NextRequest, NextResponse } from 'next/server';

type PriceRequestItem = {
  key: string;
  partId: string;
  colorId: number;
};

type PriceRequestBody = {
  items: PriceRequestItem[];
};

type PriceResponseEntry = {
  unitPrice: number | null;
  minPrice: number | null;
  maxPrice: number | null;
  currency: string | null;
  bricklinkColorId: number | null;
  itemType: 'PART' | 'MINIFIG';
};

const MAX_ITEMS = 500;
const BATCH_SIZE = 10;

export async function POST(req: NextRequest) {
  let body: PriceRequestBody;
  try {
    body = (await req.json()) as PriceRequestBody;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const rawItems = Array.isArray(body.items) ? body.items : [];
  if (!rawItems.length) {
    return NextResponse.json({ prices: {} satisfies Record<string, never> });
  }

  const items: PriceRequestItem[] = rawItems
    .filter(
      it =>
        it &&
        typeof it.key === 'string' &&
        typeof it.partId === 'string' &&
        typeof it.colorId === 'number'
    )
    .slice(0, MAX_ITEMS);

  if (process.env.NODE_ENV !== 'production') {
    try {
      console.log('prices/bricklink POST', {
        rawCount: rawItems.length,
        filteredCount: items.length,
      });
    } catch {}
  }

  const prices: Record<string, PriceResponseEntry> = {};

  // Simple batched concurrency limiter to avoid hammering BrickLink
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async item => {
        try {
          const mapped = await mapToBrickLink(item.partId, item.colorId);
          if (!mapped) {
            if (process.env.NODE_ENV !== 'production') {
              try {
                console.log('prices/bricklink: unmapped item', {
                  key: item.key,
                  partId: item.partId,
                  colorId: item.colorId,
                });
              } catch {}
            }
            return;
          }
          const pg = await blGetPartPriceGuide(
            mapped.itemNo,
            mapped.colorId ?? undefined,
            mapped.itemType
          );
          prices[item.key] = {
            unitPrice: pg.unitPriceUsed,
            minPrice: pg.minPriceUsed,
            maxPrice: pg.maxPriceUsed,
            currency: pg.currencyCode,
            bricklinkColorId: mapped.colorId ?? null,
            itemType: mapped.itemType,
          };
        } catch (err) {
          if (process.env.NODE_ENV !== 'production') {
            try {
              console.error('prices/bricklink: price fetch failed', {
                key: item.key,
                partId: item.partId,
                colorId: item.colorId,
                error: err instanceof Error ? err.message : String(err),
              });
            } catch {}
          }
          // Swallow per-item errors; missing prices just won't be present in the map
        }
      })
    );
  }

  if (process.env.NODE_ENV !== 'production') {
    try {
      console.log('prices/bricklink response', {
        pricedCount: Object.keys(prices).length,
      });
    } catch {}
  }

  return NextResponse.json({ prices });
}
