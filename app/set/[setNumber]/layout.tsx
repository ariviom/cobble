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
    <>
      <SetTopBar
        setNumber={setNumber}
        setName={summary.name}
        imageUrl={summary.imageUrl}
      />
      {children}
    </>
  );
}
