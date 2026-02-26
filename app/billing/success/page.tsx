import { Button } from '@/app/components/ui/Button';

export default function BillingSuccessPage() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 px-6 py-12">
      <header className="space-y-2">
        <p className="text-sm font-semibold text-green-600">Success</p>
        <h1 className="text-3xl font-bold">Welcome to Plus!</h1>
        <p className="text-foreground-muted">
          Your 14-day trial has started. You now have full access to all Plus
          features.
        </p>
      </header>
      <div className="flex flex-wrap gap-3">
        <Button href="/">Start exploring</Button>
        <Button href="/account" variant="outline">
          View account
        </Button>
      </div>
    </main>
  );
}
