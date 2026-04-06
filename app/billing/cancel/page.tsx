import { Button } from '@/app/components/ui/Button';

export default function BillingCancelPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 lg:px-6">
      <header>
        <p className="text-sm font-semibold text-amber-600">
          Checkout canceled
        </p>
        <h1 className="text-heading-lg font-bold tracking-tight text-foreground">
          No worries
        </h1>
        <p className="mt-1 text-body text-foreground-muted">
          No charge was made. You can upgrade anytime from the pricing page.
        </p>
      </header>
      <div>
        <Button href="/pricing">View plans</Button>
      </div>
    </div>
  );
}
