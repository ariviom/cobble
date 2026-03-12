const GRID_SIZE_CLASS: Record<string, string> = {
  sm: 'grid-size-sm',
  md: 'grid-size-md',
  lg: 'grid-size-lg',
};

/** Returns the CSS class string for the parts grid, matching the set inventory layout. */
export function getGridClassName(
  view: 'list' | 'grid' | 'micro',
  itemSize: 'sm' | 'md' | 'lg'
): string {
  if (view === 'list') return 'flex flex-col gap-2';
  const sizeClass =
    view === 'micro' ? 'grid-size-micro' : GRID_SIZE_CLASS[itemSize];
  const gap = view === 'micro' ? 'gap-1' : 'gap-2';
  return `grid ${sizeClass} ${gap}`;
}
