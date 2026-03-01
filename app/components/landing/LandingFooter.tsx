import Link from 'next/link';

export function LandingFooter() {
  return (
    <footer className="border-t border-neutral-200 bg-neutral-50">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-4 py-8 text-sm text-neutral-500 sm:flex-row sm:justify-between sm:px-6">
        <p>&copy; {new Date().getFullYear()} Brick Party</p>
        <div className="flex gap-6">
          <Link href="/terms" className="hover:text-neutral-900">
            Terms
          </Link>
          <Link href="/privacy" className="hover:text-neutral-900">
            Privacy
          </Link>
          <Link href="/pricing" className="hover:text-neutral-900">
            Pricing
          </Link>
        </div>
      </div>
    </footer>
  );
}
