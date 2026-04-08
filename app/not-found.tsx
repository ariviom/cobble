import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <h1 className="mb-2 text-5xl font-extrabold tracking-tight text-foreground sm:text-6xl">
        Ouch!
      </h1>
      <p className="mb-1 text-2xl font-semibold text-foreground sm:text-3xl">
        You stepped on a brick!
      </p>
      <p className="mb-8 text-lg text-foreground-muted">
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
  );
}
