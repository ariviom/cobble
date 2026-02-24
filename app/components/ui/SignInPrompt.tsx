'use client';

import type { ReactNode } from 'react';
import { Button } from './Button';
import { Card } from './Card';

type SignInPromptProps = {
  variant?: 'card' | 'inline';
  title?: string;
  description?: string;
  buttonText?: string;
  footer?: ReactNode;
};

export function SignInPrompt({
  variant = 'card',
  title = 'Sign In Required',
  description = 'Sign in to access this feature.',
  buttonText = 'Sign in',
  footer,
}: SignInPromptProps) {
  if (variant === 'inline') {
    return (
      <div className="h-12 w-full min-w-min rounded-lg border border-subtle px-3 py-2 text-center text-xs text-foreground-muted">
        <a
          href="/login"
          className="inline-block text-link underline underline-offset-2"
        >
          Sign in
        </a>
        {` `}
        to track inventory
      </div>
    );
  }

  return (
    <Card elevated padding="lg" className="mx-auto max-w-3xl text-center">
      <h2 className="mb-3 text-2xl font-bold">{title}</h2>
      <p className="text-body text-foreground-muted">{description}</p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Button href="/login" variant="primary" size="lg">
          {buttonText}
        </Button>
      </div>
      {footer && <div className="mt-4">{footer}</div>}
    </Card>
  );
}
