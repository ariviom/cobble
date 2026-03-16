'use client';

import { cn } from '@/app/components/ui/utils';
import type { ColorGroup } from './colorGroups';

type ColorEntry = {
  colorId: number;
  colorName: string;
  rgb?: string | null;
  imageUrl: string | null;
};

type Props = {
  colorGroups: ColorGroup[];
  allColors: ColorEntry[];
  selectedColorId: number;
  expandedGroup: string | null;
  onExpandGroup: (key: string | null) => void;
  onSelectColor: (colorId: number) => void;
};

function ColorSwatch({
  color,
  selected,
  onClick,
}: {
  color: ColorEntry;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'size-9 overflow-hidden rounded-full border-2 transition-colors',
        selected
          ? 'border-theme-primary ring-2 ring-theme-primary/30'
          : 'border-subtle hover:border-strong'
      )}
      title={color.colorName}
    >
      {color.imageUrl ? (
        <img
          src={color.imageUrl}
          alt={color.colorName}
          className="size-full object-cover"
        />
      ) : (
        <div
          className="size-full"
          style={{ backgroundColor: color.rgb ? `#${color.rgb}` : '#ccc' }}
        />
      )}
    </button>
  );
}

export function ColorPicker({
  colorGroups,
  allColors,
  selectedColorId,
  expandedGroup,
  onExpandGroup,
  onSelectColor,
}: Props) {
  const totalColors = allColors.length;

  // Single color — just show it directly
  if (totalColors <= 1) {
    return (
      <div className="flex flex-wrap gap-2">
        {allColors.map(c => (
          <ColorSwatch
            key={c.colorId}
            color={c}
            selected={c.colorId === selectedColorId}
            onClick={() => onSelectColor(c.colorId)}
          />
        ))}
      </div>
    );
  }

  // Single group — skip group toggles, show colors directly
  if (colorGroups.length === 1) {
    return (
      <div className="flex flex-wrap gap-2">
        {colorGroups[0]!.colors.map(c => (
          <ColorSwatch
            key={c.colorId}
            color={c}
            selected={c.colorId === selectedColorId}
            onClick={() => onSelectColor(c.colorId)}
          />
        ))}
      </div>
    );
  }

  // Multiple groups — show group toggles with expandable sub-selections
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {colorGroups.map(g => {
          const isExpanded = expandedGroup === g.key;
          const hasSelected = g.colors.some(c => c.colorId === selectedColorId);
          return (
            <button
              key={g.key}
              type="button"
              onClick={() => {
                if (isExpanded) {
                  onExpandGroup(null);
                } else {
                  onExpandGroup(g.key);
                  if (g.colors.length === 1) {
                    onSelectColor(g.colors[0]!.colorId);
                  }
                }
              }}
              className={cn(
                'relative flex size-9 items-center justify-center overflow-hidden rounded-full border-2 transition-colors',
                isExpanded
                  ? 'border-theme-primary ring-2 ring-theme-primary/30'
                  : hasSelected
                    ? 'border-strong'
                    : 'border-subtle hover:border-strong'
              )}
              title={`${g.label} (${g.colors.length})`}
            >
              <span
                className="absolute inset-0"
                style={{ backgroundColor: `#${g.swatch}` }}
              />
              <span
                className={cn(
                  'relative text-2xs font-bold',
                  g.swatch === 'FFFFFF' || g.swatch === 'F2CD37'
                    ? 'text-neutral-500'
                    : 'text-white'
                )}
              >
                {g.colors.length}
              </span>
            </button>
          );
        })}
      </div>
      {expandedGroup && (
        <>
          <div className="my-2.5 border-t border-subtle" />
          <div className="flex flex-wrap gap-2">
            {colorGroups
              .find(g => g.key === expandedGroup)
              ?.colors.map(c => (
                <ColorSwatch
                  key={c.colorId}
                  color={c}
                  selected={c.colorId === selectedColorId}
                  onClick={() => onSelectColor(c.colorId)}
                />
              ))}
          </div>
        </>
      )}
    </>
  );
}
