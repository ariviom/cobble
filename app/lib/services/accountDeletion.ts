import 'server-only';

import { getStripeClient } from '@/app/lib/stripe/client';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabaseServiceRoleClient';
import { logger } from '@/lib/metrics';

export async function deleteUserAccount(userId: string): Promise<void> {
  const supabase = getSupabaseServiceRoleClient();
  const stripe = getStripeClient();

  // 1. Cancel any active Stripe subscriptions
  const { data: subscriptions } = await supabase
    .from('billing_subscriptions')
    .select('stripe_subscription_id, status')
    .eq('user_id', userId)
    .in('status', ['active', 'trialing', 'past_due']);

  if (subscriptions && subscriptions.length > 0) {
    const failedSubscriptionIds: string[] = [];
    for (const sub of subscriptions) {
      try {
        // Cancel immediately with no final invoice and no proration charge
        await stripe.subscriptions.cancel(sub.stripe_subscription_id, {
          invoice_now: false,
          prorate: false,
        });
        logger.info('account_deletion.subscription_cancelled', {
          userId,
          subscriptionId: sub.stripe_subscription_id,
        });
      } catch (err) {
        failedSubscriptionIds.push(sub.stripe_subscription_id);
        logger.error('account_deletion.subscription_cancel_failed', {
          userId,
          subscriptionId: sub.stripe_subscription_id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    if (failedSubscriptionIds.length > 0) {
      throw new Error(
        'Failed to cancel active subscriptions before account deletion'
      );
    }
  }

  // Note: The Stripe customer record is intentionally preserved — Stripe has
  // its own data retention obligations for financial/tax compliance. The
  // billing_customers DB row is cleaned up by CASCADE on user deletion.

  // 2. End any active Search Party sessions hosted by this user
  const { error: sessionError } = await supabase
    .from('group_sessions')
    .update({ is_active: false, ended_at: new Date().toISOString() })
    .eq('host_user_id', userId)
    .eq('is_active', true);

  if (sessionError) {
    logger.error('account_deletion.session_end_failed', {
      userId,
      error: sessionError.message,
    });
  }

  // 3. Scrub display name in group sessions the user joined as a participant.
  // For sessions this user hosted, CASCADE on host_user_id handles cleanup in step 4.
  const { error: scrubError } = await supabase
    .from('group_session_participants')
    .update({ display_name: 'Deleted User' })
    .eq('user_id', userId);

  if (scrubError) {
    logger.error('account_deletion.participant_scrub_failed', {
      userId,
      error: scrubError.message,
    });
  }

  // 4. Delete the user from auth (CASCADE handles all dependent tables)
  const { error: deleteError } = await supabase.auth.admin.deleteUser(userId);

  if (deleteError) {
    logger.error('account_deletion.user_delete_failed', {
      userId,
      error: deleteError.message,
    });
    throw new Error('Failed to delete user account');
  }

  logger.info('account_deletion.completed', { userId });
}
