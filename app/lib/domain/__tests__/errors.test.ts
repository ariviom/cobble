import { describe, it, expect } from 'vitest';
import { throwAppErrorFromResponse } from '@/app/lib/domain/errors';

describe('AppError and throwAppErrorFromResponse', () => {
  it('throws AppError with code from JSON payload', async () => {
    const res = new Response(
      JSON.stringify({ error: 'search_failed', message: 'Search exploded' }),
      { status: 500 }
    );

    await expect(
      throwAppErrorFromResponse(res, 'unknown_error')
    ).rejects.toMatchObject({
      code: 'search_failed',
      status: 500,
      message: expect.stringContaining('Search exploded'),
    });
  });

  it('falls back to provided code and status text when body is not JSON', async () => {
    const res = new Response('not-json', {
      status: 503,
      statusText: 'Service Unavailable',
    });

    await expect(
      throwAppErrorFromResponse(res, 'inventory_failed')
    ).rejects.toMatchObject({
      code: 'inventory_failed',
      status: 503,
      message: expect.stringContaining('Service Unavailable'),
    });
  });
});



