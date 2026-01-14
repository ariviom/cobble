import { NextRequest } from 'next/server';
import { describe, expect, it, beforeEach } from 'vitest';

import { validateOrigin } from '../csrf';

describe('csrf validateOrigin', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.com';
    process.env.NEXT_PUBLIC_PREVIEW_URL = 'https://preview.example.com';
    process.env.NEXT_PUBLIC_STAGING_URL = 'https://staging.example.com';
  });

  it('returns missing for requests with no origin/referer', () => {
    const req = new NextRequest('https://app.example.com/api/test');
    expect(validateOrigin(req)).toBe('missing');
  });

  it('returns valid for allowed origins (origin header)', () => {
    const req = new NextRequest('https://app.example.com/api/test', {
      headers: { origin: 'https://app.example.com' },
    });
    expect(validateOrigin(req)).toBe('valid');
  });

  it('returns valid for allowed preview origin via referer', () => {
    const req = new NextRequest('https://app.example.com/api/test', {
      headers: { referer: 'https://preview.example.com/page' },
    });
    expect(validateOrigin(req)).toBe('valid');
  });

  it('returns invalid for disallowed origin', () => {
    const req = new NextRequest('https://app.example.com/api/test', {
      headers: { origin: 'https://evil.example.com' },
    });
    expect(validateOrigin(req)).toBe('invalid');
  });

  it('returns invalid for malformed referer', () => {
    const req = new NextRequest('https://app.example.com/api/test', {
      headers: { referer: '::::not-a-url::::' },
    });
    expect(validateOrigin(req)).toBe('invalid');
  });
});
