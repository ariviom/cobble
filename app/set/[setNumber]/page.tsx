import { InventoryTable } from '@/app/components/set/InventoryTable';
import { notFound } from 'next/navigation';

export default async function SetPage({
  params,
}: {
  params: Promise<{ setNumber: string }>;
}) {
  const { setNumber } = await params;
  if (!setNumber) notFound();
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <InventoryTable setNumber={setNumber} />
    </div>
  );
}
