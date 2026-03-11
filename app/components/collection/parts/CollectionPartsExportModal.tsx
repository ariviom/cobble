'use client';

import { Button } from '@/app/components/ui/Button';
import { Modal } from '@/app/components/ui/Modal';
import { Select } from '@/app/components/ui/Select';
import { generateBrickLinkCsv } from '@/app/lib/export/bricklinkCsv';
import { generatePickABrickCsv } from '@/app/lib/export/pickABrickCsv';
import type { MissingRow } from '@/app/lib/export/rebrickableCsv';
import { generateRebrickableCsv } from '@/app/lib/export/rebrickableCsv';
import { useState } from 'react';
import type { CollectionPart, PartSelection } from './types';

function selectionsToExportRows(
  selections: Map<string, PartSelection>,
  partsLookup: Map<string, CollectionPart>
): MissingRow[] {
  const rows: MissingRow[] = [];
  for (const sel of selections.values()) {
    const part = partsLookup.get(sel.canonicalKey);
    if (!part) continue;
    rows.push({
      setNumber: sel.setNumber ?? '',
      partId: part.partNum,
      colorId: part.colorId,
      quantityMissing: sel.quantity,
      elementId: part.elementId,
    });
  }
  return rows;
}

type Props = {
  open: boolean;
  onClose: () => void;
  selections: Map<string, PartSelection>;
  partsLookup: Map<string, CollectionPart>;
};

export function CollectionPartsExportModal({
  open,
  onClose,
  selections,
  partsLookup,
}: Props) {
  const [target, setTarget] = useState<
    'rebrickable' | 'bricklink' | 'pickABrick'
  >('rebrickable');
  const [error, setError] = useState<string | null>(null);

  const totalParts = selections.size;
  const totalPieces = Array.from(selections.values()).reduce(
    (sum, sel) => sum + sel.quantity,
    0
  );

  const partsWithElementId = Array.from(selections.values()).filter(sel => {
    const part = partsLookup.get(sel.canonicalKey);
    return !!part?.elementId;
  }).length;
  const missingElementId = totalParts - partsWithElementId;

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
    const rows = selectionsToExportRows(selections, partsLookup);

    if (target === 'rebrickable') {
      const csv = generateRebrickableCsv(rows);
      downloadCsv('collection_parts_rebrickable.csv', csv);
      onClose();
      return;
    }

    if (target === 'pickABrick') {
      const { csv, unmapped } = generatePickABrickCsv(rows);
      downloadCsv('collection_parts_pick_a_brick.csv', csv);
      if (unmapped.length > 0) {
        setError(
          `${unmapped.length} part${unmapped.length !== 1 ? 's' : ''} ${unmapped.length !== 1 ? 'are' : 'is'} missing LEGO Element IDs and ${unmapped.length !== 1 ? 'were' : 'was'} skipped from the Pick-a-Brick export.`
        );
        return;
      }
      onClose();
      return;
    }

    const { csv, unmapped } = generateBrickLinkCsv(rows, {
      wantedListName: 'My Collection',
      condition: 'U',
    });
    downloadCsv('collection_parts_bricklink.csv', csv);

    if (unmapped.length > 0) {
      setError(
        `${unmapped.length} part${unmapped.length !== 1 ? 's' : ''} could not be mapped to BrickLink IDs and ${unmapped.length !== 1 ? 'were' : 'was'} skipped.`
      );
      return;
    }
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="Export parts list">
      <div className="flex flex-col gap-3">
        <p className="text-sm text-foreground-muted">
          Exporting {totalParts.toLocaleString()} part
          {totalParts !== 1 ? 's' : ''} ({totalPieces.toLocaleString()} total
          piece{totalPieces !== 1 ? 's' : ''})
        </p>

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
              {missingElementId > 0 && (
                <span className="ml-1 text-amber-600">
                  {partsWithElementId} of {totalParts} selected part
                  {totalParts !== 1 ? 's' : ''} have element IDs for
                  Pick-a-Brick.
                </span>
              )}
            </>
          )}
        </div>

        {error && (
          <div className="text-xs font-medium text-danger">{error}</div>
        )}

        <div className="mt-2 flex justify-end gap-2">
          <Button onClick={onClose} variant="ghost">
            Cancel
          </Button>
          <Button
            onClick={onExport}
            variant="primary"
            disabled={totalParts === 0}
            title={totalParts === 0 ? 'No parts selected' : undefined}
          >
            Export
          </Button>
        </div>
      </div>
    </Modal>
  );
}
