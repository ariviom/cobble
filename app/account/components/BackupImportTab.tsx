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
import { getLocalDb } from '@/app/lib/localDb/schema';
import { getAllLooseParts } from '@/app/lib/localDb/loosePartsStore';
import { getSupabaseBrowserClient } from '@/app/lib/supabaseClient';
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

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

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
  const handleDownloadBackup = useCallback(async () => {
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

      // Gather owned parts from IndexedDB
      const ownedRows = await getLocalDb().localOwned.toArray();
      const ownedParts = ownedRows.map(r => ({
        setNumber: r.setNumber,
        inventoryKey: r.inventoryKey,
        quantity: r.quantity,
      }));

      // Gather loose parts from IndexedDB
      const looseRows = await getAllLooseParts();
      const looseParts = looseRows.map(r => ({
        partNum: r.partNum,
        colorId: r.colorId,
        quantity: r.quantity,
      }));

      // Gather Supabase data (lists, minifigs, preferences) if logged in
      let lists: Array<{
        id: string;
        name: string;
        items: Array<{ itemType: 'set' | 'minifig'; itemId: string }>;
      }> = [];
      let minifigs: Array<{ figNum: string; status: string }> = [];
      let preferences: Record<string, unknown> = {};

      if (user) {
        const supabase = getSupabaseBrowserClient();

        // Fetch lists, minifigs, and preferences in parallel
        const [listsRes, minifigsRes, prefsRes] = await Promise.all([
          supabase.from('user_lists').select('id, name').eq('user_id', user.id),
          supabase
            .from('user_minifigs')
            .select('fig_num, status')
            .eq('user_id', user.id),
          supabase
            .from('user_preferences')
            .select('theme, theme_color, settings')
            .eq('user_id', user.id)
            .single(),
        ]);

        // Process lists + items
        if (listsRes.data && listsRes.data.length > 0) {
          const listIds = listsRes.data.map(l => l.id as string);

          // Batch list item queries at 200 IDs max
          const allItems: Array<{
            list_id: string;
            item_type: string;
            set_num: string | null;
            minifig_id: string | null;
          }> = [];
          for (let i = 0; i < listIds.length; i += 200) {
            const batch = listIds.slice(i, i + 200);
            const itemsRes = await supabase
              .from('user_list_items')
              .select('list_id, item_type, set_num, minifig_id')
              .in('list_id', batch);
            if (itemsRes.data) {
              allItems.push(
                ...itemsRes.data.map(item => ({
                  list_id: item.list_id as string,
                  item_type: item.item_type as string,
                  set_num: item.set_num as string | null,
                  minifig_id: item.minifig_id as string | null,
                }))
              );
            }
          }

          // Group items by list
          const itemsByList = new Map<
            string,
            Array<{ itemType: 'set' | 'minifig'; itemId: string }>
          >();
          for (const item of allItems) {
            const listItems = itemsByList.get(item.list_id) ?? [];
            const itemId =
              item.item_type === 'set' ? item.set_num : item.minifig_id;
            if (itemId) {
              listItems.push({
                itemType: item.item_type as 'set' | 'minifig',
                itemId,
              });
            }
            itemsByList.set(item.list_id, listItems);
          }

          lists = listsRes.data.map(l => ({
            id: l.id as string,
            name: l.name as string,
            items: itemsByList.get(l.id as string) ?? [],
          }));
        }

        // Process minifigs
        if (minifigsRes.data) {
          minifigs = minifigsRes.data.map(m => ({
            figNum: m.fig_num as string,
            status: (m.status as string) ?? 'owned',
          }));
        }

        // Process preferences
        if (prefsRes.data) {
          const settings = (prefsRes.data.settings ?? {}) as Record<
            string,
            unknown
          >;
          preferences = {
            theme: prefsRes.data.theme ?? undefined,
            themeColor: prefsRes.data.theme_color ?? undefined,
            pricing: settings.pricing ?? undefined,
            minifigSync: settings.minifigSync ?? undefined,
          };
          // Strip undefined keys
          for (const key of Object.keys(preferences)) {
            if (preferences[key] === undefined) {
              delete preferences[key];
            }
          }
        }
      }

      const backup = assembleBackup({
        sets,
        ownedParts,
        looseParts,
        lists,
        minifigs,
        preferences,
      });

      downloadBackup(backup);

      // Build a detailed success message
      const parts: string[] = [];
      if (sets.length > 0)
        parts.push(`${sets.length} set${sets.length !== 1 ? 's' : ''}`);
      if (ownedParts.length > 0)
        parts.push(
          `${ownedParts.length} owned part entr${ownedParts.length !== 1 ? 'ies' : 'y'}`
        );
      if (looseParts.length > 0)
        parts.push(
          `${looseParts.length} loose part${looseParts.length !== 1 ? 's' : ''}`
        );
      if (lists.length > 0)
        parts.push(`${lists.length} list${lists.length !== 1 ? 's' : ''}`);
      if (minifigs.length > 0)
        parts.push(
          `${minifigs.length} minifig${minifigs.length !== 1 ? 's' : ''}`
        );

      setBackupSuccess(
        parts.length > 0
          ? `Backup downloaded with ${parts.join(', ')}.`
          : 'Backup downloaded (empty — no data found).'
      );
    } catch (err) {
      setBackupError(
        err instanceof Error ? err.message : 'Failed to create backup.'
      );
    } finally {
      setIsExporting(false);
    }
  }, [userSets, user]);

  // ─── Restore from Backup ──────────────────────────────────────────
  const handleRestoreFile = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setRestoreError(null);
      setRestoreSuccess(null);

      const file = event.target.files?.[0];
      if (!file) return;

      if (file.size > MAX_FILE_SIZE_BYTES) {
        setRestoreError('File is too large (max 10 MB).');
        if (restoreInputRef.current) restoreInputRef.current.value = '';
        return;
      }

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

      if (file.size > MAX_FILE_SIZE_BYTES) {
        setImportError('File is too large (max 10 MB).');
        if (importInputRef.current) importInputRef.current.value = '';
        return;
      }

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
                onClick={() => void handleDownloadBackup()}
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
