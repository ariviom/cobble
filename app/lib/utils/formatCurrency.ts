export function formatCurrency(
  value: number,
  currency: string | null | undefined
): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currency ?? 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${currency ?? '$'}${value.toFixed(2)}`;
  }
}
