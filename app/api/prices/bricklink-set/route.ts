import { blGetSetPriceGuide } from '@/app/lib/bricklink';
import { DEFAULT_PRICING_PREFERENCES } from '@/app/lib/pricing';
import { getSupabaseAuthServerClient } from '@/app/lib/supabaseAuthServerClient';
import { loadUserPricingPreferences } from '@/app/lib/userPricingPreferences';
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

  // Determine pricing preferences for this request (user-specific when
  // authenticated via Supabase cookies; otherwise fall back to global USD).
  let pricingPrefs = DEFAULT_PRICING_PREFERENCES;
  try {
    const supabase = await getSupabaseAuthServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (!userError && user) {
      pricingPrefs = await loadUserPricingPreferences(supabase, user.id);
    }
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      try {
        console.warn('bricklink-set: failed to load pricing preferences', {
          setNumber,
          error: err instanceof Error ? err.message : String(err),
        });
      } catch {}
    }
  }

  try {
    const guide = await blGetSetPriceGuide(setNumber, pricingPrefs);
    return NextResponse.json({
      total: guide.unitPriceUsed,
      minPrice: guide.minPriceUsed,
      maxPrice: guide.maxPriceUsed,
      currency: guide.currencyCode,
    });
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('bricklink-set price failed', {
        setNumber,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return NextResponse.json({ error: 'price_failed' }, { status: 502 });
  }
}


