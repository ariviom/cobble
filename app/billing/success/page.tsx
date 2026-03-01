import { Button } from '@/app/components/ui/Button';
import { getSupabaseAuthServerClient } from '@/app/lib/supabaseAuthServerClient';

export default async function BillingSuccessPage() {
  let isAuthenticated = false;

  try {
    const supabase = await getSupabaseAuthServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    isAuthenticated = !!user;
  } catch {
    // Auth check failed — treat as unauthenticated
  }

  if (!isAuthenticated) {
    return (
      <main className="mx-auto flex max-w-3xl flex-col gap-4 px-6 py-12">
        <header className="space-y-2">
          <p className="text-sm font-semibold text-green-600">
            Payment confirmed
          </p>
          <h1 className="text-3xl font-bold">You&apos;re in!</h1>
          <p className="text-foreground-muted">
            Sign in to start using Plus. If you&apos;re new, check your email
            for an invite link.
          </p>
        </header>
        <div className="flex flex-wrap gap-3">
          <Button href="/login" variant="primary">
            Sign in
          </Button>
          <Button href="/sets" variant="outline">
            Browse sets
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 px-6 py-12">
      <header className="space-y-2">
        <p className="text-sm font-semibold text-green-600">Success</p>
        <h1 className="text-3xl font-bold">Welcome to Plus!</h1>
        <p className="text-foreground-muted">
          You now have full access to all Plus features.
        </p>
      </header>
      <div className="flex flex-wrap gap-3">
        <Button href="/sets">Start exploring</Button>
        <Button href="/account" variant="outline">
          View account
        </Button>
      </div>
    </main>
  );
}
