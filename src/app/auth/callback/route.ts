/** Where a magic-link email lands. Exchanges the one-time code for a session, then sends the
 * person on to wherever they were headed (default: /journey). */
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { safeNext } from '@/lib/auth-redirect';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  // Only ever a path inside SPEC — joining an unchecked value onto the origin is an open redirect.
  const next = safeNext(searchParams.get('next'));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
    console.error('[auth/callback] code exchange failed', { status: error.status, code: error.code, message: error.message });
  }
  // Bad, expired or already-used link — say so on the sign-in page rather than failing silently.
  return NextResponse.redirect(`${origin}/signin?error=link`);
}
