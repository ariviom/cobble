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
                className="border-b border-foreground-accent"
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
          <div className="flex w-full justify-center border-t-2 border-subtle">
            <button
              type="button"
              className="h-full w-full cursor-pointer py-3.5 font-semibold text-foreground-muted transition-colors hover:bg-theme-primary/10 hover:text-foreground"
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
