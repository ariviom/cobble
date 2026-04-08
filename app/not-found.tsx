import { PageLayout } from '@/app/components/layout/PageLayout';
import Link from 'next/link';

export default function NotFound() {
  return (
    <PageLayout>
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
        <h1 className="mb-2 text-4xl font-extrabold tracking-tight text-foreground sm:text-5xl">
          Ouch! You stepped on a brick!
        </h1>
        <p className="mb-8 text-xl text-foreground-muted">
          This page could not be found. Try{' '}
          <Link
            href="/search"
            className="hover:text-theme-primary-hover text-theme-primary underline underline-offset-2"
          >
            searching for a set
          </Link>{' '}
          instead?
        </p>
      </div>
    </PageLayout>
  );
}
