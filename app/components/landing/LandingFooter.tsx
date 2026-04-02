import Link from 'next/link';

export function LandingFooter() {
  return (
    <footer className="border-t border-neutral-700 bg-neutral-900">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-4 py-8 text-sm text-neutral-400 sm:flex-row sm:justify-between sm:px-6">
        <p>&copy; {new Date().getFullYear()} Brick Party</p>
        <div className="flex gap-6">
          <Link href="/terms" className="hover:text-white">
            Terms
          </Link>
          <Link href="/privacy" className="hover:text-white">
            Privacy
          </Link>
        </div>
      </div>
    </footer>
  );
}
