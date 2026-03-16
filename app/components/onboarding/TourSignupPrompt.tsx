'use client';

import { Button } from '@/app/components/ui/Button';
import {
  getSupabaseBrowserClient,
  getAuthRedirectUrl,
} from '@/app/lib/supabaseClient';

type Props = {
  onDismiss: () => void;
};

export function TourSignupPrompt({ onDismiss }: Props) {
  const handleSignUp = async () => {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: getAuthRedirectUrl(),
        queryParams: { access_type: 'offline', prompt: 'consent' },
      },
    });
  };

  return (
    <div className="flex flex-col gap-3 p-4">
      <h3 className="text-lg font-bold text-foreground">Tour Brick Party</h3>
      <p className="text-sm text-foreground-muted">
        Create an account to get a guided tour of the app&apos;s features.
      </p>
      <Button variant="primary" onClick={handleSignUp}>
        Create account
      </Button>
      <button
        type="button"
        onClick={onDismiss}
        className="text-xs text-foreground-muted hover:text-foreground"
      >
        Skip
      </button>
    </div>
  );
}
