import { TopNav } from '@/app/components/nav/TopNav';
import type { PropsWithChildren } from 'react';

export default function SearchLayout({ children }: PropsWithChildren<{}>) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <TopNav>
        <div className="flex min-w-0 flex-1 justify-center">
          <h1 className="truncate text-base font-semibold">Search</h1>
        </div>
      </TopNav>
      <div className="mt-2">{children}</div>
    </div>
  );
}
