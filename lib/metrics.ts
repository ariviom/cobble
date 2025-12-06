export type MetricPayload = Record<string, unknown>;
type CounterRecord = {
  count: number;
  last: MetricPayload | undefined;
};

const counters = new Map<string, CounterRecord>();

export function incrementCounter(name: string, payload?: MetricPayload): void {
  const current = counters.get(name) ?? { count: 0, last: undefined as MetricPayload | undefined };
  const next: CounterRecord = {
    count: current.count + 1,
    last: payload ?? current.last,
  };
  counters.set(name, next);
  try {
    console.log('[metric]', name, JSON.stringify({ count: next.count, payload }));
  } catch {
    // ignore logging errors
  }
}

export function logEvent(name: string, payload?: MetricPayload): void {
  try {
    console.log('[event]', name, JSON.stringify(payload ?? {}));
  } catch {
    // ignore logging errors
  }
}
