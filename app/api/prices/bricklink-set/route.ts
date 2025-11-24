import { blGetSetPriceGuide } from '@/app/lib/bricklink';
import { NextRequest, NextResponse } from 'next/server';

type Body = {
  setNumber: string;
};

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const setNumber = body.setNumber?.trim();
  if (!setNumber) {
    return NextResponse.json({ error: 'missing_set_number' }, { status: 400 });
  }

  try {
    const guide = await blGetSetPriceGuide(setNumber);
    return NextResponse.json({
      total: guide.unitPriceUsed,
      minPrice: guide.minPriceUsed,
      maxPrice: guide.maxPriceUsed,
      currency: guide.currencyCode,
    });
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.error('bricklink-set price failed', {
        setNumber,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return NextResponse.json({ error: 'price_failed' }, { status: 502 });
  }
}


