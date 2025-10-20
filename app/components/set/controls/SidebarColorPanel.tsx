'use client';

import { DropdownSection } from '@/app/components/ui/GroupedDropdown';
import { RowButton } from '@/app/components/ui/RowButton';
import { RowCheckbox } from '@/app/components/ui/RowCheckbox';
import { formatColorLabel } from '../utils/format';

type Props = {
  colorOptions: string[];
  selectedColors: string[];
  onToggleColor: (color: string) => void;
  onClear: () => void;
};

export function SidebarColorPanel({
  colorOptions,
  selectedColors,
  onToggleColor,
  onClear,
}: Props) {
  return (
    <>
      <DropdownSection>
        <div>
          {(colorOptions || []).map(c => {
            const selected = selectedColors.includes(c);
            return (
              <RowButton
                key={c}
                selected={selected}
                onClick={() => onToggleColor(c)}
                className="h-10 border-b border-foreground-accent"
              >
                <RowCheckbox checked={selected} />
                <span>{formatColorLabel(c)}</span>
              </RowButton>
            );
          })}
        </div>
      </DropdownSection>
      {(selectedColors?.length || 0) > 0 && (
        <DropdownSection label="">
          <div className="flex w-full justify-center border-b border-neutral-300 px-3 py-2">
            <button
              type="button"
              className="w-32 rounded border border-foreground-accent bg-neutral-00 px-2 py-1 text-xs hover:bg-neutral-100"
              onClick={onClear}
            >
              Clear All
            </button>
          </div>
        </DropdownSection>
      )}
    </>
  );
}
