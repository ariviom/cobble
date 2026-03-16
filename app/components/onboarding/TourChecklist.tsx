'use client';

import { TOUR_ITEMS, type TourItem } from './tourConfig';
import { useOnboarding } from '@/app/hooks/useOnboarding';

type Props = {
  onItemClick: (item: TourItem) => void;
  onDismiss: () => void;
  onCollapse: () => void;
};

function ChecklistItem({
  item,
  isComplete,
  onClick,
  indent = false,
}: {
  item: TourItem;
  isComplete: boolean;
  onClick: () => void;
  indent?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-start gap-3 rounded-md px-3 py-2 text-left transition-colors hover:bg-foreground/5 ${indent ? 'pl-9' : ''} ${isComplete ? 'opacity-60' : ''}`}
    >
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
        {isComplete ? (
          <svg
            className="h-5 w-5 text-green-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M5 13l4 4L19 7"
            />
          </svg>
        ) : (
          <span className="h-4 w-4 rounded-full border-2 border-foreground-muted" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <span
          className={`text-sm font-medium ${isComplete ? 'text-foreground-muted line-through' : 'text-foreground'}`}
        >
          {item.label}
        </span>
        <p className="text-xs text-foreground-muted">{item.subtext}</p>
      </div>
    </button>
  );
}

export function TourChecklist({ onItemClick, onDismiss, onCollapse }: Props) {
  const { isStepComplete, progress } = useOnboarding();
  const { completed, total } = progress();

  return (
    <div className="flex flex-col gap-1 p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-lg font-bold text-foreground">Tour Brick Party</h3>
        <button
          type="button"
          onClick={onCollapse}
          className="flex h-6 w-6 items-center justify-center rounded text-foreground-muted hover:text-foreground"
          aria-label="Minimize tour"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </button>
      </div>

      <div className="flex flex-col gap-0.5">
        {TOUR_ITEMS.map(item => (
          <div key={item.id}>
            <ChecklistItem
              item={item}
              isComplete={isStepComplete(item.id)}
              onClick={() => onItemClick(item)}
            />
            {item.subtasks?.map(sub => (
              <ChecklistItem
                key={sub.id}
                item={sub}
                isComplete={isStepComplete(sub.id)}
                onClick={() => onItemClick(item)}
                indent
              />
            ))}
          </div>
        ))}
      </div>

      {/* Progress bar */}
      <div className="mt-3 flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-foreground/10">
          <div
            className="h-full rounded-full bg-theme-primary transition-all duration-300"
            style={{ width: `${(completed / total) * 100}%` }}
          />
        </div>
        <span className="text-xs text-foreground-muted">
          {completed}/{total}
        </span>
      </div>

      {/* Dismiss link */}
      <button
        type="button"
        onClick={onDismiss}
        className="mt-2 self-start text-xs text-foreground-muted hover:text-foreground"
      >
        Skip tour
      </button>
    </div>
  );
}
