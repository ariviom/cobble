'use client';

import { useCallback, useEffect, useState } from 'react';
import type { InventoryRow } from '@/app/components/set/types';
import type { SortKey } from '@/app/components/set/types';

type PriceStatus = 'idle' | 'loading' | 'loaded' | 'error';

export type BasePriceInfo = {
  unitPrice: number | null;
  minPrice: number | null;
  maxPrice: number | null;
  currency: string | null;
};

export type PriceSummary = {
  total: number;
  minTotal: number | null;
  maxTotal: number | null;
  currency: string | null;
  pricedItemCount: number;
};

type UseInventoryPricesArgs<TPriceInfo extends BasePriceInfo> = {
  setNumber: string;
  rows: InventoryRow[];
  keys: string[];
  sortKey: SortKey;
  /**
   * When false, prices will not be fetched automatically or in response to sort changes.
   * Callers can flip this to true (e.g. from a "Get prices" button) to trigger loading.
   */
  enabled?: boolean;
  onPriceStatusChange?: ((status: PriceStatus) => void) | undefined;
  onPriceTotalsChange?: ((summary: PriceSummary | null) => void) | undefined;
};

type UseInventoryPricesResult<TPriceInfo extends BasePriceInfo> = {
  pricesByKey: Record<string, TPriceInfo>;
  pricesStatus: PriceStatus;
  pricesError: string | null;
};

export function useInventoryPrices<TPriceInfo extends BasePriceInfo>({
  setNumber,
  rows,
  keys,
  sortKey,
  enabled = true,
  onPriceStatusChange,
  onPriceTotalsChange,
}: UseInventoryPricesArgs<TPriceInfo>): UseInventoryPricesResult<TPriceInfo> {
  const [pricesByKey, setPricesByKey] = useState<Record<string, TPriceInfo>>(
    {}
  );
  const [pricesStatus, setPricesStatus] = useState<PriceStatus>('idle');
  const [pricesError, setPricesError] = useState<string | null>(null);

  const loadPrices = useCallback(async () => {
    if (!enabled) return;
    if (!rows.length) return;
    if (pricesStatus === 'loading' || pricesStatus === 'loaded') return;

    if (process.env.NODE_ENV !== 'production') {
      console.log('[InventoryPrices] loading BrickLink prices', {
        setNumber,
        itemCount: keys.length,
      });
    }

    setPricesStatus('loading');
    setPricesError(null);

    try {
      const res = await fetch('/api/prices/bricklink', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          items: keys.map((key, idx) => ({
            key,
            partId: rows[idx]!.partId,
            colorId: rows[idx]!.colorId,
          })),
        }),
      });

      if (process.env.NODE_ENV !== 'production') {
        console.log('[InventoryPrices] response meta', {
          ok: res.ok,
          status: res.status,
        });
      }

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = (await res.json()) as {
        prices: Record<string, TPriceInfo>;
      };

      const count = data.prices ? Object.keys(data.prices).length : 0;

      if (process.env.NODE_ENV !== 'production') {
        console.log('[InventoryPrices] parsed', {
          setNumber,
          pricedCount: count,
        });
      }

      setPricesByKey(data.prices ?? {});
      setPricesStatus('loaded');
    } catch (err) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('[InventoryPrices] load failed', err);
      }
      setPricesStatus('error');
      setPricesError(err instanceof Error ? err.message : String(err));
    }
  }, [keys, rows, pricesStatus, setNumber, enabled]);

  // Reset prices when switching sets
  useEffect(() => {
    setPricesByKey({});
    setPricesStatus('idle');
    setPricesError(null);
  }, [setNumber]);

  // Notify caller of status changes
  useEffect(() => {
    onPriceStatusChange?.(pricesStatus);
  }, [pricesStatus, onPriceStatusChange]);

  // Compute aggregate totals when prices are loaded
  useEffect(() => {
    if (!onPriceTotalsChange) return;
    if (pricesStatus !== 'loaded') {
      onPriceTotalsChange(null);
      return;
    }

    let total = 0;
    let minTotal: number | null = null;
    let maxTotal: number | null = null;
    let currency: string | null = null;
    let counted = 0;

    for (let i = 0; i < rows.length; i += 1) {
      const key = keys[i]!;
      const info = pricesByKey[key];
      if (!info || typeof info.unitPrice !== 'number') continue;

      const qty = rows[i]!.quantityRequired;
      total += info.unitPrice * qty;

      const partMin =
        typeof info.minPrice === 'number' && Number.isFinite(info.minPrice)
          ? info.minPrice
          : info.unitPrice;
      const partMax =
        typeof info.maxPrice === 'number' && Number.isFinite(info.maxPrice)
          ? info.maxPrice
          : info.unitPrice;

      if (typeof partMin === 'number' && Number.isFinite(partMin)) {
        minTotal = (minTotal ?? 0) + partMin * qty;
      }
      if (typeof partMax === 'number' && Number.isFinite(partMax)) {
        maxTotal = (maxTotal ?? 0) + partMax * qty;
      }

      currency = currency ?? info.currency ?? 'USD';
      counted += 1;
    }

    if (counted === 0) {
      onPriceTotalsChange(null);
      return;
    }

    onPriceTotalsChange({
      total,
      minTotal,
      maxTotal,
      currency,
      pricedItemCount: counted,
    });
  }, [pricesByKey, rows, keys, pricesStatus, onPriceTotalsChange]);

  // Defer initial price loading slightly to keep first paint fast
  useEffect(() => {
    if (!enabled) return;
    if (!rows.length) return;
    if (pricesStatus !== 'idle') return;

    const timeout = window.setTimeout(() => {
      void loadPrices();
    }, 800);

    return () => window.clearTimeout(timeout);
  }, [rows, pricesStatus, loadPrices, enabled]);

  // Ensure prices start loading as soon as user chooses price sort
  useEffect(() => {
    if (!enabled) return;
    if (sortKey === 'price' && pricesStatus === 'idle') {
      void loadPrices();
    }
  }, [sortKey, pricesStatus, loadPrices, enabled]);

  return {
    pricesByKey,
    pricesStatus,
    pricesError,
  };
}


