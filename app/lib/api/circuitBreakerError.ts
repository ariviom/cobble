import 'server-only';

import { incrementCounter } from '@/lib/metrics';

import { errorResponse } from './responses';

type CircuitBreakerOptions = {
  counterName: string;
  counterDetails?: Record<string, unknown>;
  message?: string;
};

export function handleCircuitBreakerError(
  err: unknown,
  options: CircuitBreakerOptions
) {
  const retryAfterMs =
    (err as Error & { retryAfterMs?: number }).retryAfterMs ?? 60_000;
  const retryAfterSeconds = Math.ceil(retryAfterMs / 1000);

  incrementCounter(options.counterName, options.counterDetails);

  return errorResponse('rebrickable_circuit_open', {
    message:
      options.message ??
      'Rebrickable API is temporarily unavailable. Please try again shortly.',
    status: 503,
    details: { retryAfterSeconds },
  });
}
