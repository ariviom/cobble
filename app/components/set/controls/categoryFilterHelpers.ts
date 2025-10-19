import type { InventoryFilter } from '../types';

export type ParentSelectionState = 'none' | 'some' | 'all';

export function getParentState(
  filter: InventoryFilter,
  subcategoriesByParent: Record<string, string[]>,
  parent: string
): ParentSelectionState {
  if (filter.parent !== parent) return 'none';
  const all = subcategoriesByParent[parent] ?? [];
  const selected = filter.subcategories || [];
  if (selected.length === 0) return 'none';
  if (all.length > 0 && selected.length === all.length) return 'all';
  return 'some';
}

export function toggleParent(
  filter: InventoryFilter,
  subcategoriesByParent: Record<string, string[]>,
  parent: string
): InventoryFilter {
  if (parent === '__all__') {
    return { ...filter, parent: null, subcategories: [] };
  }
  const allSubcats = subcategoriesByParent[parent] ?? [];
  const state = getParentState(filter, subcategoriesByParent, parent);
  if (filter.parent !== parent) {
    return { ...filter, parent, subcategories: allSubcats };
  }
  if (state === 'all') {
    // Uncheck parent: clear filter
    return { ...filter, parent: null, subcategories: [] };
  }
  // From none or some -> select all for this parent
  return { ...filter, parent, subcategories: allSubcats };
}

export function toggleSubcategory(
  filter: InventoryFilter,
  parent: string,
  sub: string
): InventoryFilter {
  if (filter.parent !== parent) {
    return { ...filter, parent, subcategories: [sub] };
  }
  const exists = (filter.subcategories || []).includes(sub);
  return {
    ...filter,
    subcategories: exists
      ? (filter.subcategories || []).filter(c => c !== sub)
      : [...(filter.subcategories || []), sub],
  };
}
