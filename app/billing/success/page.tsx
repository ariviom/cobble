import { Button } from '@/app/components/ui/Button';

export default function BillingSuccessPage() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 px-6 py-12">
      <header className="space-y-2">
        <p className="text-sm font-semibold text-green-600">Success</p>
        <h1 className="text-3xl font-bold">You&apos;re all set</h1>
        <p className="text-gray-600">
          Thanks for checking out billing. During beta, Plus is already active
          for everyone and upgrade CTAs are hidden.
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
