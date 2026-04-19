import Link from 'next/link';
import type { ReactNode } from 'react';

type NavItem = { label: string; href: string; key: 'users' | 'feedback' };

const NAV: NavItem[] = [
  { label: 'Users', href: '/admin/users', key: 'users' },
  { label: 'Feedback', href: '/admin/feedback', key: 'feedback' },
];

export function AdminShell({
  children,
  activeKey,
}: {
  children: ReactNode;
  activeKey: 'users' | 'feedback';
}) {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 md:flex md:gap-6">
      {/* Mobile: sticky horizontal nav */}
      <nav className="sticky top-0 z-10 -mx-4 mb-4 flex items-center gap-1 border-b border-subtle bg-background px-4 py-2 md:hidden">
        <h1 className="mr-3 text-sm font-semibold tracking-wide text-foreground-muted uppercase">
          Admin
        </h1>
        {NAV.map(item => {
          const isActive = item.key === activeKey;
          return (
            <Link
              key={item.key}
              href={item.href}
              className={[
                'rounded-md px-3 py-1.5 text-sm transition-colors',
                isActive
                  ? 'bg-card-muted font-medium text-foreground'
                  : 'text-foreground-muted hover:bg-card-muted hover:text-foreground',
              ].join(' ')}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Desktop: sidebar */}
      <aside className="hidden w-48 shrink-0 md:block">
        <h1 className="mb-4 text-sm font-semibold tracking-wide text-foreground-muted uppercase">
          Admin
        </h1>
        <nav className="flex flex-col gap-1">
          {NAV.map(item => {
            const isActive = item.key === activeKey;
            return (
              <Link
                key={item.key}
                href={item.href}
                className={[
                  'rounded-md px-3 py-2 text-sm transition-colors',
                  isActive
                    ? 'bg-card-muted font-medium text-foreground'
                    : 'text-foreground-muted hover:bg-card-muted hover:text-foreground',
                ].join(' ')}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
