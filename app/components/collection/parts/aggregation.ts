// app/components/collection/parts/aggregation.ts

import type {
  CatalogPart,
  CatalogSetPart,
  LocalLoosePart,
} from '@/app/lib/localDb/schema';
import type { CollectionPart } from './types';

type SetOwnedData = {
  setNumber: string;
  setName: string;
  ownedByKey: Record<string, number>;
};

function isRegularPartKey(inventoryKey: string): boolean {
  return !inventoryKey.startsWith('fig:') && !inventoryKey.startsWith('bl:');
}

function buildCollectionPart(
  cp: CatalogSetPart,
  partMeta: CatalogPart | undefined
): CollectionPart {
  return {
    partNum: cp.partNum,
    colorId: cp.colorId,
    canonicalKey: cp.inventoryKey,
    partName: partMeta?.name ?? cp.partNum,
    colorName: cp.colorName,
    imageUrl: cp.imageUrl ?? partMeta?.imageUrl ?? null,
    parentCategory: partMeta?.parentCategory ?? null,
    categoryName: partMeta?.categoryName ?? null,
    elementId: cp.elementId ?? null,
    setCount: cp.setCount ?? null,
    ownedFromSets: 0,
    looseQuantity: 0,
    totalOwned: 0,
    setSources: [],
    missingFromSets: [],
  };
}

export function aggregateOwnedParts(
  catalogPartsBySet: Map<string, CatalogSetPart[]>,
  ownedDataBySet: SetOwnedData[],
  looseParts: LocalLoosePart[],
  partMetaLookup: Map<string, CatalogPart>
): CollectionPart[] {
  const partMap = new Map<string, CollectionPart>();

  for (const { setNumber, setName } of ownedDataBySet) {
    const catalogParts = catalogPartsBySet.get(setNumber) ?? [];
    for (const cp of catalogParts) {
      if (!isRegularPartKey(cp.inventoryKey)) continue;

      const key = cp.inventoryKey;

      let part = partMap.get(key);
      if (!part) {
        part = buildCollectionPart(cp, partMetaLookup.get(cp.partNum));
        partMap.set(key, part);
      }

      part.ownedFromSets += cp.quantityRequired;
      part.setSources.push({
        setNumber,
        setName,
        quantityInSet: cp.quantityRequired,
        quantityOwned: cp.quantityRequired,
      });
    }
  }

  for (const lp of looseParts) {
    const key = `${lp.partNum}:${lp.colorId}`;
    const part = partMap.get(key);
    if (part) {
      part.looseQuantity = lp.quantity;
    } else {
      const meta = partMetaLookup.get(lp.partNum);
      partMap.set(key, {
        partNum: lp.partNum,
        colorId: lp.colorId,
        canonicalKey: key,
        partName: meta?.name ?? lp.partNum,
        colorName: '',
        imageUrl: meta?.imageUrl ?? null,
        parentCategory: meta?.parentCategory ?? null,
        categoryName: meta?.categoryName ?? null,
        elementId: null,
        setCount: null,
        ownedFromSets: 0,
        looseQuantity: lp.quantity,
        totalOwned: lp.quantity,
        setSources: [],
        missingFromSets: [],
      });
    }
  }

  for (const part of partMap.values()) {
    part.totalOwned = part.ownedFromSets + part.looseQuantity;
  }

  return Array.from(partMap.values());
}

export function computeMissingParts(
  catalogPartsBySet: Map<string, CatalogSetPart[]>,
  ownedDataBySet: SetOwnedData[],
  partMetaLookup: Map<string, CatalogPart>
): CollectionPart[] {
  const partMap = new Map<string, CollectionPart>();

  for (const { setNumber, setName, ownedByKey } of ownedDataBySet) {
    const catalogParts = catalogPartsBySet.get(setNumber) ?? [];
    for (const cp of catalogParts) {
      if (!isRegularPartKey(cp.inventoryKey)) continue;

      const key = cp.inventoryKey;
      const owned = ownedByKey[key] ?? 0;
      const missing = cp.quantityRequired - owned;
      if (missing <= 0) continue;

      let part = partMap.get(key);
      if (!part) {
        part = buildCollectionPart(cp, partMetaLookup.get(cp.partNum));
        partMap.set(key, part);
      }

      part.missingFromSets.push({
        setNumber,
        setName,
        quantityMissing: missing,
        quantityRequired: cp.quantityRequired,
      });
    }
  }

  return Array.from(partMap.values());
}
