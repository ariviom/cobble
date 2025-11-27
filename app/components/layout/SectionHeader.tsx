import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/app/components/ui/utils';

export type SectionHeaderProps = {
  title: string;
  description?: string;
  eyebrow?: string;
  actions?: ReactNode;
  className?: string;
  align?: 'left' | 'center';
} & Omit<HTMLAttributes<HTMLDivElement>, 'title'>;

export function SectionHeader({
  title,
  description,
  eyebrow,
  actions,
  className,
  align = 'left',
  ...rest
}: SectionHeaderProps) {
  const isCentered = align === 'center';

  return (
    <div
      className={cn(
        'flex flex-col gap-2',
        isCentered ? 'items-center text-center' : 'items-start',
        className
      )}
      {...rest}
    >
      <div className="flex w-full items-start justify-between gap-3">
        <div className={cn('space-y-1', isCentered && 'w-full')}>
          {eyebrow ? (
            <p className="text-[11px] font-semibold tracking-wide text-foreground-muted uppercase">
              {eyebrow}
            </p>
          ) : null}
          <h2 className="text-sm font-medium text-foreground">{title}</h2>
          {description ? (
            <p className="text-xs text-foreground-muted">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
    </div>
  );
}


