/**
 * Supabase client for use in Server Components, Server Actions and Route Handlers.
 * Reads/writes the auth cookies via next/headers — Server Components can read but not write
 * cookies, so a `setAll` there is expected to (harmlessly) throw; middleware refreshes the
 * session on every request so that's fine. See https://supabase.com/docs/guides/auth/server-side/nextjs
 */
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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
