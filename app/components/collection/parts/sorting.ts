// app/components/collection/parts/sorting.ts

import type { CollectionPart, PartsFilter, PartsSortKey } from './types';

export function filterBySource(
  parts: CollectionPart[],
  source: PartsFilter['source']
): CollectionPart[] {
  switch (source) {
    case 'owned':
      return parts.filter(p => p.ownedFromSets > 0);
    case 'loose':
      return parts.filter(p => p.looseQuantity > 0);
    case 'missing':
      return parts.filter(p => p.missingFromSets.length > 0);
    case 'all':
    default:
      return parts;
  }
}

export function filterByCriteria(
  parts: CollectionPart[],
  filter: PartsFilter
): CollectionPart[] {
  let result = parts;

  if (filter.categories.length > 0) {
    const cats = new Set(filter.categories);
    result = result.filter(
      p => p.parentCategory != null && cats.has(p.parentCategory)
    );
  }

  if (filter.colors.length > 0) {
    const cols = new Set(filter.colors);
    result = result.filter(p => cols.has(String(p.colorId)));
  }

  return result;
}

export function sortParts(
  parts: CollectionPart[],
  sortKey: PartsSortKey,
  sortDir: 'asc' | 'desc'
): CollectionPart[] {
  const sorted = [...parts];
  const dir = sortDir === 'asc' ? 1 : -1;

  sorted.sort((a, b) => {
    switch (sortKey) {
      case 'name':
        return dir * a.partName.localeCompare(b.partName);
      case 'color':
        return dir * a.colorName.localeCompare(b.colorName);
      case 'category':
        return (
          dir * (a.parentCategory ?? '').localeCompare(b.parentCategory ?? '')
        );
      case 'quantity':
        return dir * (a.totalOwned - b.totalOwned);
      default:
        return 0;
    }
  });

  return sorted;
}

export function groupParts(
  parts: CollectionPart[],
  groupBy: 'none' | 'color' | 'category'
): Map<string, CollectionPart[]> | null {
  if (groupBy === 'none') return null;

  const groups = new Map<string, CollectionPart[]>();

  for (const part of parts) {
    const key =
      groupBy === 'color'
        ? part.colorName || 'Unknown'
        : part.parentCategory || 'Unknown';

    const group = groups.get(key);
    if (group) {
      group.push(part);
    } else {
      groups.set(key, [part]);
    }
  }

  return groups;
}

export function paginateParts<T>(
  items: T[],
  page: number,
  pageSize: number
): { items: T[]; totalPages: number; currentPage: number } {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    totalPages,
    currentPage: safePage,
  };
}

export function extractCategoryOptions(parts: CollectionPart[]): string[] {
  const cats = new Set<string>();
  for (const p of parts) {
    if (p.parentCategory) cats.add(p.parentCategory);
  }
  return Array.from(cats).sort();
}

export function extractColorOptions(parts: CollectionPart[]): string[] {
  const colors = new Set<string>();
  for (const p of parts) {
    colors.add(String(p.colorId));
  }
  return Array.from(colors).sort();
}
