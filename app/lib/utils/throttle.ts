/**
 * Lightweight async request throttler to control concurrency and pacing
 * for external API calls (e.g., Rebrickable).
 */
export class RequestThrottler {
  private queue: Array<() => Promise<void>> = [];
  private processing = false;
  private lastRequestTime = 0;

  constructor(
    private readonly minDelayMs: number = 100,
    private readonly maxConcurrent: number = 1
  ) {}

  async enqueue<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await fn();
          resolve(result);
        } catch (err) {
          reject(err);
        }
      });
      void this.process();
    });
  }

  private async process(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    try {
      while (this.queue.length > 0) {
        const elapsed = Date.now() - this.lastRequestTime;
        if (elapsed < this.minDelayMs) {
          await new Promise(resolve =>
            setTimeout(resolve, this.minDelayMs - elapsed)
          );
        }

        const tasks = this.queue.splice(0, this.maxConcurrent);
        this.lastRequestTime = Date.now();
        await Promise.all(tasks.map(task => task()));
      }
    } finally {
      this.processing = false;
    }
  }
}

// Shared Rebrickable throttler: ~10 req/sec max, single concurrency to be safe.
export const rebrickableThrottler = new RequestThrottler(100, 1);
