'use client';

import { Button } from './Button';
import { Card } from './Card';
import type { ReactNode } from 'react';

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
      <div className="flex h-12 w-full min-w-min items-center justify-center rounded-lg border-2 border-subtle px-3 text-xs text-foreground-muted">
        <Button href="/login" variant="link" size="xs">
          Sign in
        </Button>
        <span className="ml-1">to track inventory</span>
      </div>
    );
  }

  return (
    <Card
      variant="default"
      padding="lg"
      className="mx-auto max-w-3xl text-center shadow-md"
    >
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
