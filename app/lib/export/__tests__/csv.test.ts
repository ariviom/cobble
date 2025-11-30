import { escapeCsvCell, toCsv } from '@/app/lib/export/csv';

describe('escapeCsvCell', () => {
  it('returns empty string for null', () => {
    expect(escapeCsvCell(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(escapeCsvCell(undefined)).toBe('');
  });

  it('converts numbers to strings', () => {
    expect(escapeCsvCell(123)).toBe('123');
    expect(escapeCsvCell(0)).toBe('0');
    expect(escapeCsvCell(-456)).toBe('-456');
  });

  it('returns plain string when no special characters', () => {
    expect(escapeCsvCell('simple')).toBe('simple');
    expect(escapeCsvCell('hello world')).toBe('hello world');
  });

  it('quotes strings containing commas', () => {
    expect(escapeCsvCell('hello, world')).toBe('"hello, world"');
  });

  it('quotes strings containing double quotes and escapes them', () => {
    expect(escapeCsvCell('say "hello"')).toBe('"say ""hello"""');
  });

  it('quotes strings containing newlines', () => {
    expect(escapeCsvCell('line1\nline2')).toBe('"line1\nline2"');
  });

  it('quotes strings containing carriage returns', () => {
    expect(escapeCsvCell('line1\rline2')).toBe('"line1\rline2"');
  });

  it('handles multiple special characters', () => {
    expect(escapeCsvCell('hello, "world"\nfoo')).toBe(
      '"hello, ""world""\nfoo"'
    );
  });
});

describe('toCsv', () => {
  it('creates CSV with headers only when no rows', () => {
    const result = toCsv(['a', 'b', 'c'], []);
    expect(result).toBe('a,b,c');
  });

  it('creates CSV with headers and rows', () => {
    const result = toCsv(['name', 'value'], [['foo', 1], ['bar', 2]]);
    expect(result).toBe('name,value\nfoo,1\nbar,2');
  });

  it('handles null and undefined values in rows', () => {
    const result = toCsv(['a', 'b'], [[null, undefined], ['x', 'y']]);
    expect(result).toBe('a,b\n,\nx,y');
  });

  it('escapes special characters in headers', () => {
    const result = toCsv(['name, with comma', 'value'], [['test', 1]]);
    expect(result).toBe('"name, with comma",value\ntest,1');
  });

  it('escapes special characters in row values', () => {
    const result = toCsv(['a', 'b'], [['hello, world', 'test']]);
    expect(result).toBe('a,b\n"hello, world",test');
  });

  it('includes BOM when requested', () => {
    const result = toCsv(['a'], [], true);
    expect(result.charCodeAt(0)).toBe(0xfeff);
    expect(result.slice(1)).toBe('a');
  });

  it('does not include BOM by default', () => {
    const result = toCsv(['a'], []);
    expect(result.charCodeAt(0)).toBe('a'.charCodeAt(0));
  });

  it('handles mixed types in rows', () => {
    const result = toCsv(['a', 'b', 'c'], [['string', 123, null]]);
    expect(result).toBe('a,b,c\nstring,123,');
  });
});




