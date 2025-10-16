import { InventoryTable } from '@/app/components/set/InventoryTable';
import { notFound } from 'next/navigation';

export default async function SetPage({
  params,
}: {
  params: Promise<{ setNumber: string }>;
}) {
  const { setNumber } = await params;
  if (!setNumber) notFound();
  return <InventoryTable setNumber={setNumber} />;
}
