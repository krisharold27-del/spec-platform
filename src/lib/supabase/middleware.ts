/**
 * Refreshes the Supabase Auth session cookie on every request. Required by @supabase/ssr because
 * Server Components can't write cookies themselves — see src/lib/supabase/server.ts and
 * middleware.ts at the repo root.
 */
import { createServerClient } from '@supabase/ssr';
import { type NextRequest, NextResponse } from 'next/server';

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
        },
      },
    },
  );

  // Touches the session so an expired token gets refreshed before any Server Component runs.
  await supabase.auth.getUser();
  return response;
}
