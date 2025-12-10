import { NextRequest } from 'next/server';
import { describe, expect, it, beforeEach } from 'vitest';

import { validateOrigin } from '../csrf';

describe('csrf validateOrigin', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.com';
    process.env.NEXT_PUBLIC_PREVIEW_URL = 'https://preview.example.com';
    process.env.NEXT_PUBLIC_STAGING_URL = 'https://staging.example.com';
  });

  it('allows requests with no origin/referer (same-origin navigation)', () => {
    const req = new NextRequest('https://app.example.com/api/test');
    expect(validateOrigin(req)).toBe(true);
  });

  it('allows allowed origins (origin header)', () => {
    const req = new NextRequest('https://app.example.com/api/test', {
      headers: { origin: 'https://app.example.com' },
    });
    expect(validateOrigin(req)).toBe(true);
  });

  it('allows allowed preview origin via referer', () => {
    const req = new NextRequest('https://app.example.com/api/test', {
      headers: { referer: 'https://preview.example.com/page' },
    });
    expect(validateOrigin(req)).toBe(true);
  });

  it('rejects disallowed origin', () => {
    const req = new NextRequest('https://app.example.com/api/test', {
      headers: { origin: 'https://evil.example.com' },
    });
    expect(validateOrigin(req)).toBe(false);
  });

  it('handles malformed referer safely', () => {
    const req = new NextRequest('https://app.example.com/api/test', {
      headers: { referer: '::::not-a-url::::' },
    });
    expect(validateOrigin(req)).toBe(false);
  });
});

