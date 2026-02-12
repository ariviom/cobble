'use client';

import { NavLinkItem } from '@/app/components/nav/NavLinkItem';
import { cn } from '@/app/components/ui/utils';
import { useSupabaseUser } from '@/app/hooks/useSupabaseUser';
import { Camera, Layers, Package, Search, User } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export type NavigationTab =
  | 'sets'
  | 'search'
  | 'collection'
  | 'identify'
  | 'profile';

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
  const { user, handle } = useSupabaseUser();
  const isLoggedIn = !!user;

  const inferredTab: NavigationTab = (() => {
    if (
      pathname === '/sets' ||
      pathname.startsWith('/sets/') ||
      pathname === '/'
    )
      return 'sets';
    if (pathname.startsWith('/search')) return 'search';
    if (pathname.startsWith('/identify')) return 'identify';
    if (pathname.startsWith('/collection') || pathname.startsWith('/set/'))
      return 'collection';
    if (pathname.startsWith('/account')) return 'profile';
    if (pathname.startsWith('/login')) return 'profile';
    return 'sets';
  })();

  const currentTab: NavigationTab = activeTab ?? inferredTab;

  const handleTabClick = (tab: NavigationTab) => () => {
    onTabChange?.(tab);
  };

  return (
    <nav
      className={cn(
        // Bold nav bar using theme color
        'fixed inset-x-0 bottom-0 z-100 w-full bg-theme-primary pb-[env(safe-area-inset-bottom,0px)] shadow-[color:var(--color-theme-shadow)] lg:top-0 lg:bottom-auto lg:pb-0 lg:shadow-[0_4px_0_0]',
        className
      )}
    >
      <div className="relative flex h-16 w-full items-center justify-around gap-x-1 px-2 sm:px-4 lg:justify-center lg:gap-x-3 lg:px-6">
        {/* Desktop brand - white logo on theme background */}
        <Link
          href="/sets"
          className="group hidden items-center gap-2 transition-all duration-150 hover:scale-[1.02] lg:absolute lg:top-1/2 lg:left-6 lg:flex lg:-translate-y-1/2"
        >
          <svg
            viewBox="0 0 512 512"
            className="size-12 text-white drop-shadow-sm transition-transform duration-150 group-hover:rotate-6"
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
          <h1 className="text-xl font-extrabold tracking-tight text-theme-primary-contrast">
            <span>Brick</span>
            <span className="opacity-70">Party</span>
          </h1>
        </Link>
        <NavLinkItem
          icon={<Layers className="h-5 w-5" />}
          ariaLabel="Sets"
          labelMobile="Sets"
          href="/sets"
          active={currentTab === 'sets'}
          onClick={handleTabClick('sets')}
        />
        <NavLinkItem
          icon={<Package className="h-5 w-5" />}
          ariaLabel="Collection"
          labelMobile="Collection"
          href={isLoggedIn && handle ? `/collection/${handle}` : '/collection'}
          active={currentTab === 'collection'}
          onClick={handleTabClick('collection')}
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
          ariaLabel={isLoggedIn ? 'Account' : 'Login'}
          labelMobile={isLoggedIn ? 'Account' : 'Login'}
          labelDesktop={isLoggedIn ? 'Account' : 'Login'}
          href={isLoggedIn ? '/account' : '/login'}
          active={currentTab === 'profile'}
          onClick={handleTabClick('profile')}
          className="lg:absolute lg:top-1/2 lg:right-6 lg:-translate-y-1/2"
        />
      </div>
    </nav>
  );
}
