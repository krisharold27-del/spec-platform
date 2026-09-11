/** Where a magic-link email lands. Exchanges the one-time code for a session, then sends the
 * person on to wherever they were headed (default: /journey). */
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { safeNext } from '@/lib/auth-redirect';
import { markEmailProven } from '@/lib/auth';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  // Only ever a path inside SPEC — joining an unchecked value onto the origin is an open redirect.
  const next = safeNext(searchParams.get('next'));

  if (code) {
    const supabase = await createClient();
    // Unconfigured auth cannot honour a link; fall through to the sign-in page below.
    const { data, error } = supabase
      ? await supabase.auth.exchangeCodeForSession(code)
      : { data: null, error: { status: 503, code: 'not_configured', message: 'Supabase is not configured' } };
    if (!error) {
      // A link sent to the address was used — the address is proven theirs.
      if (data?.user) await markEmailProven(data.user.id);
      return NextResponse.redirect(`${origin}${next}`);
    }
    console.error('[auth/callback] code exchange failed', { status: error.status, code: error.code, message: error.message });
  }
  // Bad, expired or already-used link — say so on the sign-in page rather than failing silently.
  return NextResponse.redirect(`${origin}/signin?error=link`);
}
