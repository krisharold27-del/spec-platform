import Link from 'next/link';
import { redirect } from 'next/navigation';
import { eq, desc } from 'drizzle-orm';
import { db, schema } from '@/db';
import { Shell } from '@/components/ui';
import { SubmitButton } from '@/components/submit-button';
import { getCurrentUser } from '@/lib/auth';
import { say } from './actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'SPEC — what would you change?' };

/**
 * The intake box.
 *
 * ── Open to everybody, and that asymmetry is the point ───────────────────────────────────────────
 *
 * The automation review itself is the narrowest page in SPEC — the Managing Director, the CEO and
 * the board. This one is the opposite: anybody signed in can write in it, from an apprentice to the
 * owner.
 *
 * That is deliberate and it is the whole mechanism. **The person doing the drudge knows exactly
 * where it is, and the person who could authorise removing it usually does not.** A supervisor
 * losing every Friday afternoon to chasing timesheets is the only reliable source for that fact,
 * and there has never been a way for them to say it that reaches a decision.
 *
 * ── What happens to what they write ──────────────────────────────────────────────────────────────
 *
 * It either raises the pain on work SPEC already knows about, or becomes a new task in its own
 * right. Either way it is scored with everything else and it reaches the review page. Pain is what
 * breaks the tie between two candidates that would save the same amount of time, so this is not a
 * suggestion box that goes nowhere — it changes the order things get built in.
 *
 * Their words are kept exactly as typed. Tidying somebody's complaint into better language is how
 * the reason it mattered gets lost.
 */
export default async function Intake({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect('/signin');

  const said = String(sp.said ?? '');
  const mine = await db.select().from(schema.intakeEntries)
    .where(eq(schema.intakeEntries.tenantId, user.tenantId))
    .orderBy(desc(schema.intakeEntries.createdAt))
    .limit(20);

  return (
    <Shell
      title="What would you change?"
      subtitle="Anything that wastes your time, or that you wish the system did for you."
    >
      {said === 'matched' && (
        <p className="mb-4 rounded-lg bg-cream p-3 text-sm text-ink">
          Thank you — that is already on the list, and you have just pushed it up it.
        </p>
      )}
      {said === 'new' && (
        <p className="mb-4 rounded-lg bg-cream p-3 text-sm text-ink">
          Thank you — that was not on the list. It is now.
        </p>
      )}

      <form action={say} className="card">
        <label className="block text-sm text-ink">
          In your own words. One thing, plainly.
          <textarea
            name="text"
            rows={3}
            required
            minLength={8}
            placeholder="I spend Friday afternoons chasing timesheets."
            className="mt-2 w-full rounded-lg border border-ink/20 p-3 text-sm"
          />
        </label>
        <p className="mt-2 text-sm text-ink-light">
          It goes to whoever decides what gets built, with your name on it so somebody can ask you
          what you meant. Nothing you write here changes anybody&apos;s scorecard.
        </p>
        <div className="mt-3">
          <SubmitButton className="btn-primary">Send it</SubmitButton>
        </div>
      </form>

      {mine.length > 0 && (
        <section aria-label="What people have said" className="card mt-4">
          <h2 className="font-serif text-lg text-ink">What people have said</h2>
          <p className="mt-1 text-sm text-ink-light">
            Shown so nobody writes the same thing twice, and so it is obvious this goes somewhere.
          </p>
          <ul className="mt-3 grid gap-2">
            {mine.map(e => (
              <li key={e.id} className="rounded-lg border border-ink/10 p-3 text-sm">
                <span className="text-ink">{e.text}</span>
                <span className="text-ink-light"> — {e.byName}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="mt-6 text-sm text-ink-light">
        <Link href="/today" className="underline">Back to today</Link>
      </p>
    </Shell>
  );
}
