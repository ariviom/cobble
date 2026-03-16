/**
 * Normalize a set number for use as a lookup key.
 * Trims whitespace and lowercases for case-insensitive comparison.
 */
export function normalizeSetKey(setNumber: string): string {
  return setNumber.trim().toLowerCase();
}
