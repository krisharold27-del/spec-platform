/**
 * Operator health check. Reports which environment variables are PRESENT — never their values —
 * and whether the database actually accepts the connection.
 *
 * Why this exists: src/db/index.ts throws at module load when DATABASE_URL is missing, which takes
 * down every page that touches the database as an opaque 500 (this is exactly how /signup and
 * /signin both failed on 7 September 2026). A setting can also be present and wrong — a rotated
 * database password lets /signin render and then fails the moment someone asks for a link. SPEC
 * support cannot look at tenant data to diagnose a problem, so the product has to be able to say
 * what is wrong about ITSELF without exposing anything.
 *
 * Deliberately says nothing about any tenant, and returns no secret values. The database probe is
 * `select 1`: it reads no table.
 */
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const REQUIRED = [
  'DATABASE_URL',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'APP_URL',
] as const;

const OPTIONAL = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'ANTHROPIC_API_KEY',
  'RESEND_API_KEY',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'ADMIN_EMAILS',
] as const;

const present = (k: string) => Boolean(process.env[k]?.trim());

type DatabaseCheck =
  | { status: 'ok' }
  | { status: 'not_configured' }
  // The Postgres error code and its generic message only (e.g. 28P01 / 08P01 = the password was
  // refused). Neither carries the connection string.
  | { status: 'failed'; code: string | null; reason: string };

async function checkDatabase(): Promise<DatabaseCheck> {
  if (!present('DATABASE_URL')) return { status: 'not_configured' };
  try {
    // Imported here, not at the top: a module-load throw in src/db must be reported, not crash this route.
    const [{ db }, { sql }] = await Promise.all([import('@/db'), import('drizzle-orm')]);
    await Promise.race([
      db.execute(sql`select 1`),
      new Promise((_, reject) => setTimeout(() => reject(Object.assign(new Error('No answer within 5 seconds'), { code: 'timeout' })), 5000)),
    ]);
    return { status: 'ok' };
  } catch (err) {
    const { code, message } = (err ?? {}) as { code?: string; message?: string };
    const reason = /authentication failed|password/i.test(message ?? '')
      ? 'The database refused the password in DATABASE_URL.'
      : (message ?? 'Unknown error').replace(/postgres(ql)?:\/\/\S+/gi, '[connection string]').slice(0, 160);
    return { status: 'failed', code: code ?? null, reason };
  }
}

export async function GET() {
  const missing = REQUIRED.filter(k => !present(k));
  const database = await checkDatabase();
  const ok = missing.length === 0 && database.status === 'ok';
  const body = {
    ok,
    // Names only. Never a value, never a prefix, never a length.
    required: Object.fromEntries(REQUIRED.map(k => [k, present(k)])),
    optional: Object.fromEntries(OPTIONAL.map(k => [k, present(k)])),
    missing,
    database,
    appUrl: process.env.APP_URL ?? null, // not a secret, and the usual thing that is wrong
    checkedAt: new Date().toISOString(),
  };
  return NextResponse.json(body, { status: ok ? 200 : 503 });
}
