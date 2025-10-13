import { SetTopBar } from '@/app/components/nav/SetTopBar';
import { getSetSummary } from '@/app/lib/rebrickable';
import type { PropsWithChildren } from 'react';

export default async function SetLayout({
  children,
  params,
}: PropsWithChildren<{ params: Promise<{ setNumber: string }> }>) {
  const { setNumber } = await params;
  const summary = await getSetSummary(setNumber);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SetTopBar
        setNumber={setNumber}
        setName={summary.name}
        imageUrl={summary.imageUrl}
      />
      <div className="mt-2 flex min-h-0 flex-1 flex-col overflow-hidden">
        {children}
      </div>
    </div>
  );
}
