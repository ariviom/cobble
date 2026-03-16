export type ThemeInfo = {
  id: number;
  name: string;
  parent_id: number | null;
};

export function getRootThemeId(
  themeId: number,
  themeMap: Map<number, ThemeInfo>
): number {
  let current = themeMap.get(themeId);
  if (!current) return themeId;
  while (current.parent_id != null) {
    const parent = themeMap.get(current.parent_id);
    if (!parent) break;
    current = parent;
  }
  return current.id;
}

export function getRootThemeName(
  themeId: number,
  themeMap: Map<number, ThemeInfo>
): string | null {
  const rootId = getRootThemeId(themeId, themeMap);
  const root = themeMap.get(rootId);
  return root?.name ?? null;
}

export function getMinifigStatusLabel(status: string | null): string {
  switch (status) {
    case 'owned':
      return 'Owned';
    case 'want':
      return 'Wishlist';
    default:
      return 'Minifigures';
  }
}
