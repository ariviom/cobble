import { parseRebrickableSetList } from '../rebrickableSetParser';

describe('parseRebrickableSetList', () => {
  it('parses set numbers and quantities', () => {
    const csv = 'Set Number,Quantity\n75192-1,1\n10294-1,2';
    const result = parseRebrickableSetList(csv);
    expect(result.sets).toEqual([
      { setNumber: '75192-1', quantity: 1 },
      { setNumber: '10294-1', quantity: 2 },
    ]);
  });

  it('handles reversed column order', () => {
    const csv = 'Quantity,Set Number\n1,75192-1';
    const result = parseRebrickableSetList(csv);
    expect(result.sets[0]).toEqual({ setNumber: '75192-1', quantity: 1 });
  });

  it('defaults quantity to 1 if column missing', () => {
    const csv = 'Set Number\n75192-1';
    const result = parseRebrickableSetList(csv);
    expect(result.sets[0]!.quantity).toBe(1);
  });

  it('skips rows with empty set number', () => {
    const csv = 'Set Number,Quantity\n,1\n75192-1,1';
    const result = parseRebrickableSetList(csv);
    expect(result.sets).toHaveLength(1);
  });

  it('warns on missing Set Number header', () => {
    const csv = 'Name,Count\nFoo,1';
    const result = parseRebrickableSetList(csv);
    expect(result.sets).toHaveLength(0);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('returns empty for empty input', () => {
    const result = parseRebrickableSetList('');
    expect(result.sets).toHaveLength(0);
  });
});
