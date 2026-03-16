/**
 * Color grouping and sorting for the part modal color picker.
 * Groups LEGO colors into ROYGBIV + neutral categories based on RGB hue.
 */

export type ColorEntry = {
  colorId: number;
  colorName: string;
  rgb?: string | null;
  imageUrl: string | null;
};

/** Well-known Rebrickable color IDs used for default selection and thumbnail preference. */
export const LEGO_COLOR_IDS = { WHITE: 15, BLACK: 0, LIGHT_GRAY: 71 } as const;

/** Preferred color order for default selection: white, light gray, black. */
const PREFERRED_DEFAULT_IDS = [
  LEGO_COLOR_IDS.WHITE,
  LEGO_COLOR_IDS.LIGHT_GRAY,
  LEGO_COLOR_IDS.BLACK,
] as const;

/** Pick the best default color from a list, preferring white → light gray → black → first. */
export function pickDefaultColor<T extends { colorId: number }>(
  colors: T[]
): T | undefined {
  for (const id of PREFERRED_DEFAULT_IDS) {
    const c = colors.find(c => c.colorId === id);
    if (c) return c;
  }
  return colors[0];
}

export type ColorGroup = {
  key: string;
  label: string;
  /** Representative RGB hex for the group pill (no #). */
  swatch: string;
  colors: ColorEntry[];
};

/** Parse hex RGB to [h, s, l] where h is 0-360, s/l are 0-1. */
function hexToHsl(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  if (max === min) return [0, 0, l];

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;

  return [h * 360, s, l];
}

type GroupKey =
  | 'red'
  | 'orange'
  | 'yellow'
  | 'green'
  | 'blue'
  | 'purple'
  | 'brown'
  | 'gray'
  | 'special';

const GROUP_META: Record<
  GroupKey,
  { label: string; swatch: string; order: number }
> = {
  gray: { label: 'Gray', swatch: 'A0A5A9', order: 0 },
  red: { label: 'Red', swatch: 'C91A09', order: 1 },
  orange: { label: 'Orange', swatch: 'FE8A18', order: 2 },
  yellow: { label: 'Yellow', swatch: 'F2CD37', order: 3 },
  green: { label: 'Green', swatch: '237841', order: 4 },
  blue: { label: 'Blue', swatch: '0055BF', order: 5 },
  purple: { label: 'Purple', swatch: '81007B', order: 6 },
  brown: { label: 'Brown', swatch: '583927', order: 7 },
  special: { label: 'Special', swatch: 'DBAC34', order: 8 },
};

function classifyColor(name: string, rgb: string | null | undefined): GroupKey {
  const lowerName = name.toLowerCase();

  // Name-based overrides for ambiguous colors
  if (
    lowerName.includes('chrome') ||
    lowerName.includes('metallic') ||
    lowerName.includes('pearl') ||
    lowerName.includes('glitter') ||
    lowerName.includes('milky') ||
    lowerName.includes('glow')
  )
    return 'special';
  if (lowerName.includes('brown') || lowerName.includes('nougat'))
    return 'brown';
  if (lowerName.includes('tan')) return 'brown';

  if (!rgb || rgb.length < 6) return 'special';

  const [h, s, l] = hexToHsl(rgb);

  // Neutrals (black, white, gray all grouped as 'gray')
  if (s < 0.1) return 'gray';
  if (l < 0.15) return 'gray';
  if (l > 0.92 && s < 0.2) return 'gray';

  // Chromatic grouping by hue
  if (h < 15 || h >= 345) return 'red';
  if (h < 45) return 'orange';
  if (h < 70) return 'yellow';
  if (h < 165) return 'green';
  if (h < 260) return 'blue';
  if (h < 345) return 'purple';

  return 'special';
}

/** Sort colors within a group by hue then lightness for visual coherence. */
function sortColorsInGroup(colors: ColorEntry[]): ColorEntry[] {
  return [...colors].sort((a, b) => {
    const [hA, , lA] = hexToHsl(a.rgb ?? '808080');
    const [hB, , lB] = hexToHsl(b.rgb ?? '808080');
    const hDiff = hA - hB;
    if (Math.abs(hDiff) > 5) return hDiff;
    return lA - lB;
  });
}

/**
 * Group and sort colors into ROYGBIV + neutral categories.
 * Empty groups are omitted.
 */
export function groupColors(colors: ColorEntry[]): ColorGroup[] {
  const buckets = new Map<GroupKey, ColorEntry[]>();

  for (const c of colors) {
    const key = classifyColor(c.colorName, c.rgb);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(c);
  }

  const groups: ColorGroup[] = [];
  for (const [key, entries] of buckets) {
    const meta = GROUP_META[key];
    groups.push({
      key,
      label: meta.label,
      swatch: meta.swatch,
      colors: sortColorsInGroup(entries),
    });
  }

  groups.sort((a, b) => {
    const orderA = GROUP_META[a.key as GroupKey]?.order ?? 99;
    const orderB = GROUP_META[b.key as GroupKey]?.order ?? 99;
    return orderA - orderB;
  });

  return groups;
}
