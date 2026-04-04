import { getSupabaseAuthServerClient } from '@/app/lib/supabaseAuthServerClient';
import { redirect } from 'next/navigation';
import { LandingPage } from './components/landing/LandingPage';

export default async function Home() {
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

  if (isAuthenticated) {
    redirect('/sets');
  }

  return (
    <LandingPage
      plusMonthlyPriceId={process.env.STRIPE_PRICE_PLUS_MONTHLY ?? ''}
      plusYearlyPriceId={process.env.STRIPE_PRICE_PLUS_YEARLY ?? ''}
    />
  );
}
