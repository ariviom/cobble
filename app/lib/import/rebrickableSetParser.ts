export type RebrickableSet = {
  setNumber: string;
  quantity: number;
};

export type RebrickableSetParseResult = {
  sets: RebrickableSet[];
  warnings: string[];
};

export function parseRebrickableSetList(
  content: string
): RebrickableSetParseResult {
  const sets: RebrickableSet[] = [];
  const warnings: string[] = [];

  const lines = content.trim().split('\n');
  if (lines.length < 2) return { sets, warnings };

  const headers = lines[0]!.split(',').map(h => h.trim().toLowerCase());
  const setNumCol = headers.findIndex(
    h => h === 'set number' || h === 'setnumber' || h === 'set_number'
  );
  const qtyCol = headers.findIndex(h => h === 'quantity' || h === 'qty');

  if (setNumCol === -1) {
    warnings.push('Missing required header: Set Number');
    return { sets, warnings };
  }

  for (let i = 1; i < lines.length; i++) {
    const fields = lines[i]!.split(',').map(f => f.trim());
    const setNumber = fields[setNumCol]?.trim();
    if (!setNumber) continue;

    const quantity =
      qtyCol !== -1 ? parseInt(fields[qtyCol] ?? '1', 10) || 1 : 1;
    sets.push({ setNumber, quantity });
  }

  return { sets, warnings };
}
