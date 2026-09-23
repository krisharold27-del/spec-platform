import { type NextRequest, NextResponse } from 'next/server';
import { updateSession } from './lib/supabase/middleware';
import { homeRedirect } from './lib/home-address';

export async function middleware(request: NextRequest) {
  // Old addresses move to www.sitevipapp.com before anything else happens — see lib/home-address.
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  const to = homeRedirect(host, request.nextUrl.pathname, request.nextUrl.search);
  if (to) return NextResponse.redirect(to, 308);
  return updateSession(request);
}

export const config = {
  matcher: [
    // Skip static assets and image optimisation files.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
