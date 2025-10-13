import { cx } from '@/app/components/ui/utils';
import type { PropsWithChildren } from 'react';

type Props = PropsWithChildren<{
  className?: string;
  position?: 'sticky' | 'fixed';
}>;

export function TopNav({ children, className, position = 'sticky' }: Props) {
  return (
    <div
      className={cx(
        position === 'fixed' ? 'fixed' : 'sticky',
        'top-0 z-30 w-full bg-white',
        'flex items-center justify-between',
        'gap-0',
        'py-0'
      )}
    >
      <div
        className={cx('flex w-full items-center justify-between', className)}
      >
        {children}
      </div>
    </div>
  );
}
