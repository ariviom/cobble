import { parseBrickPartyBackup } from '../brickPartyParser';

describe('parseBrickPartyBackup', () => {
  const validBackup = {
    version: 1,
    exportedAt: '2026-03-06T12:00:00.000Z',
    app: 'brick-party',
    data: {
      sets: [
        {
          setNumber: '75192-1',
          status: 'owned',
          hasInstructions: true,
          hasBox: false,
        },
      ],
      ownedParts: [
        { setNumber: '75192-1', inventoryKey: '3023:5', quantity: 12 },
      ],
      looseParts: [{ partNum: '3023', colorId: 5, quantity: 3 }],
      lists: [
        {
          id: 'abc',
          name: 'Star Wars',
          items: [{ itemType: 'set', itemId: '75192-1' }],
        },
      ],
      minifigs: [{ figNum: 'sw0001', status: 'owned' }],
    },
    preferences: {
      theme: 'blue',
      pricing: { currencyCode: 'USD', countryCode: 'US' },
      minifigSync: { syncOwnedFromSets: true, syncScope: 'collection' },
      inventoryDefaults: {},
    },
  };

  it('parses a valid backup', () => {
    const result = parseBrickPartyBackup(JSON.stringify(validBackup));
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.data.sets).toHaveLength(1);
    expect(result.data.data.looseParts).toHaveLength(1);
    expect(result.data.data.minifigs).toHaveLength(1);
  });

  it('rejects non-brick-party JSON', () => {
    const result = parseBrickPartyBackup(JSON.stringify({ app: 'other' }));
    expect(result.success).toBe(false);
  });

  it('rejects invalid JSON', () => {
    const result = parseBrickPartyBackup('not json');
    expect(result.success).toBe(false);
  });

  it('accepts backup with missing optional fields', () => {
    const minimal = {
      version: 1,
      app: 'brick-party',
      data: {
        sets: [],
        ownedParts: [],
        looseParts: [],
        lists: [],
        minifigs: [],
      },
    };
    const result = parseBrickPartyBackup(JSON.stringify(minimal));
    expect(result.success).toBe(true);
  });

  it('rejects unsupported version', () => {
    const future = { ...validBackup, version: 999 };
    const result = parseBrickPartyBackup(JSON.stringify(future));
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain('version');
  });
});
