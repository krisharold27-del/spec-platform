import { NextResponse, type NextRequest } from 'next/server';
import { endLook } from '@/lib/look';

/**
 * "Not for me" — drop the look-around key, then say thanks.
 *
 * The key used to be dropped by /look/thanks while it rendered, and a page may not change cookies:
 * Next refused, and everybody who pressed "Not for me" got the error page instead of the thank-you.
 * A route handler may, so the cookie goes here and the thank-you page only says thank you.
 */
export async function GET(request: NextRequest) {
  await endLook();
  return NextResponse.redirect(new URL('/look/thanks', request.url));
}
