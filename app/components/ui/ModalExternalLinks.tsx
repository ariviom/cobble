'use client';

import type { ReactNode } from 'react';

import { cn } from '@/app/components/ui/utils';

type ExternalLink = {
  href: string;
  icon?: ReactNode;
  label: string;
};

type ModalExternalLinksProps = {
  links: ExternalLink[];
  /** Content rendered before the external links (e.g., placeholders). */
  before?: ReactNode;
  /** Additional children rendered after the links (e.g., internal Link components). */
  children?: ReactNode;
};

const linkClassName =
  'flex flex-1 items-center justify-center gap-1.5 bg-card px-3 py-4 text-sm font-medium text-foreground-muted transition-colors hover:bg-card-muted hover:text-theme-text';

export function ModalExternalLinks({
  links,
  before,
  children,
}: ModalExternalLinksProps) {
  return (
    <div className="flex gap-px border-t-2 border-subtle bg-subtle">
      {before}
      {links.map(link => (
        <a
          key={link.href}
          href={link.href}
          target="_blank"
          rel="noreferrer noopener"
          className={linkClassName}
        >
          {link.label}
          {link.icon}
        </a>
      ))}
      {children}
    </div>
  );
}

/**
 * Renders an item styled consistently with ModalExternalLinks links,
 * but as a non-link element (e.g., for "Not on BrickLink" placeholders).
 */
export function ModalExternalLinkPlaceholder({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-1 items-center justify-center bg-card px-3 py-4 text-sm text-foreground-muted italic',
        className
      )}
    >
      {children}
    </div>
  );
}
