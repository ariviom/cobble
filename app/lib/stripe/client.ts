import 'server-only';

import Stripe from 'stripe';

import { getEnvOrThrow } from '@/app/lib/env';

let stripeClient: Stripe | null = null;

export function getStripeClient(): Stripe {
  if (stripeClient) return stripeClient;

  stripeClient = new Stripe(getEnvOrThrow('STRIPE_SECRET_KEY'), {
    apiVersion: '2025-12-15.clover',
  });

  return stripeClient;
}

export function getStripeWebhookSecret(): string {
  return getEnvOrThrow('STRIPE_WEBHOOK_SECRET');
}
