import { checkSchema, driftLine } from './schema-check';
import { checkEmailSending } from './email';
import type { HealthFacts } from './site-health';

/**
 * Gathering the facts about whether SPEC is working — the one place that asks.
 *
 * Two screens answer "is it working": /status, which anybody can open without signing in, and the
 * cockpit, which is the one page the owner already has open. **They must never disagree.** Two
 * screens that ask the same question in two slightly different ways is how a business ends up
 * trusting whichever one it happened to look at, and this whole week has been about the cost of a
 * screen that was confidently wrong.
 *
 * So the asking lives here and both read from it. The split between them is about WHO, never about
 * WHAT:
 *
 *   /status  is public, because its job is answering "is it broken, or is it me?" at the moment
 *            signing in fails — a status page behind a sign-in is useless exactly when it matters.
 *
 *   /cockpit is private, and shows the same answer alongside the business, so the owner has one
 *            page rather than two.
 *
 * Nothing here names a business or a person, and settings are reported only as present or absent —
 * never a value, never a prefix, never a length.
 */

const REQUIRED = ['DATABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'APP_URL'] as const;
const OPTIONAL = ['RESEND_API_KEY', 'ANTHROPIC_API_KEY', 'STRIPE_SECRET_KEY'] as const;

const present = (k: string) => Boolean(process.env[k]?.trim());

/** The same probe /api/health uses: `select 1`, which reads no table and touches no business. */
async function database(): Promise<{ status: string; reason?: string }> {
  if (!present('DATABASE_URL')) return { status: 'not_configured' };
  try {
    const [{ db }, { sql }] = await Promise.all([import('@/db'), import('drizzle-orm')]);
    await Promise.race([
      db.execute(sql`select 1`),
      new Promise((_, reject) => setTimeout(() => reject(new Error('No answer within 5 seconds')), 5000)),
    ]);
    return { status: 'ok' };
  } catch (err) {
    return { status: 'failed', reason: plainly(err) };
  }
}

/**
 * What went wrong, in words a person can act on.
 *
 * The first version passed the driver's own message straight through, and the page — the one whose
 * entire job is plain English — read "Signing in will fail. Failed query: select 1 params:". That
 * is not an explanation, it is a stack trace wearing a sentence's clothes, and it appears at the
 * exact moment somebody is worried and needs to know what to do.
 *
 * So the handful of things that actually go wrong are named, and anything unrecognised is reported
 * as unrecognised rather than dressed up. A connection string is stripped either way: a page that
 * anybody can open is not a place to print credentials.
 */
function plainly(err: unknown): string {
  /*
    Look through the whole chain, not just the top.

    Drizzle wraps the driver's error, so the outermost message is "Failed query: select 1" and the
    thing that actually happened — connection refused, wrong password — is underneath it in `cause`.
    Reading only the top produced a page that said the reason was not recognised while the reason
    sat one level down.
  */
  const chain: unknown[] = [];
  for (let e: unknown = err, depth = 0; e && depth < 5; depth++) {
    chain.push(e);
    e = (e as { cause?: unknown }).cause;
  }
  const message = chain.map(e => (e as { message?: string })?.message ?? '').join(' | ');
  const code = chain.map(e => (e as { code?: string })?.code ?? '').join(' ');

  if (/authentication failed|password/i.test(message)) return 'The database refused the password it was given.';
  if (/ECONNREFUSED|ENOTFOUND|EHOSTUNREACH|could not connect|connect/i.test(`${code} ${message}`)) {
    return 'The database is not answering. It may be asleep, or the address it is reached at has changed.';
  }
  if (/No answer within|ETIMEDOUT|timeout/i.test(`${code} ${message}`)) {
    return 'The database took more than five seconds to answer, which means it is there but struggling.';
  }
  if (/does not exist|undefined table|relation/i.test(message)) {
    return 'The database answered but is missing something this version expects. A redeploy usually puts it right.';
  }
  // Unrecognised. Say so, and keep the first line only — never a query, never params, never a
  // connection string.
  const line = message.split('\n')[0].replace(/postgres(ql)?:\/\/\S+/gi, '[connection string]').trim();
  return line
    ? `The database refused the request, and the reason is not one SPEC recognises: ${line.slice(0, 120)}`
    : 'The database refused the request, and gave no reason.';
}

/**
 * Ask everything, once.
 *
 * The database and the email service are asked at the same time rather than one after the other:
 * each has its own timeout, and run in sequence a slow one makes the other look slow, on a page
 * somebody opens when they are already worried.
 */
export async function healthFacts(): Promise<HealthFacts> {
  const [db, email] = await Promise.all([database(), checkEmailSending()]);
  const shape = db.status === 'ok' ? await checkSchema() : { status: 'not_checked' as const };

  return {
    required: Object.fromEntries(REQUIRED.map(k => [k, present(k)])),
    optional: Object.fromEntries(OPTIONAL.map(k => [k, present(k)])),
    database: db,
    schema: shape.status === 'behind'
      ? { status: 'behind', says: driftLine(shape) }
      : { status: shape.status },
    email,
  };
}
