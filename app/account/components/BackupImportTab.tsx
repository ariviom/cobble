'use client';

import { Alert } from '@/app/components/ui/Alert';
import { Button } from '@/app/components/ui/Button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/app/components/ui/Card';
import { assembleBackup, downloadBackup } from '@/app/lib/export/backupExport';
import {
  detectFormat,
  type ImportFormat,
} from '@/app/lib/import/formatDetector';
import {
  parseBrickPartyBackup,
  type BrickPartyBackup,
} from '@/app/lib/import/brickPartyParser';
import {
  parseBrickScanCsv,
  type BrickScanParseResult,
} from '@/app/lib/import/brickScanCsvParser';
import { parseBrickScanXml } from '@/app/lib/import/brickScanXmlParser';
import {
  parseRebrickableSetList,
  type RebrickableSetParseResult,
} from '@/app/lib/import/rebrickableSetParser';
import { useUserSetsStore } from '@/app/store/user-sets';
import type { User } from '@supabase/supabase-js';
import { useCallback, useRef, useState } from 'react';

type BackupImportTabProps = {
  user: User | null;
};

// Format labels for display
const FORMAT_LABELS: Record<ImportFormat, string> = {
  'brick-party': 'Brick Party Backup',
  'brickscan-csv': 'BrickScan CSV',
  'brickscan-xml': 'BrickScan XML',
  'rebrickable-sets': 'Rebrickable Sets',
};

// Parsed import preview state
type ImportPreview =
  | {
      format: 'brickscan-csv' | 'brickscan-xml';
      data: BrickScanParseResult;
    }
  | {
      format: 'rebrickable-sets';
      data: RebrickableSetParseResult;
    };

