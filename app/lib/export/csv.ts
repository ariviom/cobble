export function escapeCsvCell(value: unknown): string {
  const s = value == null ? '' : String(value);
  const needsEscape = /[",\n\r]/.test(s);
  if (!needsEscape) return s;
  return '"' + s.replace(/"/g, '""') + '"';
}

export function toCsv(
  headers: string[],
  rows: Array<Array<string | number | null | undefined>>,
  includeBom = false
): string {
  const headerLine = headers.map(escapeCsvCell).join(',');
  const body = rows.map(r => r.map(escapeCsvCell).join(',')).join('\n');
  const csv = body ? headerLine + '\n' + body : headerLine;
  return includeBom ? '\uFEFF' + csv : csv;
}
