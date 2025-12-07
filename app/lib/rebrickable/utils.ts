import type { ParentCategory } from '@/app/lib/rebrickable/types';

export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function mapCategoryNameToParent(name: string): ParentCategory {
  const n = name.toLowerCase();
  // Precedence: Technic first
  if (
    n.startsWith('technic') ||
    n.includes('pneumatic') ||
    n.includes('power functions') ||
    n.includes('electronics')
  )
    return 'Technic';
  if (
    n.includes('wheel') ||
    n.includes('tyre') ||
    n.includes('tire') ||
    n.includes('rim')
  )
    return 'Wheels';
  if (n.startsWith('minifig')) return 'Minifigure';
  if (n.startsWith('clip') || n.includes('clip')) return 'Clip';
  if (n.startsWith('bar') || n.includes('lightsaber')) return 'Bar';
  if (n.startsWith('hinge') || n.includes('turntable')) return 'Hinge';
  if (n.startsWith('slope') || n.includes('roof tile')) return 'Slope';
  if (n.startsWith('tile')) return 'Tile';
  if (n.startsWith('plate') || n.includes('wedge')) return 'Plate';
  if (n.startsWith('brick') || n.includes('bracket') || n.includes('arch'))
    return 'Brick';
  return 'Misc';
}

export function extractBricklinkPartId(
  externalIds: Record<string, unknown> | null | undefined
): string | null {
  if (!externalIds) return null;
  const blIds = (externalIds as { BrickLink?: unknown }).BrickLink;
  // BrickLink IDs can be an array ["3024"] or object {ext_ids: [...]}
  if (Array.isArray(blIds) && blIds.length > 0) {
    const first = blIds[0];
    return typeof first === 'string' || typeof first === 'number'
      ? String(first)
      : null;
  }
  if (blIds && typeof blIds === 'object' && 'ext_ids' in (blIds as object)) {
    const extIds = (blIds as { ext_ids?: unknown }).ext_ids;
    if (Array.isArray(extIds) && extIds.length > 0) {
      const first = extIds[0];
      return typeof first === 'string' || typeof first === 'number'
        ? String(first)
        : null;
    }
  }
  return null;
}
