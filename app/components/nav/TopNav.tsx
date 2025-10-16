import { cx } from '@/app/components/ui/utils';
import type { PropsWithChildren } from 'react';

type Props = PropsWithChildren<{
  className?: string;
}>;

export function TopNav({ children, className }: Props) {
  return (
    <div
      className={cx(
        'fixed top-0 z-30 h-topnav-height w-full bg-neutral-00',
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
