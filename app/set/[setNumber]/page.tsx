import { notFound } from "next/navigation";
import { InventoryTable } from "@/components/set/inventory-table";

export default async function SetPage({ params }: { params: Promise<{ setNumber: string }> }) {
    const { setNumber } = await params;
    if (!setNumber) notFound();
    return (
        <div className="p-6">
            <h1 className="text-xl font-semibold mb-4">Set</h1>
            <SetInventory setNumber={setNumber} />
        </div>
    );
}

function SetInventory({ setNumber }: { setNumber: string }) {
	return (
		<div>
			<p className="text-sm text-gray-600 mb-4">Set: {setNumber}</p>
			<InventoryTable setNumber={setNumber} />
		</div>
	);
}


