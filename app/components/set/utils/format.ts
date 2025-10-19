export function formatColorLabel(name: string): string {
  // Normalize special cases
  if (name === '-' || name === '—') return 'Minifigures';
  return name;
}
