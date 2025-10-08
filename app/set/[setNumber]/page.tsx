import { notFound } from "next/navigation";
import { InventoryTable } from "@/components/set/inventory-table";

export default function SetPage({ params }: { params: { setNumber: string } }) {
    const { setNumber } = params;
    if (!setNumber) notFound();
    return (
        <div className="min-h-screen p-6 flex flex-col">
            <h1 className="text-xl font-semibold mb-4">Set</h1>
            <div className="flex-1 min-h-0">
                <SetInventory setNumber={setNumber} />
            </div>
        </div>
    );
}

function SetInventory({ setNumber }: { setNumber: string }) {
	return (
		<div className="h-full flex flex-col min-h-0">
			<p className="text-sm text-gray-600 mb-4">Set: {setNumber}</p>
			<div className="flex-1 min-h-0">
				<InventoryTable setNumber={setNumber} />
			</div>
		</div>
	);
}


