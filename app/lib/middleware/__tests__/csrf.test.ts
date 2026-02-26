import { NextRequest, NextResponse } from 'next/server';
import { describe, expect, it, beforeEach } from 'vitest';

import { validateOrigin, withCsrfProtection } from '../csrf';

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

describe('withCsrfProtection', () => {
  const okHandler = async () => NextResponse.json({ ok: true });

  beforeEach(() => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.com';
  });

  it('passes GET requests through without CSRF checks', async () => {
    const wrapped = withCsrfProtection(okHandler);
    const req = new NextRequest('https://app.example.com/api/test', {
      method: 'GET',
    });
    const res = await wrapped(req);
    const json = await res.json();
    expect(json.ok).toBe(true);
  });

  it('returns 403 for invalid origin on POST', async () => {
    const wrapped = withCsrfProtection(okHandler);
    const req = new NextRequest('https://app.example.com/api/test', {
      method: 'POST',
      headers: { origin: 'https://evil.example.com' },
    });
    const res = await wrapped(req);
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe('forbidden');
  });

  it('returns 403 when origin is missing and no CSRF tokens', async () => {
    const wrapped = withCsrfProtection(okHandler);
    const req = new NextRequest('https://app.example.com/api/test', {
      method: 'POST',
      // No origin, no referer, no CSRF header/cookie
    });
    const res = await wrapped(req);
    expect(res.status).toBe(403);
  });

  it('passes through when origin is valid', async () => {
    const wrapped = withCsrfProtection(okHandler);
    const req = new NextRequest('https://app.example.com/api/test', {
      method: 'POST',
      headers: { origin: 'https://app.example.com' },
    });
    const res = await wrapped(req);
    const json = await res.json();
    expect(json.ok).toBe(true);
  });

  it('returns 403 when CSRF header does not match cookie', async () => {
    const wrapped = withCsrfProtection(okHandler);
    const req = new NextRequest('https://app.example.com/api/test', {
      method: 'POST',
      headers: {
        origin: 'https://app.example.com',
        'x-csrf-token': 'token-a',
        cookie: 'csrf_token=token-b',
      },
    });
    const res = await wrapped(req);
    expect(res.status).toBe(403);
  });

  it('passes when missing origin but CSRF header matches cookie', async () => {
    const wrapped = withCsrfProtection(okHandler);
    const req = new NextRequest('https://app.example.com/api/test', {
      method: 'POST',
      headers: {
        'x-csrf-token': 'matching-token',
        cookie: 'csrf_token=matching-token',
      },
    });
    const res = await wrapped(req);
    const json = await res.json();
    expect(json.ok).toBe(true);
  });
});
