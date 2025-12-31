import 'server-only';

import Stripe from 'stripe';

function getEnvOrThrow(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

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
