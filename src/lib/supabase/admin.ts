/**
 * Service-role Supabase client — the only place SUPABASE_SERVICE_ROLE_KEY is used. Server-only:
 * this key bypasses RLS entirely, so it must never reach the browser or a client component.
 * Used for the /admin "sign in as" support tool (generates a magic link for another user).
 */
import { createClient } from '@supabase/supabase-js';

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY is not set.');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
