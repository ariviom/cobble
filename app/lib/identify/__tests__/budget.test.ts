import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/metrics', () => ({
  logger: { warn: vi.fn(), debug: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

import { PipelineBudget } from '../budget';

describe('PipelineBudget', () => {
  describe('tryConsume', () => {
    it('returns true and decrements when budget available', () => {
      const budget = new PipelineBudget(3);
      expect(budget.tryConsume()).toBe(true);
      expect(budget.remaining).toBe(2);
    });

    it('returns false when budget exhausted', () => {
      const budget = new PipelineBudget(0);
      expect(budget.tryConsume()).toBe(false);
      expect(budget.remaining).toBe(0);
    });

    it('respects custom cost', () => {
      const budget = new PipelineBudget(5);
      expect(budget.tryConsume(3)).toBe(true);
      expect(budget.remaining).toBe(2);
      expect(budget.tryConsume(3)).toBe(false);
      expect(budget.remaining).toBe(2);
    });

    it('drains to zero', () => {
      const budget = new PipelineBudget(2);
      expect(budget.tryConsume()).toBe(true);
      expect(budget.tryConsume()).toBe(true);
      expect(budget.tryConsume()).toBe(false);
      expect(budget.remaining).toBe(0);
    });
  });

  describe('withBudget', () => {
    it('calls cb and returns result when budget available', async () => {
      const budget = new PipelineBudget(1);
      const result = await budget.withBudget(() => Promise.resolve('ok'));
      expect(result).toBe('ok');
      expect(budget.remaining).toBe(0);
    });

    it('returns null without calling cb when exhausted', async () => {
      const budget = new PipelineBudget(0);
      const cb = vi.fn(() => Promise.resolve('should not run'));
      const result = await budget.withBudget(cb);
      expect(result).toBeNull();
      expect(cb).not.toHaveBeenCalled();
    });

    it('consumes one unit per call', async () => {
      const budget = new PipelineBudget(2);
      await budget.withBudget(() => Promise.resolve('a'));
      await budget.withBudget(() => Promise.resolve('b'));
      const result = await budget.withBudget(() => Promise.resolve('c'));
      expect(result).toBeNull();
      expect(budget.remaining).toBe(0);
    });

    it('returns null when callback throws', async () => {
      const budget = new PipelineBudget(2);
      const result = await budget.withBudget(() =>
        Promise.reject(new Error('API failure'))
      );
      expect(result).toBeNull();
      // Budget was consumed even though the call failed
      expect(budget.remaining).toBe(1);
    });

    it('does not propagate callback errors', async () => {
      const budget = new PipelineBudget(1);
      await expect(
        budget.withBudget(() => Promise.reject(new Error('boom')))
      ).resolves.toBeNull();
    });
  });

  describe('isExhausted', () => {
    it('returns false when budget remains', () => {
      expect(new PipelineBudget(1).isExhausted).toBe(false);
    });

    it('returns true when budget is zero', () => {
      expect(new PipelineBudget(0).isExhausted).toBe(true);
    });

    it('returns true after full consumption', () => {
      const budget = new PipelineBudget(1);
      budget.tryConsume();
      expect(budget.isExhausted).toBe(true);
    });
  });
});
