import Link from 'next/link';

import { Button } from '@/app/components/ui/Button';

export default function AccountBillingPage() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-12">
      <header className="space-y-2">
        <p className="text-sm font-semibold text-blue-600">Billing beta</p>
        <h1 className="text-3xl font-bold">Billing & plans</h1>
        <p className="text-gray-700">
          During beta, everyone is on Plus automatically. Upgrade and portal
          links are hidden until we launch billing.
        </p>
      </header>

      <section className="rounded-lg border border-blue-100 bg-blue-50 p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-blue-700">
              Current access
            </p>
            <h2 className="text-2xl font-bold text-blue-900">Plus (beta)</h2>
            <p className="mt-2 text-sm text-blue-900">
              Unlimited Identify and custom lists are enabled for everyone while
              beta is running. We&apos;ll prompt you to upgrade when billing
              goes live.
            </p>
          </div>
          <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-blue-800 shadow-sm">
            Included now
          </span>
        </div>
      </section>

      <section className="space-y-3 rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <h3 className="text-lg font-semibold">What happens at launch</h3>
        <ul className="space-y-2 text-sm text-gray-700">
          <li>
            • You&apos;ll sign in before upgrading so we can attach your account
            to Stripe.
          </li>
          <li>
            • Manage billing and payment methods through the Stripe portal once
            enabled.
          </li>
          <li>
            • Pro will remain disabled until BYO BrickLink key and custom MOCs
            ship.
          </li>
        </ul>
      </section>

      <div className="flex flex-wrap gap-3">
        <Link href="/pricing">
          <Button variant="outline">View plans</Button>
        </Link>
        <Link href="/">
          <Button variant="ghost">Back to app</Button>
        </Link>
      </div>
    </main>
  );
}
