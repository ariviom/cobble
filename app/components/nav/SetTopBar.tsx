'use client';

import { ExportModal } from '@/app/components/export/ExportModal';
import { NavButton } from '@/app/components/nav/NavButton';
import { SetInfoButton } from '@/app/components/nav/SetInfoButton';
import { TopNav } from '@/app/components/nav/TopNav';
import { useInventory } from '@/app/hooks/useInventory';
import { ArrowLeft, Download } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function SetTopBar({
  setNumber,
  setName,
  imageUrl,
}: {
  setNumber: string;
  setName: string;
  imageUrl: string | null;
}) {
  const router = useRouter();
  const { computeMissingRows } = useInventory(setNumber);
  const [open, setOpen] = useState(false);

  return (
    <>
      <TopNav position="sticky" className="border-b border-gray-200">
        <div className="flex items-center gap-2">
          <NavButton
            ariaLabel="Go back"
            icon={<ArrowLeft className="h-5 w-5" />}
            onClick={() => router.back()}
            variant="ghost"
          />
        </div>
        <div className="flex min-w-0 flex-1 justify-center">
          <SetInfoButton
            setNumber={setNumber}
            setName={setName}
            imageUrl={imageUrl}
          />
        </div>
        <div className="flex items-center gap-2">
          <NavButton
            ariaLabel="Export missing"
            icon={<Download className="h-5 w-5" />}
            onClick={() => setOpen(true)}
          />
        </div>
      </TopNav>
      <ExportModal
        open={open}
        onClose={() => setOpen(false)}
        setNumber={setNumber}
        setName={setName}
        getMissingRows={computeMissingRows}
      />
    </>
  );
}
