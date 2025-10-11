import { SearchBar } from '@/app/components/search/SearchBar';
import { InventoryTable } from '@/app/components/set/InventoryTable';
import { notFound } from 'next/navigation';

function SetInventory({ setNumber }: { setNumber: string }) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <section className="mb-4">
        <SearchBar />
      </section>
      <section className="mb-4">
        <p className="text-sm text-gray-600">Set: {setNumber}</p>
      </section>
      <section className="min-h-0 flex-1">
        <InventoryTable setNumber={setNumber} />
      </section>
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
    <>
      <section className="mb-4">
        <h1 className="text-xl font-semibold">Set</h1>
      </section>
      <section className="min-h-0 flex-1">
        <SetInventory setNumber={setNumber} />
      </section>
    </>
  );
}
