export type BrickScanPart = {
  blPartId: string;
  blColorId: number;
  quantity: number;
};

export type BrickScanMinifig = {
  blMinifigId: string;
  quantity: number;
};

export type BrickScanParseResult = {
  parts: BrickScanPart[];
  minifigs: BrickScanMinifig[];
  warnings: string[];
};

function parseCsvRow(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i]!;
    if (inQuotes) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      fields.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields;
}

export function parseBrickScanCsv(content: string): BrickScanParseResult {
  const parts: BrickScanPart[] = [];
  const minifigs: BrickScanMinifig[] = [];
  const warnings: string[] = [];

  const lines = content.trim().split('\n');
  if (lines.length < 2) return { parts, minifigs, warnings };

  const headers = parseCsvRow(lines[0]!).map(h => h.trim().toUpperCase());
  const col = (name: string) => headers.indexOf(name);

  const iType = col('ITEMTYPE');
  const iId = col('ITEMID');
  const iColor = col('COLOR');
  const iQty = col('QTY');

  if (iType === -1 || iId === -1) {
    warnings.push('Missing required headers: ITEMTYPE, ITEMID');
    return { parts, minifigs, warnings };
  }

  const partMap = new Map<string, BrickScanPart>();
  const minifigMap = new Map<string, BrickScanMinifig>();

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (!line) continue;

    const fields = parseCsvRow(line);
    const itemType = fields[iType]?.trim().toUpperCase();
    const itemId = fields[iId]?.trim();
    const colorStr = iColor !== -1 ? fields[iColor]?.trim() : '0';
    const qtyStr = iQty !== -1 ? fields[iQty]?.trim() : '1';

    if (!itemId) {
      warnings.push(`Row ${i + 1}: missing item ID`);
      continue;
    }

    const quantity = parseInt(qtyStr ?? '1', 10) || 1;

    if (itemType === 'P') {
      const colorId = parseInt(colorStr ?? '0', 10);
      if (isNaN(colorId)) {
        warnings.push(`Row ${i + 1}: invalid color ID "${colorStr}"`);
        continue;
      }
      const key = `${itemId}:${colorId}`;
      const existing = partMap.get(key);
      if (existing) {
        existing.quantity += quantity;
      } else {
        partMap.set(key, { blPartId: itemId, blColorId: colorId, quantity });
      }
    } else if (itemType === 'M') {
      const existing = minifigMap.get(itemId);
      if (existing) {
        existing.quantity += quantity;
      } else {
        minifigMap.set(itemId, { blMinifigId: itemId, quantity });
      }
    }
  }

  return {
    parts: [...partMap.values()],
    minifigs: [...minifigMap.values()],
    warnings,
  };
}
