import { NextResponse, type NextRequest } from 'next/server';

/**
 * Optimistic check only (Next.js 16 "proxy", formerly middleware): no cookie on a
 * protected page → go to /login. It never calls the server; real verification
 * happens in server code (lib/session.ts), which also handles expired tokens.
 * It deliberately never redirects AWAY from /login: an expired cookie would
 * otherwise bounce between /login and /chat forever.
 */

const COOKIE = process.env.SESSION_COOKIE_NAME ?? 'crm_session';
const PUBLIC_PATHS = ['/login', '/docs'];

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (PUBLIC_PATHS.includes(pathname)) return NextResponse.next();

  if (!request.cookies.has(COOKIE)) {
    const url = new URL('/login', request.url);
    if (pathname !== '/') url.searchParams.set('next', pathname + search);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Not for API routes (they answer 401 themselves) or static files.
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|svg|ico)$).*)',
  ],
};
