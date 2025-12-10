import type { SimpleSet } from '@/app/lib/rebrickable';
import type { MatchType } from '@/app/types/search';

function normalizeExactText(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function matchesExactSetNumber(setNumber: string, rawQuery: string): boolean {
  const normalizedSet = setNumber.trim().toLowerCase();
  const normalizedQuery = rawQuery.trim().toLowerCase();
  if (!normalizedQuery) return false;
  if (normalizedSet === normalizedQuery) return true;
  if (
    normalizedSet.startsWith(`${normalizedQuery}-`) &&
    /^-\d+$/.test(normalizedSet.slice(normalizedQuery.length))
  ) {
    return true;
  }
  return false;
}

function matchesExactSetName(name: string, normalizedQuery: string): boolean {
  if (!normalizedQuery) return false;
  return normalizeExactText(name) === normalizedQuery;
}

function extractThemeSegments(themePath?: string | null): string[] {
  if (!themePath) return [];
  return themePath
    .split('/')
    .map(segment => normalizeExactText(segment.trim()))
    .filter(Boolean);
}

function matchesExactTheme(
  item: SimpleSet,
  normalizedQuery: string,
  matchType: MatchType
): boolean {
  const segments = extractThemeSegments(item.themePath ?? item.themeName ?? '');
  if (segments.length === 0 || !normalizedQuery) {
    return false;
  }
  if (matchType === 'theme') {
    return segments[0] === normalizedQuery;
  }
  if (matchType === 'subtheme') {
    return segments[segments.length - 1] === normalizedQuery;
  }
  return false;
}

function matchesExactItem(
  item: SimpleSet,
  rawQuery: string,
  normalizedQuery: string
): boolean {
  const matchType: MatchType = item.matchType ?? 'theme';
  if (matchType === 'set') {
    return (
      matchesExactSetNumber(item.setNumber, rawQuery) ||
      matchesExactSetName(item.name, normalizedQuery)
    );
  }
  return matchesExactTheme(item, normalizedQuery, matchType);
}

export function filterExactMatches(
  items: SimpleSet[],
  query: string
): SimpleSet[] {
  const rawQuery = query.trim().toLowerCase();
  const normalizedQuery = normalizeExactText(query);
  if (!rawQuery && !normalizedQuery) {
    return [];
  }
  return items.filter(item =>
    matchesExactItem(item, rawQuery, normalizedQuery)
  );
}
