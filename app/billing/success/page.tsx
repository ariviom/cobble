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

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-6 px-4 py-16 text-center lg:px-6">
      <header className="space-y-2">
        <p className="text-sm font-semibold text-green-600">
          {isAuthenticated ? 'Success' : 'Payment confirmed'}
        </p>
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground lg:text-4xl">
          {isAuthenticated ? "Let's Party!" : "Let's Party!"}
        </h1>
        <p className="mt-2 text-body text-foreground-muted">
          {isAuthenticated
            ? 'You now have full access to all Plus features.'
            : 'Check your email for a link to sign in and activate your account.'}
        </p>
      </header>

      <div>
        <Button href={isAuthenticated ? '/sets' : '/login'} variant="primary">
          {isAuthenticated ? 'Go to sets' : 'Sign in'}
        </Button>
      </div>
    </div>
  );
}
