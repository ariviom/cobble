import { SearchBar } from '@/app/components/search/SearchBar';
import { InventoryTable } from '@/app/components/set/InventoryTable';
import { notFound } from 'next/navigation';

function SetInventory({ setNumber }: { setNumber: string }) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-4">
        <SearchBar />
      </div>
      <p className="mb-4 text-sm text-gray-600">Set: {setNumber}</p>
      <div className="min-h-0 flex-1">
        <InventoryTable setNumber={setNumber} />
      </div>
    </div>
  );
}

export default async function SetPage({
  params,
}: {
  params: Promise<{ setNumber: string }>;
}) {
  const { setNumber } = await params;
  if (!setNumber) notFound();
  return (
    <div className="mx-auto flex max-w-6xl flex-col p-6">
      <h1 className="mb-4 text-xl font-semibold">Set</h1>
      <div className="min-h-0 flex-1">
        <SetInventory setNumber={setNumber} />
      </div>
    </div>
  );
}
