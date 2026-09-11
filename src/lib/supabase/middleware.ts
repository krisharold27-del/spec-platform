/**
 * Refreshes the Supabase Auth session cookie on every request. Required by @supabase/ssr because
 * Server Components can't write cookies themselves — see src/lib/supabase/server.ts and
 * middleware.ts at the repo root.
 *
 * THIS RUNS ON EVERY REQUEST TO EVERY PAGE, so it is written to fail open.
 *
 * It used to do neither of the things below, and both are the same bug: a token refresh is a
 * convenience, and a convenience must never be able to take a page down. If Supabase is having an
 * outage, or a setting is missing after a deploy, an unguarded call here returns 500 for the whole
 * site — including the marketing pages, which have nothing to do with signing in and are the one
 * part that has to stay up while everything else is broken.
 *
 * What failing open actually costs: a session that was about to expire is not refreshed, so the
 * person is treated as signed out and sent to /signin by the page itself. That is the right outcome
 * when the authentication service cannot be reached, and far better than an error page for somebody
 * who only wanted to read the pricing.
 */
import { createServerClient } from '@supabase/ssr';
import { type NextRequest, NextResponse } from 'next/server';

/**
 * Auth cookies are kept for a year, not for the browser session.
 *
 * Somebody signs in once and then works. They lock the computer at five, open it at seven the next
 * morning, and SPEC is already there with the day on it — no password, no "session expired", no
 * friction between arriving at work and seeing the business. A cookie with no lifetime dies when
 * the browser closes, which would sign somebody out every single evening for no security benefit
 * anybody asked for: the session itself is still governed by the auth provider, and signing out
 * still works, so this only removes the accidental logouts.
 */
const A_YEAR = 60 * 60 * 24 * 365;
type CookieOptions = Parameters<NextResponse['cookies']['set']>[2];
/** Whatever the provider asked for, plus a lifetime if it did not give one. */
const keep = (options: CookieOptions): CookieOptions => ({ maxAge: A_YEAR, ...options });

/** A slow auth service must not hold every request on the site open behind it. */
const REFRESH_TIMEOUT_MS = 3000;

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  // Missing settings are a deployment problem, and /api/health reports them by name. They are not a
  // reason to refuse to serve a page that never needed them.
  if (!url || !key) return response;

  try {
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, keep(options));
        },
      },
    });

    // Touches the session so an expired token gets refreshed before any Server Component runs.
    await Promise.race([
      supabase.auth.getUser(),
      new Promise(resolve => setTimeout(resolve, REFRESH_TIMEOUT_MS)),
    ]);
  } catch {
    // Deliberately swallowed. Nothing that happens in here is worth a 500 — see the note at the top.
  }

  return response;
}
