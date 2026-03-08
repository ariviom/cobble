import type { BrickScanParseResult } from './brickScanCsvParser';

function getTagText(item: Element, tag: string): string | null {
  return item.getElementsByTagName(tag)[0]?.textContent?.trim() ?? null;
}

export function parseBrickScanXml(content: string): BrickScanParseResult {
  const parts: BrickScanParseResult['parts'] = [];
  const minifigs: BrickScanParseResult['minifigs'] = [];
  const warnings: string[] = [];

  const parser = new DOMParser();
  const doc = parser.parseFromString(content, 'text/xml');

  const parserError = doc.querySelector('parsererror');
  if (parserError) {
    warnings.push(
      'Invalid XML: ' +
        (parserError.textContent?.slice(0, 100) ?? 'parse error')
    );
    return { parts, minifigs, warnings };
  }

  const items = doc.getElementsByTagName('ITEM');
  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    const itemType = getTagText(item, 'ITEMTYPE')?.toUpperCase();
    const itemId = getTagText(item, 'ITEMID');
    const colorStr = getTagText(item, 'COLOR') ?? '0';
    const qtyStr = getTagText(item, 'QTY') ?? '1';

    if (!itemId) {
      warnings.push(`Item ${i + 1}: missing ITEMID`);
      continue;
    }

    const quantity = parseInt(qtyStr, 10) || 1;

    if (itemType === 'P') {
      const colorId = parseInt(colorStr, 10);
      if (isNaN(colorId)) {
        warnings.push(`Item ${i + 1}: invalid COLOR "${colorStr}"`);
        continue;
      }
      parts.push({ blPartId: itemId, blColorId: colorId, quantity });
    } else if (itemType === 'M') {
      minifigs.push({ blMinifigId: itemId, quantity });
    }
  }

  return { parts, minifigs, warnings };
}
