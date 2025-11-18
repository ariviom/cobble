'use client';

import { cn } from '@/app/components/ui/utils';
import { forwardRef, useEffect, useRef, type InputHTMLAttributes } from 'react';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'checked'> & {
  checked: boolean;
  indeterminate?: boolean;
};

export const RowCheckbox = forwardRef<HTMLInputElement, Props>(
  function RowCheckbox(
    { checked, indeterminate, className, tabIndex, ...rest },
    ref
  ) {
    const innerRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
      const el = (
        ref && typeof ref !== 'function' ? ref.current : innerRef.current
      ) as HTMLInputElement | null;
      if (el) el.indeterminate = !!indeterminate;
    }, [indeterminate, ref]);

    return (
      <input
        ref={node => {
          innerRef.current = node;
          if (typeof ref === 'function') ref(node);
          else if (ref && typeof ref !== 'function') {
            (ref as React.MutableRefObject<HTMLInputElement | null>).current =
              node;
          }
        }}
        type="checkbox"
        checked={checked}
        aria-hidden="true"
        readOnly
        tabIndex={tabIndex ?? -1}
        className={cn(
          'size-5 border-neutral-300 accent-theme-primary',
          className
        )}
        {...rest}
      />
    );
  }
);
