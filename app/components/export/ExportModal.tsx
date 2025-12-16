'use client';

import { Button } from '@/app/components/ui/Button';
import { Checkbox } from '@/app/components/ui/Checkbox';
import { Modal } from '@/app/components/ui/Modal';
import { Select } from '@/app/components/ui/Select';
import { useAuth } from '@/app/components/providers/auth-provider';
import { generateBrickLinkCsv } from '@/app/lib/export/bricklinkCsv';
import type { MissingRow } from '@/app/lib/export/rebrickableCsv';
import { generateRebrickableCsv } from '@/app/lib/export/rebrickableCsv';
import { generatePickABrickCsv } from '@/app/lib/export/pickABrickCsv';
import { useState } from 'react';

type Props = {
  open: boolean;
  onClose: () => void;
  setNumber: string;
  setName?: string;
  getMissingRows: () => MissingRow[];
  getAllRows?: () => MissingRow[];
};

export function ExportModal({
  open,
  onClose,
  setNumber,
  setName,
  getMissingRows,
  getAllRows,
}: Props) {
  const { user, isLoading } = useAuth();
  const isAuthenticated = !!user && !isLoading;
  const [target, setTarget] = useState<
    'rebrickable' | 'bricklink' | 'pickABrick'
  >('rebrickable');
  const [missingOnly, setMissingOnly] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function downloadCsv(filename: string, csv: string) {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function onExport() {
    setError(null);
    const rows = missingOnly
      ? getMissingRows()
      : (getAllRows?.() ?? getMissingRows());

    const filenameSuffix = missingOnly ? 'missing' : 'all';

    if (target === 'rebrickable') {
      const csv = generateRebrickableCsv(rows);
      downloadCsv(`${setNumber}_${filenameSuffix}_rebrickable.csv`, csv);
      onClose();
      return;
    }
    if (target === 'pickABrick') {
      const { csv, unmapped } = generatePickABrickCsv(rows);
      downloadCsv(`${setNumber}_${filenameSuffix}_pick_a_brick.csv`, csv);
      if (unmapped.length > 0) {
        setError(
          `${unmapped.length} rows are missing LEGO Element IDs and were skipped from the Pick-a-Brick export.`
        );
        // Don't close - let user see the warning
        return;
      }
      onClose();
      return;
    }
    const wantedName = setName
      ? `${setNumber} — ${setName} — mvp`
      : `${setNumber} — mvp`;
    try {
      const { csv, unmapped } = await generateBrickLinkCsv(rows, {
        wantedListName: wantedName,
        condition: 'U',
      });
      downloadCsv(`${setNumber}_${filenameSuffix}_bricklink.csv`, csv);
      if (unmapped.length > 0) {
        setError(
          `${unmapped.length} rows could not be mapped to BrickLink colors and were skipped.`
        );
        // Don't close - let user see the warning
        return;
      }
      onClose();
    } catch (err) {
      setError('Failed to generate BrickLink export. Please try again.');
      console.error('BrickLink export error:', err);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Export parts list">
      <div className="flex flex-col gap-3">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={missingOnly}
            onChange={() => setMissingOnly(!missingOnly)}
          />
          Export missing pieces only
        </label>

        <label className="text-sm">Export target</label>
        <Select
          value={target}
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
            setTarget(
              e.target.value as 'rebrickable' | 'bricklink' | 'pickABrick'
            )
          }
        >
          <option value="rebrickable">Rebrickable CSV</option>
          <option value="bricklink">BrickLink Wanted List CSV</option>
          <option value="pickABrick">LEGO Pick-a-Brick CSV</option>
        </Select>

        <div className="text-xs text-foreground-muted">
          {target === 'rebrickable' && (
            <>
              Standard Rebrickable format. Works with any Rebrickable-compatible
              tool.
            </>
          )}
          {target === 'bricklink' && (
            <>
              BrickLink Wanted List format. Some parts may not map if BrickLink
              IDs are unavailable.
            </>
          )}
          {target === 'pickABrick' && (
            <>
              LEGO Pick-a-Brick format. Only parts with LEGO Element IDs are
              included.
            </>
          )}
        </div>

        {!isAuthenticated && (
          <div className="text-xs text-amber-600">
            Sign in to export your parts list.
          </div>
        )}
        {error && <div className="text-xs text-red-600">{error}</div>}
        <div className="mt-2 flex justify-end gap-2">
          <Button onClick={onClose} variant="ghost">
            Cancel
          </Button>
          <Button
            onClick={onExport}
            variant="primary"
            disabled={!isAuthenticated}
            title={!isAuthenticated ? 'Sign in to export' : undefined}
          >
            {isAuthenticated ? 'Export' : 'Sign in to Export'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
