import { Button } from '@/app/components/ui/Button';

export default function BillingCancelPage() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 px-6 py-12">
      <header className="space-y-2">
        <p className="text-sm font-semibold text-amber-600">
          Checkout canceled
        </p>
        <h1 className="text-3xl font-bold">No worries</h1>
        <p className="text-foreground-muted">
          No charge was made. You can upgrade anytime from the pricing page.
        </p>
      </header>
      <div className="flex flex-wrap gap-3">
        <Button href="/pricing">View plans</Button>
        <Button href="/" variant="outline">
          Back to app
        </Button>
      </div>
    </main>
  );
}
