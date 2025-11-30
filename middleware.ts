import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // Middleware logic can go here if needed in the future
  // For now, this file exists primarily to exclude /_next/image from middleware processing
  return NextResponse.next();
}

// Exclude Next.js image optimization routes from middleware
// This prevents middleware from interfering with image loading
export const config = {
  matcher: ['/((?!_next/image|_next/static|_next/webpack-hmr|favicon.ico).*)'],
};

