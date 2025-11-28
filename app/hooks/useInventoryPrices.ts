'use client';

import { useCallback, useEffect, useState } from 'react';
import type { InventoryRow } from '@/app/components/set/types';

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

type UseInventoryPricesArgs = {
  setNumber: string;
  rows: InventoryRow[];
  keys: string[];
  onPriceStatusChange?: (status: PriceStatus) => void;
  onPriceTotalsChange?: (summary: PriceSummary | null) => void;
};

type UseInventoryPricesResult<TPriceInfo extends BasePriceInfo> = {
  pricesByKey: Record<string, TPriceInfo>;
  pricesStatus: PriceStatus;
  pricesError: string | null;
  /**
   * Keys that currently have an in-flight BrickLink price request.
   */
  pendingKeys: Set<string>;
  /**
   * Request BrickLink prices for a subset of inventory keys. Items that already
   * have prices or are currently pending will be skipped.
   */
  requestPricesForKeys: (keys: string[]) => Promise<void>;
};

export function useInventoryPrices<TPriceInfo extends BasePriceInfo>({
  setNumber,
  rows,
  keys,
  onPriceStatusChange,
  onPriceTotalsChange,
}: UseInventoryPricesArgs): UseInventoryPricesResult<TPriceInfo> {
  const [pricesByKey, setPricesByKey] = useState<Record<string, TPriceInfo>>(
    {}
  );
  const [pricesStatus, setPricesStatus] = useState<PriceStatus>('idle');
  const [pricesError, setPricesError] = useState<string | null>(null);
  const [pendingKeys, setPendingKeys] = useState<Set<string>>(new Set());

  const requestPricesForKeys = useCallback(
    async (keysToLoad: string[]) => {
      const uniqueKeys = Array.from(
        new Set(keysToLoad.filter((key): key is string => Boolean(key)))
      );
      if (!uniqueKeys.length || !rows.length) return;

      const keysToFetch = uniqueKeys.filter(key => {
        if (pendingKeys.has(key)) return false;
        if (pricesByKey[key]) return false;
        return true;
      });

      if (!keysToFetch.length) return;

      setPendingKeys(prev => {
        const next = new Set(prev);
        for (const key of keysToFetch) {
          next.add(key);
        }
        return next;
      });

      setPricesStatus('loading');
      setPricesError(null);

      const items = keysToFetch
        .map(key => {
          const idx = keys.indexOf(key);
          if (idx === -1) return null;
          const row = rows[idx];
          if (!row) return null;
          return {
            key,
            partId: row.partId,
            colorId: row.colorId,
          };
        })
        .filter(
          (
            item
          ): item is { key: string; partId: string; colorId: number } =>
            Boolean(item)
        )
        .map(item => ({
          ...item,
          partId: String(item.partId),
        }));

      if (!items.length) {
        setPendingKeys(prev => {
          const next = new Set(prev);
          for (const key of keysToFetch) {
            next.delete(key);
          }
          return next;
        });
        if (Object.keys(pricesByKey).length > 0) {
          setPricesStatus('loaded');
        } else {
          setPricesStatus('idle');
        }
        return;
      }

      if (process.env.NODE_ENV !== 'production') {
        console.log('[InventoryPrices] loading BrickLink prices', {
          setNumber,
          itemCount: items.length,
        });
      }

      try {
        const res = await fetch('/api/prices/bricklink', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ items }),
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

        setPricesByKey(prev => ({
          ...prev,
          ...(data.prices ?? {}),
        }));

        const hasAnyPrices =
          Object.keys(data.prices ?? {}).length > 0 ||
          Object.keys(pricesByKey).length > 0;

        setPricesStatus(hasAnyPrices ? 'loaded' : 'idle');
      } catch (err) {
        if (process.env.NODE_ENV !== 'production') {
          console.error('[InventoryPrices] load failed', err);
        }
        setPricesStatus(prev =>
          prev === 'idle' && Object.keys(pricesByKey).length === 0
            ? 'error'
            : prev
        );
        setPricesError(err instanceof Error ? err.message : String(err));
      } finally {
        setPendingKeys(prev => {
          const next = new Set(prev);
          for (const key of keysToFetch) {
            next.delete(key);
          }
          return next;
        });
      }
    },
    [keys, rows, pendingKeys, pricesByKey, setNumber]
  );

  // Reset prices when switching sets
  useEffect(() => {
    setPricesByKey({});
    setPricesStatus('idle');
    setPricesError(null);
    setPendingKeys(new Set());
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

  return {
    pricesByKey,
    pricesStatus,
    pricesError,
    pendingKeys,
    requestPricesForKeys,
  };
}


