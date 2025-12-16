import 'server-only';

const BASE = 'https://rebrickable.com/api/v3' as const;

const RB_MAX_ATTEMPTS = 3;
/** Request timeout in milliseconds (30 seconds) */
const RB_REQUEST_TIMEOUT_MS = 30_000;

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getApiKey(): string {
  const key = process.env.REBRICKABLE_API;
  if (!key) throw new Error('Missing REBRICKABLE_API env');
  return key;
}

/**
 * Create an AbortController with a timeout that automatically aborts after the
 * specified duration. Returns both the signal and a cleanup function to clear
 * the timeout if the request completes before it fires.
 */
function createTimeoutSignal(timeoutMs: number): {
  signal: AbortSignal;
  cleanup: () => void;
} {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort(new Error(`Request timed out after ${timeoutMs}ms`));
  }, timeoutMs);
  return {
    signal: controller.signal,
    cleanup: () => clearTimeout(timeoutId),
  };
}

/**
 * Fetch from Rebrickable API with retry/backoff support.
 */
export async function rbFetch<T>(
  path: string,
  searchParams?: Record<string, string | number>
): Promise<T> {
  const apiKey = getApiKey();
  const url = new URL(`${BASE}${path}`);
  if (searchParams) {
    for (const [k, v] of Object.entries(searchParams)) {
      url.searchParams.set(k, String(v));
    }
  }

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= RB_MAX_ATTEMPTS; attempt += 1) {
    const { signal, cleanup } = createTimeoutSignal(RB_REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        headers: { Authorization: `key ${apiKey}` },
        next: { revalidate: 60 * 60 },
        signal,
      });
      cleanup();

      if (res.ok) {
        return (await res.json()) as T;
      }

      const status = res.status;
      let bodySnippet = '';
      try {
        const text = await res.text();
        bodySnippet = text.slice(0, 200);
      } catch {
        // ignore body read errors
      }

      // Handle explicit rate limiting and transient upstream failures with
      // conservative backoff to avoid hammering Rebrickable.
      if (status === 429 || status === 503) {
        let delayMs = 0;

        // Honour Retry-After when present.
        const retryAfter = res.headers.get('Retry-After');
        if (retryAfter) {
          const asNumber = Number(retryAfter);
          if (Number.isFinite(asNumber) && asNumber > 0) {
            delayMs = asNumber * 1000;
          }
        }

        if (!delayMs && bodySnippet) {
          const match = bodySnippet.match(
            /Expected available in\s+(\d+)\s+seconds?/i
          );
          if (match) {
            const seconds = Number(match[1]);
            if (Number.isFinite(seconds) && seconds > 0) {
              delayMs = seconds * 1000;
            }
          }
        }

        if (!delayMs) {
          // Fallback: small exponential backoff capped at 5s.
          delayMs = Math.min(500 * attempt, 5000);
        }

        if (process.env.NODE_ENV !== 'production') {
          try {
            console.warn('Rebrickable throttled request', {
              path,
              attempt,
              status,
              delayMs,
            });
          } catch {
            // ignore logging failures
          }
        }

        if (attempt < RB_MAX_ATTEMPTS) {
          await sleep(delayMs);
          continue;
        }
      } else if (status >= 500 && status <= 599 && attempt < RB_MAX_ATTEMPTS) {
        // Generic transient upstream error – brief backoff.
        const delayMs = Math.min(300 * attempt, 2000);
        if (process.env.NODE_ENV !== 'production') {
          try {
            console.warn('Rebrickable upstream error, retrying', {
              path,
              attempt,
              status,
            });
          } catch {
            // ignore logging failures
          }
        }
        await sleep(delayMs);
        continue;
      }

      // cleanup() already called after fetch completed
      const err = new Error(
        `Rebrickable error ${status}${bodySnippet ? `: ${bodySnippet}` : ''}`
      );
      lastError = err;
      break;
    } catch (err) {
      cleanup();
      // Check if this is a timeout/abort error
      const isAbort =
        err instanceof Error &&
        (err.name === 'AbortError' || err.message.includes('timed out'));

      lastError =
        err instanceof Error
          ? err
          : new Error(`Rebrickable fetch failed: ${String(err)}`);

      // Don't retry timeout errors - they indicate slow upstream
      if (isAbort) {
        break;
      }

      if (attempt < RB_MAX_ATTEMPTS) {
        const delayMs = Math.min(300 * attempt, 2000);
        await sleep(delayMs);
        continue;
      }
    }
  }

  throw lastError ?? new Error('Rebrickable error: request failed');
}

