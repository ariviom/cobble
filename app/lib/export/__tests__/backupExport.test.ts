import { assembleBackup, type BackupSources } from '../backupExport';

describe('assembleBackup', () => {
  const sources: BackupSources = {
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
        name: 'Favs',
        items: [{ itemType: 'set' as const, itemId: '75192-1' }],
      },
    ],
    minifigs: [{ figNum: 'sw0001', status: 'owned' }],
    preferences: { theme: 'blue' },
  };

  it('assembles a valid backup with version and app fields', () => {
    const backup = assembleBackup(sources);
    expect(backup.version).toBe(1);
    expect(backup.app).toBe('brick-party');
    expect(backup.exportedAt).toBeDefined();
    expect(backup.data.sets).toEqual(sources.sets);
    expect(backup.data.looseParts).toEqual(sources.looseParts);
  });

  it('round-trips through JSON serialization', () => {
    const backup = assembleBackup(sources);
    const json = JSON.stringify(backup);
    const parsed = JSON.parse(json);
    expect(parsed.data.sets).toEqual(sources.sets);
    expect(parsed.data.looseParts).toEqual(sources.looseParts);
  });

  it('handles empty sources', () => {
    const backup = assembleBackup({
      sets: [],
      ownedParts: [],
      looseParts: [],
      lists: [],
      minifigs: [],
      preferences: {},
    });
    expect(backup.data.sets).toHaveLength(0);
  });
});
