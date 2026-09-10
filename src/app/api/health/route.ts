/**
 * Operator health check. Reports which environment variables are PRESENT — never their values.
 *
 * Why this exists: src/db/index.ts throws at module load when DATABASE_URL is missing, which takes
 * down every page that touches the database as an opaque 500 (this is exactly how /signup and
 * /signin both failed on 7 September 2026). SPEC support cannot look at tenant data to diagnose a
 * problem, so the product has to be able to say what is wrong about ITSELF without exposing anything.
 *
 * Deliberately says nothing about any tenant, and returns no secret values.
 */
import { NextResponse } from 'next/server';

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

export async function GET() {
  const missing = REQUIRED.filter(k => !present(k));
  const body = {
    ok: missing.length === 0,
    // Names only. Never a value, never a prefix, never a length.
    required: Object.fromEntries(REQUIRED.map(k => [k, present(k)])),
    optional: Object.fromEntries(OPTIONAL.map(k => [k, present(k)])),
    missing,
    appUrl: process.env.APP_URL ?? null, // not a secret, and the usual thing that is wrong
    checkedAt: new Date().toISOString(),
  };
  return NextResponse.json(body, { status: missing.length === 0 ? 200 : 503 });
}