/**
 * Fetch from an absolute URL (for pagination links) with retry/backoff support.
 */
export async function rbFetchAbsolute<T>(absoluteUrl: string): Promise<T> {
  const apiKey = getApiKey();
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= RB_MAX_ATTEMPTS; attempt += 1) {
    const { signal, cleanup } = createTimeoutSignal(RB_REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(absoluteUrl, {
        headers: { Authorization: `key ${apiKey}` },
        next: { revalidate: 60 * 60 },
        signal,
      });
      cleanup();

      if (res.ok) {
        return (await res.json()) as T;
      }

      const status = res.status;
      let bodySnippet = '';
      try {
        const text = await res.text();
        bodySnippet = text.slice(0, 200);
      } catch {
        // ignore body read errors
      }

      if (status === 429 || status === 503) {
        let delayMs = 0;
        const retryAfter = res.headers.get('Retry-After');
        if (retryAfter) {
          const asNumber = Number(retryAfter);
          if (Number.isFinite(asNumber) && asNumber > 0) {
            delayMs = asNumber * 1000;
          }
        }

        if (!delayMs && bodySnippet) {
          const match = bodySnippet.match(
            /Expected available in\s+(\d+)\s+seconds?/i
          );
          if (match) {
            const seconds = Number(match[1]);
            if (Number.isFinite(seconds) && seconds > 0) {
              delayMs = seconds * 1000;
            }
          }
        }

        if (!delayMs) {
          delayMs = Math.min(500 * attempt, 5000);
        }

        if (process.env.NODE_ENV !== 'production') {
          try {
            console.warn('Rebrickable throttled absolute request', {
              url: absoluteUrl,
              attempt,
              status,
              delayMs,
            });
          } catch {
            // ignore
          }
        }

        if (attempt < RB_MAX_ATTEMPTS) {
          await sleep(delayMs);
          continue;
        }
      } else if (status >= 500 && status <= 599 && attempt < RB_MAX_ATTEMPTS) {
        const delayMs = Math.min(300 * attempt, 2000);
        if (process.env.NODE_ENV !== 'production') {
          try {
            console.warn('Rebrickable upstream error (absolute), retrying', {
              url: absoluteUrl,
              attempt,
              status,
            });
          } catch {
            // ignore
          }
        }
        await sleep(delayMs);
        continue;
      }

      // cleanup() already called after fetch completed
      const err = new Error(
        `Rebrickable error ${status}${
          bodySnippet ? `: ${bodySnippet}` : ''
        } (absolute)`
      );
      lastError = err;
      break;
    } catch (err) {
      cleanup();
      // Check if this is a timeout/abort error
      const isAbort =
        err instanceof Error &&
        (err.name === 'AbortError' || err.message.includes('timed out'));

      lastError =
        err instanceof Error
          ? err
          : new Error(`Rebrickable absolute fetch failed: ${String(err)}`);

      // Don't retry timeout errors - they indicate slow upstream
      if (isAbort) {
        break;
      }

      if (attempt < RB_MAX_ATTEMPTS) {
        const delayMs = Math.min(300 * attempt, 2000);
        await sleep(delayMs);
        continue;
      }
    }
  }

  throw lastError ?? new Error('Rebrickable error: absolute request failed');
}
