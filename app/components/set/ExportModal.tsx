'use client';

import { Button } from '@/app/components/ui/Button';
import { Modal } from '@/app/components/ui/Modal';
import { Select } from '@/app/components/ui/Select';
import { generateBrickLinkCsv } from '@/app/lib/export/bricklinkCsv';
import type { MissingRow } from '@/app/lib/export/rebrickableCsv';
import { generateRebrickableCsv } from '@/app/lib/export/rebrickableCsv';
import { useState } from 'react';

type Props = {
  open: boolean;
  onClose: () => void;
  setNumber: string;
  setName?: string;
  getMissingRows: () => MissingRow[];
};

export function ExportModal({
  open,
  onClose,
  setNumber,
  setName,
  getMissingRows,
}: Props) {
  const [target, setTarget] = useState<'rebrickable' | 'bricklink'>(
    'rebrickable'
  );
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

  function onExport() {
    setError(null);
    const missingRows = getMissingRows();
    if (target === 'rebrickable') {
      const csv = generateRebrickableCsv(missingRows);
      downloadCsv(`${setNumber}_missing_rebrickable.csv`, csv);
      onClose();
      return;
    }
    const wantedName = setName
      ? `${setNumber} — ${setName} — mvp`
      : `${setNumber} — mvp`;
    const { csv, unmapped } = generateBrickLinkCsv(missingRows, {
      wantedListName: wantedName,
      condition: 'U',
    });
    if (unmapped.length > 0) {
      setError(
        `${unmapped.length} rows could not be mapped to BrickLink colors and were skipped.`
      );
    }
    downloadCsv(`${setNumber}_missing_bricklink.csv`, csv);
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="Export Missing Parts">
      <div className="flex flex-col gap-3">
        <label className="text-sm">
          <span className="mr-2">Export to</span>
          <Select
            value={target}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
              setTarget(e.target.value as 'rebrickable' | 'bricklink')
            }
          >
            <option value="rebrickable">Rebrickable (CSV)</option>
            <option value="bricklink">BrickLink (Wanted List CSV)</option>
          </Select>
        </label>
        {error && <div className="text-xs text-red-600">{error}</div>}
        <div className="mt-2 flex items-center justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={onExport}>
            Export
          </Button>
        </div>
      </div>
    </Modal>
  );
}
