import { checkSchema, driftLine } from '@/lib/schema-check';
import { checkEmailSending } from '@/lib/email';
import { lines, verdict, VERDICT_LINE, VERDICT_NOTE, type HealthFacts } from '@/lib/site-health';
import { LIGHT_INK } from '@/lib/today';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'SPEC — is it working?' };

/**
 * Is the live site working right now?
 *
 * `/api/health` has answered this since September, in JSON, for a machine. This is the same facts
 * for a person — because the one who most needs the answer is the owner, and the owner has been
 * finding out that something was wrong from a customer.
 *
 * **No sign-in.** A status page you have to sign in to read is useless in the one situation it
 * exists for, which is signing in being broken. It says nothing about any business, names no
 * customer, and reports settings only as present or absent — never a value, never a prefix, never
 * a length. That is the same contract /api/health already keeps.
 *
 * Nothing here is cached. A status page showing a cached answer is worse than no status page.
 */

const REQUIRED = ['DATABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'APP_URL'] as const;
const OPTIONAL = ['RESEND_API_KEY', 'ANTHROPIC_API_KEY', 'STRIPE_SECRET_KEY'] as const;
const present = (k: string) => Boolean(process.env[k]?.trim());

const TONE = {
  working: LIGHT_INK.green,
  limited: LIGHT_INK.amber,
  broken: LIGHT_INK.red,
} as const;

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
    const message = (err as { message?: string })?.message ?? 'Unknown error';
    return {
      status: 'failed',
      reason: /authentication failed|password/i.test(message)
        ? 'The database refused the password it was given.'
        // Belt and braces: the connection string can appear inside a driver's error text.
        : message.replace(/postgres(ql)?:\/\/\S+/gi, '[connection string]').slice(0, 160),
    };
  }
}

export default async function Status() {
  /*
    The database and the email service are asked at the same time rather than one after the other.
    Each has its own timeout; run in sequence a slow one would make the other look slow, and this
    is the page somebody opens when they are already worried.

    Email is ASKED, not assumed — a key that is present and refused is exactly the failure this
    page exists to catch. It sends nothing: a check that proves email works by emailing somebody
    spams them once per refresh.
  */
  const [db, email] = await Promise.all([database(), checkEmailSending()]);
  const shape = db.status === 'ok' ? await checkSchema() : { status: 'not_checked' as const };

  const facts: HealthFacts = {
    required: Object.fromEntries(REQUIRED.map(k => [k, present(k)])),
    optional: Object.fromEntries(OPTIONAL.map(k => [k, present(k)])),
    database: db,
    schema: shape.status === 'behind'
      ? { status: 'behind', says: driftLine(shape) }
      : { status: shape.status },
    email,
  };

  const rows = lines(facts);
  const overall = verdict(rows);

  return (
    <main className="mx-auto max-w-2xl px-5 py-12">
      <p className="label-caps">SPEC Business Solutions</p>
      <h1 className="mt-2 font-serif text-3xl text-ink" style={{ color: TONE[overall] }}>
        {VERDICT_LINE[overall]}
      </h1>
      <p className="mt-2 text-base text-ink-light">{VERDICT_NOTE[overall]}</p>

      <div className="mt-8 grid gap-3">
        {rows.map(r => (
          <div key={r.what} className="rounded-lg border border-ink/10 bg-surface p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-serif text-base text-ink">{r.what}</span>
              <span className="text-sm font-medium" style={{ color: TONE[r.severity] }}>
                {r.severity === 'working' ? 'Working' : r.severity === 'limited' ? 'Not switched on' : 'Not working'}
              </span>
            </div>
            <p className="mt-1 text-sm text-ink-light">{r.says}</p>
            {r.fix && (
              <p className="mt-2 rounded-lg bg-cream p-3 text-sm text-ink">
                <b>To fix it: </b>{r.fix}
              </p>
            )}
          </div>
        ))}
      </div>

      <p className="mt-8 text-xs text-ink-light">
        Checked just now, {new Date().toISOString().replace('T', ' ').slice(0, 16)} UTC. Refresh to
        check again — nothing on this page is remembered between visits. It names no business and no
        person, and never shows the value of a setting.
      </p>
    </main>
  );
}
