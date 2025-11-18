'use client';

import { NavLinkItem } from '@/app/components/nav/NavLinkItem';
import { cn } from '@/app/components/ui/utils';
import { Camera, Home, Package, Search, User } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export type NavigationTab = 'home' | 'search' | 'sets' | 'identify' | 'profile';

export type NavigationProps = {
  className?: string;
  activeTab?: NavigationTab;
  onTabChange?: (tab: NavigationTab) => void;
};

export function Navigation({
  className,
  activeTab,
  onTabChange,
}: NavigationProps) {
  const pathname = usePathname() ?? '/';

  const inferredTab: NavigationTab = (() => {
    if (pathname === '/' || pathname.startsWith('/?')) return 'home';
    if (pathname.startsWith('/search')) return 'search';
    if (pathname.startsWith('/identify')) return 'identify';
    if (pathname.startsWith('/sets') || pathname.startsWith('/set/'))
      return 'sets';
    if (pathname.startsWith('/account')) return 'profile';
    return 'home';
  })();

  const currentTab: NavigationTab = activeTab ?? inferredTab;

  const handleTabClick = (tab: NavigationTab) => () => {
    onTabChange?.(tab);
  };

  return (
    <nav
      className={cn(
        'fixed inset-x-0 bottom-0 z-50 h-nav-height w-full border-t border-foreground-accent bg-neutral-00 lg:top-0 lg:bottom-auto lg:border-b',
        className
      )}
    >
      <div className="relative flex h-nav-height w-full items-center px-2">
        <div className="relative flex w-full items-center justify-around gap-x-2 lg:justify-center">
          {/* Desktop brand (hidden on mobile) */}
          <Link
            href="/"
            className="hidden items-center gap-3 lg:absolute lg:top-1/2 lg:left-0 lg:flex lg:-translate-y-1/2"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-neutral-900 text-neutral-00">
              <Package className="h-5 w-5" />
            </div>
            <h1 className="text-lg font-bold">Cobble</h1>
          </Link>
          <NavLinkItem
            className="lg:hidden"
            icon={<Home className="h-5 w-5" />}
            ariaLabel="Home"
            labelMobile="Home"
            href="/"
            active={currentTab === 'home'}
            onClick={handleTabClick('home')}
          />
          <NavLinkItem
            icon={<Package className="h-5 w-5" />}
            ariaLabel="Sets"
            labelMobile="Sets"
            href="/sets"
            active={currentTab === 'sets'}
            onClick={handleTabClick('sets')}
          />
          <NavLinkItem
            icon={<Search className="h-5 w-5" />}
            ariaLabel="Search"
            labelMobile="Search"
            href="/search"
            active={currentTab === 'search'}
            onClick={handleTabClick('search')}
          />
          <NavLinkItem
            icon={<Camera className="h-5 w-5" />}
            ariaLabel="Identify"
            labelMobile="Identify"
            href="/identify"
            active={currentTab === 'identify'}
            onClick={handleTabClick('identify')}
          />
          <NavLinkItem
            icon={<User className="h-5 w-5" />}
            ariaLabel="Account"
            labelMobile="Profile"
            labelDesktop="Account"
            href="/account"
            active={currentTab === 'profile'}
            onClick={handleTabClick('profile')}
            className="lg:absolute lg:top-1/2 lg:right-0 lg:-translate-y-1/2"
          />
        </div>
      </div>
    </nav>
  );
}
