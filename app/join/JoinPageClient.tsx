'use client';

import { Button } from '@/app/components/ui/Button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/app/components/ui/Card';
import { useRouter } from 'next/navigation';
import type { FormEvent } from 'react';
import { useState } from 'react';

const CODE_REGEX = /^[23456789abcdefghijkmnopqrstuvwxyz]{6}$/i;

function extractCode(input: string): string | null {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return null;

  // Only allow raw 6-char codes; reject any extra characters or separators.
  const cleaned = trimmed.replace(/[^a-z0-9]/g, '');
  if (!CODE_REGEX.test(cleaned)) {
    return null;
  }
  return cleaned;
}

export function JoinPageClient() {
  const router = useRouter();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  const helperText =
    error ?? 'Enter the 6-character Search Party code (letters/numbers).';

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const code = extractCode(value);
    if (!code) {
      setError('Enter a valid 6-character code (2-9, a-z).');
      return;
    }
    setError(null);
    router.push(`/group/${code}`);
  };

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6 py-10">
      <Card>
        <CardHeader>
          <CardTitle>Join a Search Party</CardTitle>
          <CardDescription>Enter the 6-character session code.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <label className="block text-xs font-medium text-foreground">
              Session code
            </label>
            <input
              type="text"
              value={value}
              onChange={event => {
                setValue(event.target.value);
                if (error) setError(null);
              }}
              placeholder="e.g., 3kd7xp"
              className="mt-1 w-full rounded-md border border-subtle bg-background px-3 py-2 font-mono text-sm tracking-[0.2em] uppercase"
              inputMode="text"
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck="false"
              maxLength={64}
            />
            <p
              className={`text-[11px] ${
                error ? 'text-destructive' : 'text-foreground-muted'
              }`}
            >
              {helperText}
            </p>
            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="w-full"
            >
              Continue
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
