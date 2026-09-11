/**
 * Supabase client for use in Server Components, Server Actions and Route Handlers.
 * Reads/writes the auth cookies via next/headers — Server Components can read but not write
 * cookies, so a `setAll` there is expected to (harmlessly) throw; middleware refreshes the
 * session on every request so that's fine. See https://supabase.com/docs/guides/auth/server-side/nextjs
 */
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Returns null when Supabase is not configured, rather than throwing.
 *
 * The `!` assertions this replaces turned a missing setting into "Your project's URL and Key are
 * required", thrown deep inside a page render and surfaced as a 500 — on every page, including ones
 * that never needed a signed-in person. A missing setting is a deployment problem; it is not a
 * reason to show an error page to somebody reading the pricing.
 *
 * Every caller now decides what the absence means. Reading who is signed in treats it as NOBODY,
 * which is the only honest answer when the authentication service cannot be reached: the page then
 * sends them to /signin instead of breaking. Anything that WRITES — signing in, signing up, sending
 * a link — fails visibly, because silently doing nothing there would be worse.
 */
export async function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;

  const cookieStore = await cookies();
  return createServerClient(
    url,
    key,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
          } catch {
            // Called from a Server Component — middleware handles the actual refresh.
          }
        },
      },
    },
  );
}
