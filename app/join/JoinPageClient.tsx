'use client';

import { Button } from '@/app/components/ui/Button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/app/components/ui/Card';
import { cn } from '@/app/components/ui/utils';
import { Users } from 'lucide-react';
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
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const code = extractCode(value);
    if (!code) {
      setError('Enter a valid 6-character code (2-9, a-z).');
      return;
    }
    setError(null);
    setIsSubmitting(true);
    router.push(`/group/${code}`);
  };

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-12">
      <Card elevated>
        <CardHeader className="flex flex-col items-center justify-center gap-3 text-center">
          <div className="flex size-16 items-center justify-center rounded-full bg-brand-blue/10">
            <Users className="size-8 text-brand-blue" />
          </div>
          <div>
            <CardTitle className="text-xl">Join a Search Party</CardTitle>
            <CardDescription className="mt-1 text-sm">
              Enter the 6-character session code to join.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="mb-2 block text-xs font-bold tracking-wide text-foreground-muted uppercase">
                Session code
              </label>
              <input
                type="text"
                value={value}
                onChange={event => {
                  setValue(event.target.value.toUpperCase());
                  if (error) setError(null);
                }}
                placeholder="ABC123"
                className={cn(
                  'w-full rounded-lg border bg-card px-4 py-3 text-center font-mono text-2xl font-bold tracking-[0.4em] transition-colors',
                  error
                    ? 'border-brand-red/50 bg-brand-red/5 text-brand-red focus:border-brand-red focus:outline-none'
                    : 'border-brand-blue/30 bg-brand-blue/5 text-brand-blue focus:border-brand-blue focus:outline-none'
                )}
                inputMode="text"
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck="false"
                maxLength={6}
              />
              <p
                className={cn(
                  'mt-2 text-center text-xs',
                  error ? 'font-medium text-brand-red' : 'text-foreground-muted'
                )}
              >
                {error ?? 'Letters and numbers only (2-9, a-z)'}
              </p>
            </div>
            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="w-full"
              disabled={isSubmitting || value.length < 6}
            >
              {isSubmitting ? 'Joining…' : 'Join Session'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
