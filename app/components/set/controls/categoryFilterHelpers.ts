import type { InventoryFilter } from '../types';

export type ParentSelectionState = 'none' | 'some' | 'all';

export function getParentState(
  filter: InventoryFilter,
  allSubcategoriesByParent: Record<string, string[]>,
  parent: string
): ParentSelectionState {
  const hasParent = (filter.parents || []).includes(parent);
  if (!hasParent) return 'none';
  const all = allSubcategoriesByParent[parent] ?? [];
  const explicit = filter.subcategoriesByParent?.[parent];
  // Absence of an explicit list implies "all selected"
  if (!explicit || explicit.length === 0) {
    return 'all';
  }
  if (all.length > 0 && explicit.length === all.length) return 'all';
  return 'some';
}

export function toggleParent(
  filter: InventoryFilter,
  allSubcategoriesByParent: Record<string, string[]>,
  parent: string
): InventoryFilter {
  if (parent === '__all__') {
    return { ...filter, parents: [], subcategoriesByParent: {} };
  }
  const parents = new Set(filter.parents || []);
  if (!parents.has(parent)) {
    // Select parent; default to "all subcategories" by clearing explicit list
    return {
      ...filter,
      parents: [...parents.add(parent)],
      subcategoriesByParent: Object.fromEntries(
        Object.entries(filter.subcategoriesByParent || {}).filter(
          ([p]) => p !== parent
        )
      ),
    };
  } else {
    // Deselect parent; remove explicit subcategory list
    parents.delete(parent);
    const nextSubs = { ...(filter.subcategoriesByParent || {}) };
    delete nextSubs[parent];
    return { ...filter, parents: Array.from(parents), subcategoriesByParent: nextSubs };
  }
}

export function toggleSubcategory(
  filter: InventoryFilter,
  allSubcategoriesByParent: Record<string, string[]>,
  parent: string,
  sub: string
): InventoryFilter {
  const allSubs = allSubcategoriesByParent[parent] ?? [];
  const parents = new Set(filter.parents || []);
  if (!parents.has(parent)) {
    parents.add(parent);
  }
  const currentExplicit = filter.subcategoriesByParent?.[parent];
  let nextForParent: string[];
  if (!currentExplicit || currentExplicit.length === 0) {
    // Currently implicit "all". Start from all, then toggle off the chosen one.
    nextForParent = allSubs.filter(s => s !== sub);
  } else {
    const set = new Set(currentExplicit);
    if (set.has(sub)) set.delete(sub);
    else set.add(sub);
    nextForParent = Array.from(set);
  }
  const nextSubs = { ...(filter.subcategoriesByParent || {}) };
  if (nextForParent.length === allSubs.length || nextForParent.length === 0) {
    // Collapse back to implicit "all" when full, or if empty revert to "all" to avoid a parent with no subs
    delete nextSubs[parent];
  } else {
    nextSubs[parent] = nextForParent.sort((a, b) => a.localeCompare(b));
  }
  return {
    ...filter,
    parents: Array.from(parents),
    subcategoriesByParent: nextSubs,
  };
}

export function clearParentSubcategories(
  filter: InventoryFilter,
  parent: string
): InventoryFilter {
  if (!(filter.parents || []).includes(parent)) return filter;
  const nextSubs = { ...(filter.subcategoriesByParent || {}) };
  delete nextSubs[parent];
  return { ...filter, subcategoriesByParent: nextSubs };
}
