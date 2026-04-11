import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

const mockConstructEvent = vi.fn();

vi.mock('@/app/lib/stripe/client', () => ({
  getStripeClient: vi.fn(() => ({
    webhooks: {
      constructEvent: mockConstructEvent,
    },
  })),
  getStripeWebhookSecret: vi.fn(() => 'whsec_test'),
}));

const mockMaybeSingle = vi.fn();
const mockUpsert = vi.fn();

const mockEventsTable = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  maybeSingle: mockMaybeSingle,
  upsert: mockUpsert,
};

const mockSupabase = {
  from: vi.fn((table: string) => {
    if (table !== 'billing_webhook_events') {
      throw new Error(`Unexpected table ${table}`);
    }
    return mockEventsTable;
  }),
};

vi.mock('@/app/lib/supabaseServiceRoleClient', () => ({
  getSupabaseServiceRoleClient: vi.fn(() => mockSupabase),
}));

vi.mock('@/lib/metrics', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { POST } from '../webhook/route';

describe('POST /api/stripe/webhook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    mockConstructEvent.mockReturnValue({
      id: 'evt_123',
      type: 'invoice.paid',
      data: { object: {} },
    });
  });

  it('returns 500 when webhook event recording fails', async () => {
    mockUpsert.mockResolvedValue({
      error: { message: 'db unavailable' },
    });

    const req = new NextRequest('http://localhost/api/stripe/webhook', {
      method: 'POST',
      headers: {
        'stripe-signature': 't=1,v1=test',
      },
      body: '{}',
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBe('webhook_processing_failed');
  });
});
