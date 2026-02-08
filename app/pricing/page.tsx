import { Button } from '@/app/components/ui/Button';

const plusFeatures = [
  'Unlimited Identify usage',
  'Unlimited custom lists',
  'Included for all users during beta (no checkout needed)',
];

const proFeatures = [
  'Bring your own BrickLink API key (real-time)',
  'Custom MOCs support',
  'Advanced controls — coming soon',
];

export default function PricingPage() {
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-10 px-6 py-12">
      <header className="space-y-3">
        <p className="text-sm font-semibold text-blue-600">Billing beta</p>
        <h1 className="text-3xl font-bold">Pick the plan that fits</h1>
        <p className="text-gray-600">
          During beta, everyone gets Plus automatically and upgrade flows are
          disabled. We&apos;ll enable checkout when we launch billing.
        </p>
      </header>

      <section className="grid gap-6 md:grid-cols-2">
        <div className="rounded-xl border border-blue-100 bg-blue-50 p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-blue-600">Plus</p>
              <h2 className="text-2xl font-bold">Included in beta</h2>
            </div>
            <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-blue-700 shadow-sm">
              Active now
            </span>
          </div>
          <p className="mt-3 text-gray-700">
            Unlimited Identify and custom lists. Checkout is disabled while beta
            is running.
          </p>
          <ul className="mt-4 space-y-2 text-sm text-gray-800">
            {plusFeatures.map(item => (
              <li key={item} className="flex items-start gap-2">
                <span className="mt-1 h-2 w-2 rounded-full bg-blue-500" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <div className="mt-6">
            <Button disabled className="w-full md:w-auto">
              Included during beta
            </Button>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-500">Pro</p>
              <h2 className="text-2xl font-bold">Coming soon</h2>
            </div>
            <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700">
              Coming soon
            </span>
          </div>
          <p className="mt-3 text-gray-700">
            Advanced features like BYO BrickLink key and custom MOCs will ship
            with Pro. We&apos;ll announce pricing when it&apos;s ready.
          </p>
          <ul className="mt-4 space-y-2 text-sm text-gray-800">
            {proFeatures.map(item => (
              <li key={item} className="flex items-start gap-2">
                <span className="mt-1 h-2 w-2 rounded-full bg-gray-400" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <div className="mt-6">
            <Button disabled variant="outline" className="w-full md:w-auto">
              Coming soon
            </Button>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-semibold">What to expect</h3>
        <ul className="mt-3 space-y-2 text-sm text-gray-700">
          <li>
            • Checkout and portal links are hidden during beta. When we launch
            billing, you&apos;ll need to sign in before upgrading.
          </li>
          <li>
            • Keep using Identify and custom lists without limits while beta is
            active.
          </li>
          <li>
            • Pro will go live once BYO BrickLink key and custom MOCs are ready.
          </li>
        </ul>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button href="/" variant="outline">
            Back to app
          </Button>
          <Button href="/account" variant="ghost">
            Go to account
          </Button>
        </div>
      </section>
    </main>
  );
}
