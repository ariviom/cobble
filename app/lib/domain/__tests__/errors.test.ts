import { describe, it, expect } from 'vitest';
import { AppError, throwAppErrorFromResponse } from '@/app/lib/domain/errors';

describe('AppError and throwAppErrorFromResponse', () => {
  it('throws AppError with code from JSON payload', async () => {
    const res = new Response(
      JSON.stringify({ error: 'search_failed', message: 'Search exploded' }),
      { status: 500 }
    );

    let caught: unknown;
    try {
      // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
      await throwAppErrorFromResponse(res, 'unknown_error');
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(AppError);
    const appErr = caught as AppError;
    expect(appErr.code).toBe('search_failed');
    expect(appErr.status).toBe(500);
    expect(appErr.message).toContain('Search exploded');
  });

  it('falls back to provided code and status text when body is not JSON', async () => {
    const res = new Response('not-json', {
      status: 503,
      statusText: 'Service Unavailable',
    });

    let caught: unknown;
    try {
      // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
      await throwAppErrorFromResponse(res, 'inventory_failed');
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(AppError);
    const appErr = caught as AppError;
    expect(appErr.code).toBe('inventory_failed');
    expect(appErr.status).toBe(503);
    expect(appErr.message).toContain('Service Unavailable');
  });
});


