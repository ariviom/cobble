import Link from 'next/link';

import { Button } from '@/app/components/ui/Button';

export default function BillingCancelPage() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 px-6 py-12">
      <header className="space-y-2">
        <p className="text-sm font-semibold text-amber-600">Canceled</p>
        <h1 className="text-3xl font-bold">Checkout was canceled</h1>
        <p className="text-gray-600">
          No charge was made. Billing is disabled during beta, so there&apos;s
          nothing else to do right now.
        </p>
      </header>
      <div className="flex flex-wrap gap-3">
        <Link href="/pricing">
          <Button>View plans</Button>
        </Link>
        <Link href="/">
          <Button variant="outline">Back to app</Button>
        </Link>
      </div>
    </main>
  );
}
