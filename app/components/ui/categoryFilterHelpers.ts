export type CategoryFilterFields = {
  parents: string[];
  subcategoriesByParent: Record<string, string[]>;
};

export type ParentSelectionState = 'none' | 'some' | 'all';

export function getParentState<T extends CategoryFilterFields>(
  filter: T,
  allSubcategoriesByParent: Record<string, string[]>,
  parent: string
): ParentSelectionState {
  const hasParent = (filter.parents || []).includes(parent);
  if (!hasParent) return 'none';
  const all = allSubcategoriesByParent[parent] ?? [];
  const explicit = filter.subcategoriesByParent?.[parent];
  if (!explicit || explicit.length === 0) {
    return 'all';
  }
  if (all.length > 0 && explicit.length === all.length) return 'all';
  return 'some';
}

export function toggleParent<T extends CategoryFilterFields>(
  filter: T,
  parent: string
): T {
  if (parent === '__all__') {
    return { ...filter, parents: [], subcategoriesByParent: {} };
  }
  const parents = new Set(filter.parents || []);
  if (!parents.has(parent)) {
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
    parents.delete(parent);
    const nextSubs = { ...(filter.subcategoriesByParent || {}) };
    delete nextSubs[parent];
    return {
      ...filter,
      parents: Array.from(parents),
      subcategoriesByParent: nextSubs,
    };
  }
}

export function toggleSubcategory<T extends CategoryFilterFields>(
  filter: T,
  allSubcategoriesByParent: Record<string, string[]>,
  parent: string,
  sub: string
): T {
  const allSubs = allSubcategoriesByParent[parent] ?? [];
  const parents = new Set(filter.parents || []);
  const wasParentSelected = parents.has(parent);

  if (!wasParentSelected) {
    parents.add(parent);
  }

  const currentExplicit = filter.subcategoriesByParent?.[parent];
  let nextForParent: string[];

  if (!wasParentSelected) {
    nextForParent = [sub];
  } else if (!currentExplicit || currentExplicit.length === 0) {
    nextForParent = allSubs.filter(s => s !== sub);
  } else {
    const set = new Set(currentExplicit);
    if (set.has(sub)) set.delete(sub);
    else set.add(sub);
    nextForParent = Array.from(set);
  }

  const nextSubs = { ...(filter.subcategoriesByParent || {}) };

  if (nextForParent.length === allSubs.length) {
    delete nextSubs[parent];
  } else if (nextForParent.length === 0) {
    parents.delete(parent);
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

export function clearParentSubcategories<T extends CategoryFilterFields>(
  filter: T,
  parent: string
): T {
  if (!(filter.parents || []).includes(parent)) return filter;
  const nextSubs = { ...(filter.subcategoriesByParent || {}) };
  delete nextSubs[parent];
  return { ...filter, subcategoriesByParent: nextSubs };
}