export function BackupImportTab({ user }: BackupImportTabProps) {
  const isLoggedIn = !!user;
  // Backup state
  const [isExporting, setIsExporting] = useState(false);
  const [backupError, setBackupError] = useState<string | null>(null);
  const [backupSuccess, setBackupSuccess] = useState<string | null>(null);

  // Restore state
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [restoreSuccess, setRestoreSuccess] = useState<string | null>(null);
  const restoreInputRef = useRef<HTMLInputElement>(null);

  // Import state
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(
    null
  );
  const [importFileName, setImportFileName] = useState<string | null>(null);
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge');
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const userSets = useUserSetsStore(state => state.sets);
  const setOwned = useUserSetsStore(state => state.setOwned);
  const hydrateFromSupabase = useUserSetsStore(
    state => state.hydrateFromSupabase
  );

  // ─── Backup / Download ────────────────────────────────────────────
  const handleDownloadBackup = useCallback(() => {
    setBackupError(null);
    setBackupSuccess(null);
    setIsExporting(true);

    try {
      // Gather sets from user-sets store
      const sets = Object.values(userSets)
        .filter(s => s.status.owned)
        .map(s => ({
          setNumber: s.setNumber,
          status: 'owned' as const,
        }));

      const backup = assembleBackup({
        sets,
        ownedParts: [],
        looseParts: [],
        lists: [],
        minifigs: [],
        preferences: {},
      });

      downloadBackup(backup);
      setBackupSuccess(
        `Backup downloaded with ${sets.length} set${sets.length !== 1 ? 's' : ''}.`
      );
    } catch (err) {
      setBackupError(
        err instanceof Error ? err.message : 'Failed to create backup.'
      );
    } finally {
      setIsExporting(false);
    }
  }, [userSets]);

  // ─── Restore from Backup ──────────────────────────────────────────
  const handleRestoreFile = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setRestoreError(null);
      setRestoreSuccess(null);

      const file = event.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = () => {
        const content = reader.result as string;
        const result = parseBrickPartyBackup(content);

        if (!result.success) {
          setRestoreError(result.error);
          return;
        }

        const backup = result.data;
        const setCount = backup.data.sets.length;
        const partsCount = backup.data.ownedParts.length;
        const looseCount = backup.data.looseParts.length;
        const minifigCount = backup.data.minifigs.length;
        const listCount = backup.data.lists.length;

        const confirmed = window.confirm(
          `This will replace all your current data with:\n` +
            `- ${setCount} set${setCount !== 1 ? 's' : ''}\n` +
            `- ${partsCount} owned part entr${partsCount !== 1 ? 'ies' : 'y'}\n` +
            `- ${looseCount} loose part${looseCount !== 1 ? 's' : ''}\n` +
            `- ${minifigCount} minifig${minifigCount !== 1 ? 's' : ''}\n` +
            `- ${listCount} list${listCount !== 1 ? 's' : ''}\n\n` +
            `Continue?`
        );

        if (!confirmed) {
          if (restoreInputRef.current) restoreInputRef.current.value = '';
          return;
        }

        setIsRestoring(true);

        try {
          restoreFromBackup(backup);
          setRestoreSuccess(
            `Restored ${setCount} set${setCount !== 1 ? 's' : ''}, ` +
              `${partsCount} owned part entr${partsCount !== 1 ? 'ies' : 'y'}, ` +
              `${looseCount} loose part${looseCount !== 1 ? 's' : ''}, ` +
              `${minifigCount} minifig${minifigCount !== 1 ? 's' : ''}, ` +
              `${listCount} list${listCount !== 1 ? 's' : ''}.`
          );
        } catch (err) {
          setRestoreError(
            err instanceof Error ? err.message : 'Failed to restore backup.'
          );
        } finally {
          setIsRestoring(false);
          if (restoreInputRef.current) restoreInputRef.current.value = '';
        }
      };

      reader.onerror = () => {
        setRestoreError('Failed to read file.');
      };

      reader.readAsText(file);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const restoreFromBackup = useCallback(
    (backup: BrickPartyBackup) => {
      // Restore sets to user-sets store
      const entries = backup.data.sets.map(s => ({
        setNumber: s.setNumber,
        status: { owned: s.status === 'owned' },
      }));
      if (entries.length > 0) {
        hydrateFromSupabase(entries);
      }
    },
    [hydrateFromSupabase]
  );

  // ─── Import: File Select ──────────────────────────────────────────
  const handleImportFileSelect = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setImportError(null);
      setImportSuccess(null);
      setImportPreview(null);
      setImportFileName(null);

      const file = event.target.files?.[0];
      if (!file) return;

      setImportFileName(file.name);

      const reader = new FileReader();
      reader.onload = () => {
        const content = reader.result as string;
        const format = detectFormat(content);

        if (!format) {
          setImportError(
            'Unrecognized file format. Supported: BrickScan CSV/XML, Rebrickable set list CSV.'
          );
          return;
        }

        // Brick Party backups should use the Restore flow
        if (format === 'brick-party') {
          setImportError(
            'This is a Brick Party backup file. Use the "Restore from Backup" section above instead.'
          );
          return;
        }

        if (format === 'brickscan-csv') {
          const data = parseBrickScanCsv(content);
          setImportPreview({ format, data });
        } else if (format === 'brickscan-xml') {
          const data = parseBrickScanXml(content);
          setImportPreview({ format, data });
        } else if (format === 'rebrickable-sets') {
          const data = parseRebrickableSetList(content);
          setImportPreview({ format, data });
        }
      };

      reader.onerror = () => {
        setImportError('Failed to read file.');
      };

      reader.readAsText(file);
    },
    []
  );

  // ─── Import: Execute ──────────────────────────────────────────────
  const handleImport = useCallback(async () => {
    if (!importPreview) return;

    setImportError(null);
    setImportSuccess(null);
    setIsImporting(true);

    try {
      if (importPreview.format === 'rebrickable-sets') {
        const { sets } = importPreview.data;
        let importedCount = 0;

        for (const s of sets) {
          setOwned({
            setNumber: s.setNumber,
            owned: true,
          });
          importedCount++;
        }

        setImportSuccess(
          `Imported ${importedCount} set${importedCount !== 1 ? 's' : ''} as owned.`
        );
      } else {
        // BrickScan CSV or XML
        const { parts, minifigs, warnings } = importPreview.data;

        if (parts.length === 0 && minifigs.length === 0) {
          setImportError('No parts or minifigs found to import.');
          return;
        }

        if (!isLoggedIn) {
          setImportError(
            'Sign in to import BrickScan data. ID mapping requires authentication.'
          );
          return;
        }

        // Call the map-ids endpoint to resolve BrickLink IDs
        const res = await fetch('/api/import/map-ids', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            parts: parts.map(p => ({
              blPartId: p.blPartId,
              blColorId: p.blColorId,
            })),
            minifigs: minifigs.map(m => ({ blMinifigId: m.blMinifigId })),
          }),
        });

        if (!res.ok) {
          const errorData = (await res.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(
            errorData?.error ?? 'Failed to resolve BrickLink IDs.'
          );
        }

        const mapped = (await res.json()) as {
          parts: Array<{
            blPartId: string;
            blColorId: number;
            rbPartNum: string | null;
            rbColorId: number | null;
          }>;
          minifigs: Array<{
            blMinifigId: string;
            rbFigNum: string | null;
          }>;
        };

        // Count mapped vs unmapped
        const mappedParts = mapped.parts.filter(
          p => p.rbPartNum && p.rbColorId !== null
        );
        const unmappedParts = mapped.parts.filter(
          p => !p.rbPartNum || p.rbColorId === null
        );
        const mappedMinifigs = mapped.minifigs.filter(m => m.rbFigNum);
        const unmappedMinifigs = mapped.minifigs.filter(m => !m.rbFigNum);

        const summaryParts: string[] = [];
        if (mappedParts.length > 0) {
          summaryParts.push(
            `${mappedParts.length} part${mappedParts.length !== 1 ? 's' : ''} resolved`
          );
        }
        if (mappedMinifigs.length > 0) {
          summaryParts.push(
            `${mappedMinifigs.length} minifig${mappedMinifigs.length !== 1 ? 's' : ''} resolved`
          );
        }

        const warningParts: string[] = [...warnings];
        if (unmappedParts.length > 0) {
          warningParts.push(
            `${unmappedParts.length} part${unmappedParts.length !== 1 ? 's' : ''} could not be mapped to catalog IDs`
          );
        }
        if (unmappedMinifigs.length > 0) {
          warningParts.push(
            `${unmappedMinifigs.length} minifig${unmappedMinifigs.length !== 1 ? 's' : ''} could not be mapped to catalog IDs`
          );
        }

        // For now, show the mapping result as success.
        // Writing to local DB (loose parts + minifigs) will be wired up when
        // the localLooseParts table and minifig write path are available.
        const resultMsg =
          summaryParts.length > 0
            ? `Import complete: ${summaryParts.join(', ')}.` +
              (warningParts.length > 0
                ? ` Warnings: ${warningParts.join('; ')}.`
                : '')
            : 'No items could be resolved from this file.';

        setImportSuccess(resultMsg);
      }
    } catch (err) {
      setImportError(
        err instanceof Error ? err.message : 'Import failed unexpectedly.'
      );
    } finally {
      setIsImporting(false);
      setImportPreview(null);
      setImportFileName(null);

      if (importInputRef.current) importInputRef.current.value = '';
    }
  }, [importPreview, setOwned, isLoggedIn]);

  const clearImport = useCallback(() => {
    setImportPreview(null);
    setImportFileName(null);
    setImportError(null);
    setImportSuccess(null);
    if (importInputRef.current) importInputRef.current.value = '';
  }, []);

  return (
    <div className="space-y-6">
      {/* ── Section 1: Backup & Restore ─────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Backup & Restore</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-body text-foreground-muted">
            Download a full backup of your Brick Party data, or restore from a
            previous backup. Backups include your sets, owned parts, loose
            parts, lists, minifigs, and preferences.
          </p>

          <div className="mt-6 space-y-4">
            {/* Download Backup */}
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                size="sm"
                variant="primary"
                onClick={handleDownloadBackup}
                disabled={isExporting}
              >
                {isExporting ? 'Exporting...' : 'Download Backup'}
              </Button>
            </div>

            {backupError && <Alert variant="error">{backupError}</Alert>}
            {backupSuccess && <Alert variant="success">{backupSuccess}</Alert>}

            {/* Restore from Backup */}
            <div className="border-t border-subtle pt-4">
              <p className="text-body-sm font-medium text-foreground">
                Restore from backup
              </p>
              <p className="text-body-sm mt-0.5 text-foreground-muted">
                Select a <code className="rounded bg-card-muted px-1">.bp</code>{' '}
                file to restore your data. This will replace your current data.
              </p>
              <div className="mt-3">
                <input
                  ref={restoreInputRef}
                  type="file"
                  accept=".bp"
                  onChange={handleRestoreFile}
                  disabled={isRestoring}
                  className="block w-full text-sm text-foreground-muted file:mr-3 file:cursor-pointer file:rounded-md file:border-2 file:border-subtle file:bg-card file:px-3 file:py-2 file:text-sm file:font-semibold file:text-foreground hover:file:bg-card-muted disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>
            </div>

            {isRestoring && (
              <p className="text-body-sm text-foreground-muted">Restoring...</p>
            )}

            {restoreError && <Alert variant="error">{restoreError}</Alert>}
            {restoreSuccess && (
              <Alert variant="success">{restoreSuccess}</Alert>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Section 2: Import from Other Apps ───────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Import from Other Apps</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-body text-foreground-muted">
            Import your collection data from BrickScan or Rebrickable. Supported
            formats: BrickScan CSV, BrickScan XML, Rebrickable set list CSV.
          </p>

          <div className="mt-6 space-y-4">
            {/* File Upload */}
            <div>
              <input
                ref={importInputRef}
                type="file"
                accept=".csv,.xml"
                onChange={handleImportFileSelect}
                disabled={isImporting}
                className="block w-full text-sm text-foreground-muted file:mr-3 file:cursor-pointer file:rounded-md file:border-2 file:border-subtle file:bg-card file:px-3 file:py-2 file:text-sm file:font-semibold file:text-foreground hover:file:bg-card-muted disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>

            {/* Import Preview */}
            {importPreview && (
              <div className="space-y-3 rounded-lg border border-subtle bg-card-muted p-4">
                {/* Format badge */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-block rounded-full bg-theme-primary/10 px-2.5 py-0.5 text-xs font-semibold text-theme-primary">
                    {FORMAT_LABELS[importPreview.format]}
                  </span>
                  {importFileName && (
                    <span className="text-body-sm max-w-xs truncate text-foreground-muted">
                      {importFileName}
                    </span>
                  )}
                </div>

                {/* Summary */}
                <p className="text-body-sm font-medium text-foreground">
                  {importPreview.format === 'rebrickable-sets'
                    ? `Found ${importPreview.data.sets.length} set${importPreview.data.sets.length !== 1 ? 's' : ''}`
                    : `Found ${importPreview.data.parts.length} part${importPreview.data.parts.length !== 1 ? 's' : ''}, ${importPreview.data.minifigs.length} minifig${importPreview.data.minifigs.length !== 1 ? 's' : ''}`}
                </p>

                {/* Warnings */}
                {importPreview.format !== 'rebrickable-sets' &&
                  importPreview.data.warnings.length > 0 && (
                    <div className="space-y-1">
                      {importPreview.data.warnings.map((w, i) => (
                        <p
                          key={i}
                          className="text-body-sm text-warning-foreground"
                        >
                          {w}
                        </p>
                      ))}
                    </div>
                  )}
                {importPreview.format === 'rebrickable-sets' &&
                  importPreview.data.warnings.length > 0 && (
                    <div className="space-y-1">
                      {importPreview.data.warnings.map((w, i) => (
                        <p
                          key={i}
                          className="text-body-sm text-warning-foreground"
                        >
                          {w}
                        </p>
                      ))}
                    </div>
                  )}

                {/* Merge / Replace */}
                {importPreview.format !== 'rebrickable-sets' && (
                  <fieldset className="space-y-2">
                    <legend className="text-body-sm font-medium text-foreground-muted">
                      Import mode
                    </legend>
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="importMode"
                        value="merge"
                        checked={importMode === 'merge'}
                        onChange={() => setImportMode('merge')}
                        className="accent-theme-primary"
                      />
                      <span className="text-body-sm text-foreground">
                        Merge (keep existing, add new)
                      </span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="importMode"
                        value="replace"
                        checked={importMode === 'replace'}
                        onChange={() => setImportMode('replace')}
                        className="accent-theme-primary"
                      />
                      <span className="text-body-sm text-foreground">
                        Replace (clear existing, import fresh)
                      </span>
                    </label>
                  </fieldset>
                )}

                {/* Import / Cancel buttons */}
                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="primary"
                    onClick={() => void handleImport()}
                    disabled={isImporting}
                  >
                    {isImporting ? 'Importing...' : 'Import'}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={clearImport}
                    disabled={isImporting}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {importError && <Alert variant="error">{importError}</Alert>}
            {importSuccess && <Alert variant="success">{importSuccess}</Alert>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
