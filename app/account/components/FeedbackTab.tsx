'use client';

import { Button } from '@/app/components/ui/Button';
import {
  Card,
  CardContent,
  CardDescription,
  CardTitle,
} from '@/app/components/ui/Card';
import { Input } from '@/app/components/ui/Input';
import type { User } from '@supabase/supabase-js';
import { useState } from 'react';

type FeedbackTabProps = {
  user: User | null;
};

export function FeedbackTab({ user }: FeedbackTabProps) {
  const isLoggedIn = !!user;
  const userEmail = user?.email ?? '';

  // Form state
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');

  // UI state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!isLoggedIn) {
      setError('You must be signed in to submit feedback.');
      return;
    }

    // Client-side validation
    const trimmedName = name.trim();
    const trimmedMessage = message.trim();

    if (!trimmedName || trimmedName.length === 0) {
      setError('Please enter your name.');
      setSuccess(null);
      return;
    }

    if (trimmedName.length > 100) {
      setError('Name must be 100 characters or less.');
      setSuccess(null);
      return;
    }

    if (!trimmedMessage || trimmedMessage.length === 0) {
      setError('Please enter a message.');
      setSuccess(null);
      return;
    }

    if (trimmedMessage.length > 2000) {
      setError('Message must be 2000 characters or less.');
      setSuccess(null);
      return;
    }

    setError(null);
    setSuccess(null);
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/feedback', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: trimmedName,
          message: trimmedMessage,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 429) {
          setError(
            data.message ?? 'Too many submissions. Please try again later.'
          );
        } else {
          setError(
            data.message ?? 'Failed to submit feedback. Please try again.'
          );
        }
        return;
      }

      // Success
      setSuccess('Feedback submitted successfully. Thank you!');
      setName('');
      setMessage('');
    } catch {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card
      id="feedback-section"
      aria-labelledby="feedback-heading"
      className="border-none bg-transparent p-0 shadow-none"
    >
      <CardContent className="flex flex-col gap-6">
        <div>
          <CardTitle
            id="feedback-heading"
            className="text-xl font-semibold text-foreground"
          >
            Send feedback
          </CardTitle>
          <CardDescription className="mt-1 text-sm text-foreground-muted">
            Help us improve Brick Party. Share bugs, feature requests, or
            general feedback.
          </CardDescription>
        </div>

        {!isLoggedIn && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
            <p>You must be signed in to submit feedback.</p>
          </div>
        )}

        {isLoggedIn && (
          <div className="mt-4 space-y-6">
            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold text-foreground">
                Submit feedback
              </h3>
              <p className="text-xs text-foreground-muted">
                We read every submission and use your feedback to guide product
                development.
              </p>

              {/* Email (read-only) */}
              <label className="mt-2 text-[11px] font-medium text-foreground">
                Email
              </label>
              <Input
                type="email"
                value={userEmail}
                disabled
                className="w-full text-xs text-foreground-muted"
              />
              <p className="text-[11px] text-foreground-muted">
                We&apos;ll use this email if we need to follow up with you.
              </p>

              {/* Name */}
              <label className="mt-2 text-[11px] font-medium text-foreground">
                Name
              </label>
              <Input
                type="text"
                value={name}
                onChange={e => {
                  setName(e.target.value);
                  setError(null);
                  setSuccess(null);
                }}
                placeholder="Your name"
                maxLength={100}
                className="w-full text-xs"
                disabled={isSubmitting}
              />

              {/* Message */}
              <label className="mt-2 text-[11px] font-medium text-foreground">
                Message
              </label>
              <textarea
                value={message}
                onChange={e => {
                  setMessage(e.target.value);
                  setError(null);
                  setSuccess(null);
                }}
                placeholder="Tell us what you think..."
                maxLength={2000}
                rows={6}
                disabled={isSubmitting}
                className="w-full rounded-md border border-subtle bg-card px-2 py-1 text-xs text-foreground shadow-sm placeholder:text-foreground-muted focus-visible:ring-2 focus-visible:ring-theme-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
              />
              <p className="text-[11px] text-foreground-muted">
                {message.length} / 2000 characters
              </p>

              {/* Error message */}
              {error && (
                <div className="rounded-md border-2 border-danger/30 bg-danger-muted px-3 py-2 text-[11px] font-medium text-danger">
                  {error}
                </div>
              )}

              {/* Success message */}
              {success && (
                <div className="rounded-md border-2 border-success/30 bg-success-muted px-3 py-2 text-[11px] font-medium text-success">
                  {success}
                </div>
              )}

              {/* Submit button */}
              <div className="mt-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void handleSubmit()}
                  disabled={isSubmitting}
                  className="inline-flex items-center px-3 py-1.5 text-[11px]"
                >
                  {isSubmitting ? 'Submitting…' : 'Submit feedback'}
                </Button>
              </div>
            </div>

            {/* Direct email option */}
            <div className="border-t border-subtle pt-4">
              <h3 className="text-sm font-semibold text-foreground">
                Email directly
              </h3>
              <p className="mt-1 text-xs text-foreground-muted">
                Prefer email? You can also reach us directly at{' '}
                <a
                  href="mailto:stud@brick-party.com"
                  className="font-medium text-theme-primary hover:underline"
                >
                  stud@brick-party.com
                </a>
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
