'use client';

import { NavLinkItem } from '@/app/components/nav/NavLinkItem';
import { cn } from '@/app/components/ui/utils';
import { Camera, Home, Package, Search, User } from 'lucide-react';

export type NavigationTab = 'home' | 'search' | 'sets' | 'identify' | 'profile';

export type NavigationProps = {
  className?: string;
  activeTab?: NavigationTab;
  onTabChange?: (tab: NavigationTab) => void;
};

export function Navigation({
  className,
  activeTab = 'home',
  onTabChange,
}: NavigationProps) {
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
      <div className="relative flex h-nav-height w-full items-center px-2 lg:px-6">
        <div className="relative flex w-full items-center justify-around gap-x-2 lg:justify-center">
          {/* Desktop brand (hidden on mobile) */}
          <div className="hidden items-center gap-3 lg:absolute lg:top-1/2 lg:left-0 lg:flex lg:-translate-y-1/2">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-neutral-900 text-neutral-00">
              <Package className="h-5 w-5" />
            </div>
            <h1 className="text-lg font-bold">Cobble</h1>
          </div>
          <NavLinkItem
            icon={<Home className="h-5 w-5" />}
            ariaLabel="Home"
            labelMobile="Home"
            href="/"
            active={activeTab === 'home'}
            onClick={handleTabClick('home')}
          />
          <NavLinkItem
            icon={<Package className="h-5 w-5" />}
            ariaLabel="Sets"
            labelMobile="Sets"
            href="/sets"
            active={activeTab === 'sets'}
            onClick={handleTabClick('sets')}
          />
          <NavLinkItem
            icon={<Search className="h-5 w-5" />}
            ariaLabel="Search"
            labelMobile="Search"
            href="/search"
            active={activeTab === 'search'}
            onClick={handleTabClick('search')}
          />
          <NavLinkItem
            icon={<Camera className="h-5 w-5" />}
            ariaLabel="Identify"
            labelMobile="Identify"
            href="/identify"
            active={activeTab === 'identify'}
            onClick={handleTabClick('identify')}
          />
          <NavLinkItem
            icon={<User className="h-5 w-5" />}
            ariaLabel="Account"
            labelMobile="Profile"
            labelDesktop="Account"
            href="/account"
            active={activeTab === 'profile'}
            onClick={handleTabClick('profile')}
            className="lg:absolute lg:top-1/2 lg:right-0 lg:-translate-y-1/2"
          />
        </div>
      </div>
    </nav>
  );
}
