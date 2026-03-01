import { redirect } from 'next/navigation';

// Stale beta placeholder — billing now lives in the /account Billing tab.
// This redirect exists because Stripe portal return URLs may still point here.
export default function AccountBillingPage() {
  redirect('/account');
}
