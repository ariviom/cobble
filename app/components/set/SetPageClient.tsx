'use client';

import { SetTopBar } from '@/app/components/nav/SetTopBar';
import { InventoryTable } from '@/app/components/set/InventoryTable';
import { cn } from '@/app/components/ui/utils';
import { addRecentSet } from '@/app/store/recent-sets';
import { useEffect, useState } from 'react';

type SetPageClientProps = {
  setNumber: string;
  setName: string;
  year: number;
  imageUrl: string | null;
  numParts: number;
  themeId?: number | null;
};

export function SetPageClient({
  setNumber,
  setName,
  year,
  imageUrl,
  numParts,
  themeId,
}: SetPageClientProps) {
  const [expanded, setExpanded] = useState(false);
  const [setPriceStatus, setSetPriceStatus] = useState<
    'idle' | 'loading' | 'loaded' | 'error'
  >('idle');
  const [setPriceSummary, setSetPriceSummary] = useState<{
    total: number;
    minTotal: number | null;
    maxTotal: number | null;
    currency: string | null;
    pricedItemCount: number;
  } | null>(null);
  const [partPricesEnabled, setPartPricesEnabled] = useState(false);

  useEffect(() => {
    addRecentSet({
      setNumber,
      name: setName,
      year,
      imageUrl,
      numParts,
      themeId: themeId ?? null,
    });
  }, [setNumber, setName, year, imageUrl, numParts, themeId]);

  async function handleRequestSetPrice() {
    if (setPriceStatus === 'loading') return;
    try {
      setSetPriceStatus('loading');
      setSetPriceSummary(null);
      const res = await fetch('/api/prices/bricklink-set', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ setNumber }),
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = (await res.json()) as {
        total: number | null;
        minPrice: number | null;
        maxPrice: number | null;
        currency: string | null;
      };
      const currency = data.currency ?? 'USD';
      const total = data.total ?? 0;
      setSetPriceSummary({
        total,
        minTotal: data.minPrice,
        maxTotal: data.maxPrice,
        currency,
        pricedItemCount: 1,
      });
      setSetPriceStatus('loaded');
    } catch {
      setSetPriceStatus('error');
      setSetPriceSummary(null);
    }
  }

  return (
    <div
      className={cn(
        'flex min-h-[100dvh] flex-col',
        'lg:set-grid-layout lg:h-[calc(100dvh-var(--spacing-nav-height))] lg:min-h-0 lg:pl-80 lg:set-grid-animated',
        expanded
          ? 'expanded-topnav lg:set-grid-top-expanded'
          : 'lg:set-grid-top-collapsed'
      )}
    >
      <SetTopBar
        setNumber={setNumber}
        setName={setName}
        imageUrl={imageUrl}
        year={year}
        numParts={numParts}
        themeId={themeId ?? null}
        priceStatus={setPriceStatus}
        priceSummary={setPriceSummary}
        onRequestPrices={handleRequestSetPrice}
        expanded={expanded}
        onToggleExpanded={() => setExpanded(prev => !prev)}
      />
      <InventoryTable
        setNumber={setNumber}
        setName={setName}
        partPricesEnabled={partPricesEnabled}
        onRequestPartPrices={() => setPartPricesEnabled(true)}
      />
    </div>
  );
}
