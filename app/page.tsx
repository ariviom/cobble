import { getSupabaseSession } from '@/app/lib/supabaseAuthServerClient';
import { redirect } from 'next/navigation';
import { LandingPage } from './components/landing/LandingPage';

export default async function Home() {
  let isAuthenticated = false;

  try {
    const { userId } = await getSupabaseSession();
    isAuthenticated = !!userId;
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
