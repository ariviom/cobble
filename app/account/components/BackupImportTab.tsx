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
import {
  getAllLooseParts,
  clearAllLooseParts,
  bulkUpsertLooseParts,
  bulkEnqueueLoosePartChanges,
} from '@/app/lib/localDb/loosePartsStore';
import { getSupabaseBrowserClient } from '@/app/lib/supabaseClient';
import { useUserSetsStore } from '@/app/store/user-sets';
import type { Json } from '@/supabase/types';
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
  const replaceAllSets = useUserSetsStore(state => state.replaceAllSets);

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

      let ownedParts: Array<{
        setNumber: string;
        inventoryKey: string;
        quantity: number;
        isSpare?: boolean;
      }> = [];
      let looseParts: Array<{
        partNum: string;
        colorId: number;
        quantity: number;
      }> = [];
      let lists: Array<{
        id: string;
        name: string;
        items: Array<{ itemType: 'set' | 'minifig'; itemId: string }>;
      }> = [];
      let minifigs: Array<{ figNum: string; status: string }> = [];
      let preferences: Record<string, unknown> = {};

      if (user) {
        const supabase = getSupabaseBrowserClient();

        // Fetch all data from Supabase in parallel
        const [ownedPartsRes, loosePartsRes, listsRes, minifigsRes, prefsRes] =
          await Promise.all([
            supabase
              .from('user_set_parts')
              .select('set_num, part_num, color_id, is_spare, owned_quantity')
              .eq('user_id', user.id)
              .gt('owned_quantity', 0),
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- loose_quantity types stale (C1)
            (supabase as any)
              .from('user_parts_inventory')
              .select('part_num, color_id, loose_quantity')
              .eq('user_id', user.id)
              .gt('loose_quantity', 0),
            supabase
              .from('user_lists')
              .select('id, name')
              .eq('user_id', user.id),
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

        // Process owned parts from Supabase
        if (ownedPartsRes.data) {
          ownedParts = ownedPartsRes.data.map(r => ({
            setNumber: r.set_num as string,
            inventoryKey: `${r.part_num}:${r.color_id}`,
            quantity: r.owned_quantity as number,
            ...(r.is_spare ? { isSpare: true } : {}),
          }));
        }

        // Process loose parts from Supabase
        // Note: loose_quantity column exists but types are stale until C1 regen
        if (loosePartsRes.data) {
          type LooseRow = {
            part_num: string;
            color_id: number;
            loose_quantity: number;
          };
          looseParts = (loosePartsRes.data as unknown as LooseRow[]).map(r => ({
            partNum: r.part_num,
            colorId: r.color_id,
            quantity: r.loose_quantity,
          }));
        }

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
              .eq('user_id', user.id)
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
      } else {
        // Anonymous: read from local IndexedDB
        const ownedRows = await getLocalDb().localOwned.toArray();
        ownedParts = ownedRows.map(r => ({
          setNumber: r.setNumber,
          inventoryKey: r.inventoryKey,
          quantity: r.quantity,
        }));

        const looseRows = await getAllLooseParts();
        looseParts = looseRows.map(r => ({
          partNum: r.partNum,
          colorId: r.colorId,
          quantity: r.quantity,
        }));
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
  const restoreFromBackup = useCallback(
    async (backup: BrickPartyBackup) => {
      // 1. Clear and restore sets (full replace, not merge)
      const setEntries = backup.data.sets.map(s => ({
        setNumber: s.setNumber,
        status: { owned: s.status === 'owned' },
      }));
      replaceAllSets(setEntries);

      // 2. Clear and restore owned parts
      const db = getLocalDb();
      await db.localOwned.clear();
      if (backup.data.ownedParts.length > 0) {
        const now = Date.now();
        const ownedEntries = backup.data.ownedParts.map(p => ({
          setNumber: p.setNumber,
          inventoryKey: p.inventoryKey,
          quantity: p.quantity,
          updatedAt: now,
        }));
        await db.transaction('rw', db.localOwned, async () => {
          await db.localOwned.bulkAdd(ownedEntries);
        });
      }

      // 3. Clear and restore loose parts
      await clearAllLooseParts();
      if (backup.data.looseParts.length > 0) {
        await bulkUpsertLooseParts(
          backup.data.looseParts.map(p => ({
            partNum: p.partNum,
            colorId: p.colorId,
            quantity: p.quantity,
          })),
          'replace'
        );
      }

      // 4. Restore all Supabase data (requires auth)
      if (user) {
        const supabase = getSupabaseBrowserClient();

        // Helper: throw on Supabase errors so partial restores surface clearly
        const checked = async <T,>(
          label: string,
          op: PromiseLike<{ error: { message: string } | null; data: T }>
        ): Promise<T> => {
          const { error, data } = await op;
          if (error)
            throw new Error(`Restore failed (${label}): ${error.message}`);
          return data;
        };

        // Restore sets to Supabase
        await checked(
          'clear sets',
          supabase.from('user_sets').delete().eq('user_id', user.id)
        );
        if (backup.data.sets.length > 0) {
          const setRows = backup.data.sets
            .filter(s => s.status === 'owned')
            .map(s => ({
              user_id: user.id,
              set_num: s.setNumber,
              owned: true,
            }));
          for (let i = 0; i < setRows.length; i += 200) {
            await checked(
              'insert sets',
              supabase.from('user_sets').insert(setRows.slice(i, i + 200))
            );
          }
        }

        // Restore owned parts to Supabase
        await checked(
          'clear owned parts',
          supabase.from('user_set_parts').delete().eq('user_id', user.id)
        );
        if (backup.data.ownedParts.length > 0) {
          const ownedRows = backup.data.ownedParts.map(p => {
            const lastColon = p.inventoryKey.lastIndexOf(':');
            const partNum = p.inventoryKey.slice(0, lastColon);
            const colorId = Number(p.inventoryKey.slice(lastColon + 1));
            return {
              user_id: user.id,
              set_num: p.setNumber,
              part_num: partNum,
              color_id: colorId,
              is_spare: p.isSpare ?? false,
              owned_quantity: p.quantity,
            };
          });
          for (let i = 0; i < ownedRows.length; i += 200) {
            await checked(
              'upsert owned parts',
              supabase
                .from('user_set_parts')
                .upsert(ownedRows.slice(i, i + 200), {
                  onConflict: 'user_id,set_num,part_num,color_id,is_spare',
                })
            );
          }
        }

        // Restore loose parts to Supabase
        await checked(
          'clear loose parts',
          supabase
            .from('user_parts_inventory')
            .update({
              loose_quantity: 0,
              updated_at: new Date().toISOString(),
            })
            .eq('user_id', user.id)
            .gt('loose_quantity', 0)
        );
        if (backup.data.looseParts.length > 0) {
          const looseRows = backup.data.looseParts.map(p => ({
            user_id: user.id,
            part_num: p.partNum,
            color_id: p.colorId,
            loose_quantity: p.quantity,
          }));
          for (let i = 0; i < looseRows.length; i += 200) {
            await checked(
              'upsert loose parts',
              supabase
                .from('user_parts_inventory')
                .upsert(looseRows.slice(i, i + 200), {
                  onConflict: 'user_id,part_num,color_id',
                })
            );
          }
        }

        // Restore lists: delete existing, then insert from backup
        await checked(
          'clear list items',
          supabase.from('user_list_items').delete().eq('user_id', user.id)
        );
        await checked(
          'clear lists',
          supabase.from('user_lists').delete().eq('user_id', user.id)
        );

        if (backup.data.lists.length > 0) {
          const listRows = backup.data.lists.map(l => ({
            id: l.id,
            user_id: user.id,
            name: l.name,
          }));
          await checked(
            'insert lists',
            supabase.from('user_lists').insert(listRows)
          );

          const itemRows = backup.data.lists.flatMap(l =>
            l.items.map(item => ({
              user_id: user.id,
              list_id: l.id,
              item_type: item.itemType,
              set_num: item.itemType === 'set' ? item.itemId : null,
              minifig_id: item.itemType === 'minifig' ? item.itemId : null,
            }))
          );
          if (itemRows.length > 0) {
            for (let i = 0; i < itemRows.length; i += 200) {
              await checked(
                'insert list items',
                supabase
                  .from('user_list_items')
                  .insert(itemRows.slice(i, i + 200))
              );
            }
          }
        }

        // Restore minifigs
        await checked(
          'clear minifigs',
          supabase.from('user_minifigs').delete().eq('user_id', user.id)
        );
        if (backup.data.minifigs.length > 0) {
          const minifigRows = backup.data.minifigs.map(m => ({
            user_id: user.id,
            fig_num: m.figNum,
            status: m.status as 'owned' | 'want',
          }));
          for (let i = 0; i < minifigRows.length; i += 200) {
            await checked(
              'insert minifigs',
              supabase
                .from('user_minifigs')
                .insert(minifigRows.slice(i, i + 200))
            );
          }
        }

        // Restore preferences
        if (backup.preferences) {
          const prefs = backup.preferences;
          const settingsPayload: Record<string, unknown> = {};
          if (prefs.pricing) settingsPayload.pricing = prefs.pricing;
          if (prefs.minifigSync)
            settingsPayload.minifigSync = prefs.minifigSync;

          const upsertData: {
            user_id: string;
            theme?: string | null;
            theme_color?: string | null;
            settings?: { [key: string]: Json | undefined };
          } = { user_id: user.id };
          if (prefs.theme) upsertData.theme = prefs.theme;
          if (prefs.themeColor) upsertData.theme_color = prefs.themeColor;
          if (Object.keys(settingsPayload).length > 0) {
            upsertData.settings = settingsPayload as {
              [key: string]: Json | undefined;
            };
          }

          await checked(
            'upsert preferences',
            supabase
              .from('user_preferences')
              .upsert(upsertData, { onConflict: 'user_id' })
          );
        }
      }
    },
    [replaceAllSets, user]
  );

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
      reader.onload = async () => {
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
          await restoreFromBackup(backup);
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
    [restoreFromBackup]
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

        // Write mapped parts to IndexedDB loose parts
        if (mappedParts.length > 0) {
          const partsToWrite = mappedParts.map(p => {
            const original = parts.find(
              orig =>
                orig.blPartId === p.blPartId && orig.blColorId === p.blColorId
            );
            return {
              partNum: p.rbPartNum!,
              colorId: p.rbColorId!,
              quantity: original?.quantity ?? 1,
            };
          });

          if (importMode === 'replace') {
            await clearAllLooseParts();
          }

          await bulkUpsertLooseParts(partsToWrite, importMode);

          // Enqueue sync for all parts in one transaction
          await bulkEnqueueLoosePartChanges(
            user!.id,
            crypto.randomUUID(),
            partsToWrite
          );
        }

        // Write mapped minifigs to Supabase
        if (mappedMinifigs.length > 0) {
          const supabase = getSupabaseBrowserClient();

          if (importMode === 'replace') {
            await supabase
              .from('user_minifigs')
              .delete()
              .eq('user_id', user!.id);
          }

          const minifigRows = mappedMinifigs.map(m => ({
            user_id: user!.id,
            fig_num: m.rbFigNum!,
            status: 'owned' as const,
          }));

          for (let i = 0; i < minifigRows.length; i += 200) {
            await supabase
              .from('user_minifigs')
              .upsert(minifigRows.slice(i, i + 200), {
                onConflict: 'user_id,fig_num',
              });
          }
        }

        // Build result message
        const summaryParts: string[] = [];
        if (mappedParts.length > 0) {
          summaryParts.push(
            `${mappedParts.length} part${mappedParts.length !== 1 ? 's' : ''} imported`
          );
        }
        if (mappedMinifigs.length > 0) {
          summaryParts.push(
            `${mappedMinifigs.length} minifig${mappedMinifigs.length !== 1 ? 's' : ''} imported`
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
  }, [importPreview, setOwned, isLoggedIn, importMode, user]);

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
          {isLoggedIn && (
            <p className="text-body-sm mt-2 text-foreground-muted">
              Your collection syncs automatically between devices. Backups are
              useful for safekeeping or transferring to another account.
            </p>
          )}

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
                {importPreview.data.warnings.length > 0 && (
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
