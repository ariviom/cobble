import 'server-only';

/**
 * Result-based budget tracker for the identify pipeline.
 *
 * Replaces the thrown-error pattern of ExternalCallBudget: consumers call
 * `budget.withBudget(cb)` which returns `T | null` instead of throwing
 * when exhausted.
 */
export class PipelineBudget {
  private _remaining: number;

  constructor(budget: number) {
    this._remaining = budget;
  }

  /**
   * Try to consume `cost` units of budget.
   * Returns true if consumed, false if insufficient.
   */
  tryConsume(cost = 1): boolean {
    if (this._remaining < cost) {
      return false;
    }
    this._remaining -= cost;
    return true;
  }

  /**
   * Execute `cb` if budget allows; return null if exhausted.
   * This is the primary API for budget-gated calls.
   */
  async withBudget<T>(cb: () => Promise<T>): Promise<T | null> {
    if (!this.tryConsume()) return null;
    return cb();
  }

  get isExhausted(): boolean {
    return this._remaining <= 0;
  }

  get remaining(): number {
    return this._remaining;
  }
}
