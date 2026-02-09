'use client';

import { NavLinkItem } from '@/app/components/nav/NavLinkItem';
import { cn } from '@/app/components/ui/utils';
import { useSupabaseUser } from '@/app/hooks/useSupabaseUser';
import { Camera, Layers, Package, Search, User } from 'lucide-react';
import Image from 'next/image';
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
      <div className="relative flex h-16 w-full items-center px-2 sm:px-4 lg:px-6">
        <div className="relative flex w-full items-center justify-around gap-x-1 lg:justify-center lg:gap-x-3">
          {/* Desktop brand - clean, minimal treatment on theme background */}
          <Link
            href="/sets"
            className="group hidden items-center gap-2 transition-all duration-150 hover:scale-[1.02] lg:absolute lg:top-1/2 lg:left-6 lg:flex lg:-translate-y-1/2"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/90 shadow-[inset_0_-2px_0_0_rgba(0,0,0,0.08),0_2px_4px_rgba(0,0,0,0.1)] transition-transform duration-150 group-hover:rotate-6">
              <Image
                src="/logo/brickparty_logo_sm.png"
                alt="Brick Party"
                width={32}
                height={32}
              />
            </div>
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
            href={
              isLoggedIn && handle ? `/collection/${handle}` : '/collection'
            }
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
      </div>
    </nav>
  );
}
