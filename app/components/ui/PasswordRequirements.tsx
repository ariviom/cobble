'use client';

import { Check, Circle } from 'lucide-react';
import { cn } from './utils';

export const PASSWORD_MIN_LENGTH = 8;

export type PasswordRule = {
  label: string;
  test: (password: string) => boolean;
};

export const PASSWORD_RULES: readonly PasswordRule[] = [
  {
    label: `At least ${PASSWORD_MIN_LENGTH} characters`,
    test: pw => pw.length >= PASSWORD_MIN_LENGTH,
  },
];

export function isPasswordValid(password: string): boolean {
  return PASSWORD_RULES.every(rule => rule.test(password));
}

export function PasswordRequirements({
  password,
  className,
}: {
  password: string;
  className?: string;
}) {
  return (
    <ul className={cn('mt-2 space-y-1 text-xs', className)}>
      {PASSWORD_RULES.map(rule => {
        const passed = rule.test(password);
        return (
          <li
            key={rule.label}
            className={cn(
              'flex items-center gap-2 transition-colors',
              passed ? 'text-success' : 'text-foreground-muted'
            )}
          >
            {passed ? (
              <Check className="size-3.5" aria-hidden="true" />
            ) : (
              <Circle className="size-3.5" aria-hidden="true" />
            )}
            <span>{rule.label}</span>
            <span className="sr-only">
              {passed ? 'requirement met' : 'requirement not met'}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
