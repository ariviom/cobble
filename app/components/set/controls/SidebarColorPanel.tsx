'use client';

import { ClearAllButton } from '@/app/components/ui/ClearAllButton';
import { DropdownSection } from '@/app/components/ui/GroupedDropdown';
import { RowButton } from '@/app/components/ui/RowButton';
import { RowCheckbox } from '@/app/components/ui/RowCheckbox';
import { formatColorLabel } from '../utils/format';

type Props = {
  colorOptions: string[];
  /** Colors that have matching pieces after display/category filters (for disabling unavailable options) */
  availableColors: Set<string>;
  selectedColors: string[];
  onToggleColor: (color: string) => void;
  onClear: () => void;
};

export function SidebarColorPanel({
  colorOptions,
  availableColors,
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
            const isAvailable = availableColors.has(c);
            const isMuted = !isAvailable && !selected;
            return (
              <RowButton
                key={c}
                selected={selected}
                onClick={() => onToggleColor(c)}
                className="border-b border-foreground-accent"
                muted={isMuted}
              >
                <RowCheckbox checked={selected} muted={isMuted} />
                <span className={isMuted ? 'opacity-40' : ''}>
                  {formatColorLabel(c)}
                </span>
              </RowButton>
            );
          })}
        </div>
      </DropdownSection>
      {(selectedColors?.length || 0) > 0 && (
        <DropdownSection label="">
          <ClearAllButton className="border-t-2" onClick={onClear} />
        </DropdownSection>
      )}
    </>
  );
}
