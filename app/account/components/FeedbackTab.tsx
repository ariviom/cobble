'use client';

import { Alert } from '@/app/components/ui/Alert';
import { Button } from '@/app/components/ui/Button';
import {
  Card,
  CardContent,
  CardHeader,
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
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Send feedback</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-body text-foreground-muted">
            Help us improve Brick Party. Share bugs, feature requests, or
            general feedback.
          </p>

          {!isLoggedIn && (
            <Alert variant="warning" className="mt-4">
              You must be signed in to submit feedback.
            </Alert>
          )}

          {isLoggedIn && (
            <div className="mt-6 space-y-4">
              {/* Email (read-only) */}
              <div>
                <label className="text-label font-semibold text-foreground">
                  Email
                </label>
                <p className="text-body-sm mt-0.5 text-foreground-muted">
                  We&apos;ll use this email if we need to follow up with you.
                </p>
                <Input
                  type="email"
                  size="sm"
                  value={userEmail}
                  disabled
                  className="mt-2"
                />
              </div>

              {/* Name */}
              <div>
                <label className="text-label font-semibold text-foreground">
                  Name
                </label>
                <Input
                  type="text"
                  size="sm"
                  value={name}
                  onChange={e => {
                    setName(e.target.value);
                    setError(null);
                    setSuccess(null);
                  }}
                  placeholder="Your name"
                  maxLength={100}
                  className="mt-2"
                  disabled={isSubmitting}
                />
              </div>

              {/* Message */}
              <div>
                <label className="text-label font-semibold text-foreground">
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
                  className="mt-2 w-full rounded-lg border border-subtle bg-card px-4 py-3 text-base font-medium text-foreground transition-all duration-150 placeholder:text-foreground-muted/50 focus:border-theme-primary focus:ring-2 focus:ring-theme-primary/20 focus:outline-none disabled:cursor-not-allowed disabled:bg-background-muted disabled:opacity-50"
                />
                <p className="text-body-sm mt-1 text-foreground-muted">
                  {message.length} / 2000 characters
                </p>
              </div>

              {/* Error message */}
              {error && <Alert variant="error">{error}</Alert>}

              {/* Success message */}
              {success && <Alert variant="success">{success}</Alert>}

              {/* Submit button */}
              <Button
                type="button"
                size="sm"
                variant="primary"
                onClick={() => void handleSubmit()}
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Submitting…' : 'Submit feedback'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Direct email option */}
      <Card>
        <CardHeader>
          <CardTitle>Email directly</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-body text-foreground-muted">
            Prefer email? You can also reach us directly at{' '}
            <a
              href="mailto:stud@brick-party.com"
              className="font-semibold text-link hover:text-link-hover hover:underline"
            >
              stud@brick-party.com
            </a>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
