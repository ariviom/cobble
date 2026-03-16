const MAX_QUERY_LENGTH = 200;
const SPECIAL_CHARS = /[%_\\]/g;

export function sanitizeQuery(raw: string): string {
  const trimmed = raw.slice(0, MAX_QUERY_LENGTH).trim();
  return trimmed.replace(SPECIAL_CHARS, ch => `\\${ch}`);
}
