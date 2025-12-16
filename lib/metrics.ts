export type MetricPayload = Record<string, unknown>;
type CounterRecord = {
  count: number;
  last: MetricPayload | undefined;
};

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogPayload = Record<string, unknown>;

const counters = new Map<string, CounterRecord>();

/**
 * Extract request ID from headers for logging context.
 * Works with both Headers object and NextRequest.
 */
export function getRequestIdFromHeaders(
  headers: Headers | { get: (key: string) => string | null }
): string | null {
  return headers.get('x-request-id');
}

function log(
  level: LogLevel,
  event: string,
  data?: LogPayload,
  requestId?: string | null
): void {
  const payload = {
    level,
    event,
    ...(requestId ? { requestId } : {}),
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
  const current = counters.get(name) ?? {
    count: 0,
    last: undefined as MetricPayload | undefined,
  };
  const next: CounterRecord = {
    count: current.count + 1,
    last: payload ?? current.last,
  };
  counters.set(name, next);
  log('info', 'metric', {
    name,
    count: next.count,
    ...(payload ? { payload } : {}),
  });
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

/**
 * Create a logger bound to a specific request ID for consistent tracing.
 * Use in route handlers: `const log = createRequestLogger(request.headers);`
 */
export function createRequestLogger(
  headers: Headers | { get: (key: string) => string | null }
) {
  const requestId = getRequestIdFromHeaders(headers);
  return {
    debug: (event: string, data?: LogPayload) =>
      log('debug', event, data, requestId),
    info: (event: string, data?: LogPayload) =>
      log('info', event, data, requestId),
    warn: (event: string, data?: LogPayload) =>
      log('warn', event, data, requestId),
    error: (event: string, data?: LogPayload) =>
      log('error', event, data, requestId),
  };
}
