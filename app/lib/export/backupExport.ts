import type { BrickPartyBackup } from '@/app/lib/import/brickPartyParser';

export type BackupSources = {
  sets: BrickPartyBackup['data']['sets'];
  ownedParts: BrickPartyBackup['data']['ownedParts'];
  looseParts: BrickPartyBackup['data']['looseParts'];
  lists: BrickPartyBackup['data']['lists'];
  minifigs: BrickPartyBackup['data']['minifigs'];
  preferences: Record<string, unknown>;
};

export function assembleBackup(sources: BackupSources): BrickPartyBackup {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    app: 'brick-party',
    data: {
      sets: sources.sets,
      ownedParts: sources.ownedParts,
      looseParts: sources.looseParts,
      lists: sources.lists,
      minifigs: sources.minifigs,
    },
    preferences: sources.preferences as BrickPartyBackup['preferences'],
  };
}

export function downloadBackup(backup: BrickPartyBackup): void {
  const json = JSON.stringify(backup, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const date = new Date().toISOString().slice(0, 10);

  const a = document.createElement('a');
  a.href = url;
  a.download = `brick-party-${date}.bp`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
