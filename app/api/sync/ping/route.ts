import { NextResponse } from 'next/server';

/**
 * Lightweight ping endpoint for sendBeacon on page unload.
 * Just acknowledges the ping - actual sync happens on next page load.
 */
export async function POST(): Promise<NextResponse> {
  return NextResponse.json({ ok: true });
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ ok: true });
}

