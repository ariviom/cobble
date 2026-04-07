'use client';

import { Button } from '@/app/components/ui/Button';

type Props = {
  onDismiss: () => void;
};

export function TourSignupPrompt({ onDismiss }: Props) {
  return (
    <div className="flex flex-col gap-3 p-4">
      <h3 className="text-lg font-bold text-foreground">Tour Brick Party</h3>
      <p className="text-sm text-foreground-muted">
        Create an account to get a guided tour of the app&apos;s features.
      </p>
      <Button variant="primary" href="/signup">
        Create account
      </Button>
      <Button variant="ghost" size="xs" onClick={onDismiss}>
        Skip
      </Button>
    </div>
  );
}
