'use client';

import { Button } from '@/app/components/ui/Button';
import Link from 'next/link';

export function LandingNav() {
  return (
    <nav className="sticky top-0 z-50 border-b border-neutral-200/60 bg-white/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="group flex items-center gap-2">
          <svg
            viewBox="0 0 512 512"
            className="size-9 text-brand-yellow drop-shadow-sm transition-transform duration-150 group-hover:rotate-6"
            aria-hidden="true"
          >
            <path
              fill="currentColor"
              d="M489.34 232.72 287.26 132.36c-9.76-4.85-20.37-7.27-30.97-7.27s-21.54 2.5-31.42 7.49l-59.5 30.09 29.04 14.42c17.26-7.11 38.55-11.31 61.6-11.31 57.57 0 104.23 26.19 104.23 58.49v23.95c0 32.3-46.67 58.49-104.23 58.49s-104.23-26.19-104.23-58.49V224.28c0-6.6 1.95-12.94 5.53-18.85l-38.6-19.17-96.16 48.62c-12.79 6.47-12.72 24.75.11 31.13l202.08 100.36c9.76 4.85 20.37 7.27 30.97 7.27s21.54-2.5 31.42-7.49l202.31-102.29c12.79-6.47 12.72-24.75-.11-31.13Z"
            />
            <path
              fill="currentColor"
              d="M256 183.72c-49.38 0-86.29 21.4-86.29 40.54s36.9 40.54 86.29 40.54 86.29-21.4 86.29-40.54-36.9-40.54-86.29-40.54Z"
            />
          </svg>
          <span className="text-xl font-extrabold tracking-tight text-neutral-900">
            Brick<span className="text-neutral-500">Party</span>
          </span>
        </Link>

        <div className="hidden items-center gap-6 lg:flex">
          {[
            { label: 'Features', href: '#features' },
            { label: 'How it works', href: '#plus' },
            { label: 'Pricing', href: '#pricing' },
          ].map(link => (
            <a
              key={link.href}
              href={link.href}
              onClick={e => {
                const el = document.querySelector(link.href);
                if (el) {
                  e.preventDefault();
                  el.scrollIntoView({ behavior: 'smooth' });
                }
              }}
              className="text-sm font-medium text-neutral-600 transition-colors hover:text-neutral-900"
            >
              {link.label}
            </a>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <Button href="/login" variant="ghost" size="sm">
            Sign in
          </Button>
          <Button href="/sets" variant="primary" size="sm">
            Get started
          </Button>
        </div>
      </div>
    </nav>
  );
}
