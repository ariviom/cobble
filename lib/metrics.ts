export type MetricPayload = Record<string, unknown>;
type CounterRecord = {
  count: number;
  last: MetricPayload | undefined;
};

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogPayload = Record<string, unknown>;

const counters = new Map<string, CounterRecord>();

function log(level: LogLevel, event: string, data?: LogPayload): void {
  const payload = {
    level,
    event,
    data: data ?? {},
    timestamp: new Date().toISOString(),
  };
  try {
    // Use console.info/warn/error so Next's removeConsole (keeping warn/error) preserves prod logs.
    if (level === 'warn') {
      console.warn(JSON.stringify(payload));
      return;
    }
    if (level === 'error') {
      console.error(JSON.stringify(payload));
      return;
    }
    // info/debug
    console.info(JSON.stringify(payload));
  } catch {
    // ignore logging errors
  }
}

export function incrementCounter(name: string, payload?: MetricPayload): void {
  const current = counters.get(name) ?? { count: 0, last: undefined as MetricPayload | undefined };
  const next: CounterRecord = {
    count: current.count + 1,
    last: payload ?? current.last,
  };
  counters.set(name, next);
  log('info', 'metric', { name, count: next.count, ...(payload ? { payload } : {}) });
}

export function logEvent(name: string, payload?: MetricPayload): void {
  log('info', 'event', { name, ...(payload ? { payload } : {}) });
}

export const logger = {
  debug: (event: string, data?: LogPayload) => log('debug', event, data),
  info: (event: string, data?: LogPayload) => log('info', event, data),
  warn: (event: string, data?: LogPayload) => log('warn', event, data),
  error: (event: string, data?: LogPayload) => log('error', event, data),
};
