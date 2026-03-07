export type ImportFormat =
  | 'brick-party'
  | 'brickscan-csv'
  | 'brickscan-xml'
  | 'rebrickable-sets';

export function detectFormat(content: string): ImportFormat | null {
  const trimmed = content.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed.app === 'brick-party') return 'brick-party';
    } catch {
      // Not valid JSON
    }
    return null;
  }

  if (trimmed.startsWith('<INVENTORY>') || trimmed.startsWith('<?xml')) {
    return 'brickscan-xml';
  }

  const firstLine = trimmed.split('\n')[0]?.toUpperCase() ?? '';
  if (firstLine.includes('ITEMTYPE') && firstLine.includes('ITEMID')) {
    return 'brickscan-csv';
  }
  if (firstLine.includes('SET NUMBER')) {
    return 'rebrickable-sets';
  }

  return null;
}
