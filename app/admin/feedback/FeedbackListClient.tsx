'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';

import type {
  FeedbackCategory,
  ListAdminFeedbackResult,
} from '@/app/lib/services/adminFeedback';

const TABS: Array<{ label: string; value: FeedbackCategory | null }> = [
  { label: 'All', value: null },
  { label: 'Bugs', value: 'bug' },
  { label: 'Feature requests', value: 'feature_request' },
  { label: 'Questions', value: 'question' },
  { label: 'General', value: 'general' },
];

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString();
}

export function FeedbackListClient({
  initialData,
  initialCategory,
}: {
  initialData: ListAdminFeedbackResult;
  initialCategory: FeedbackCategory | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function selectTab(value: FeedbackCategory | null) {
    startTransition(() => {
      const params = new URLSearchParams(searchParams?.toString() ?? '');
      if (value) params.set('category', value);
      else params.delete('category');
      const qs = params.toString();
      router.push(`/admin/feedback${qs ? `?${qs}` : ''}`);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold">Feedback ({initialData.total})</h2>

      <nav className="flex flex-wrap gap-1 border-b border-subtle">
        {TABS.map(tab => {
          const active = (initialCategory ?? null) === tab.value;
          return (
            <button
              key={tab.value ?? 'all'}
              type="button"
              disabled={isPending}
              onClick={() => selectTab(tab.value)}
              className={[
                '-mb-px border-b-2 px-3 py-2 text-sm transition-colors',
                active
                  ? 'border-foreground font-medium text-foreground'
                  : 'border-transparent text-foreground-muted hover:text-foreground',
              ].join(' ')}
            >
              {tab.label}
            </button>
          );
        })}
      </nav>

      {initialData.rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-foreground-muted">
          No feedback in this category.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {initialData.rows.map(row => (
            <li
              key={row.id}
              className="rounded-lg border border-subtle bg-card p-4"
            >
              <header className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-foreground-muted">
                <div className="flex items-center gap-2">
                  <Link
                    href={`/admin/users/${row.user_id}`}
                    className="font-medium text-foreground hover:underline"
                  >
                    {row.name || row.email}
                  </Link>
                  <span>·</span>
                  <span>{row.email}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-card-muted px-2 py-0.5">
                    {row.category}
                  </span>
                  <span>{formatDate(row.created_at)}</span>
                </div>
              </header>
              <p className="text-sm whitespace-pre-wrap">{row.message}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
