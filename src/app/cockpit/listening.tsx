import { desc, ne } from 'drizzle-orm';
import { db, schema } from '@/db';
import { SubmitButton } from '@/components/submit-button';
import { decideListening } from './actions';
import { listeningOn } from '@/lib/listening-data';

/**
 * siteVIP listening — what trades said in public last night, grouped, each with a proposed fix and
 * the links it came from. Nothing ships until Kris approves it (Design 20). The latest night's
 * themes, plus anything still waiting for a decision.
 */
export async function Listening() {
  const rows = await db.select().from(schema.listeningNotes)
    .where(ne(schema.listeningNotes.state, 'run'))
    .orderBy(desc(schema.listeningNotes.runAt)).limit(30);
  const [lastRun] = await db.select({ runAt: schema.listeningNotes.runAt }).from(schema.listeningNotes)
    .orderBy(desc(schema.listeningNotes.runAt)).limit(1);
  const waiting = rows.filter(r => r.state === 'proposed');
  const decided = rows.filter(r => r.state !== 'proposed').slice(0, 5);
  const listening = listeningOn();

  return (
    <section id="listening" className="card mt-6" data-listening>
      <h2 className="font-serif text-xl text-ink">siteVIP listening</h2>
      <p className="mt-1 max-w-2xl text-sm text-ink-light">
        Every night SPEC reads public forums and review sites about job software and siteVIP, groups
        what trades are saying, and drafts a fix. Nothing ships until you approve it. Small and quick
        beats big and slow.
      </p>
      <p className="mt-2 text-[13px] text-ink-light">
        {!listening ? 'Not listening: SPEC’s reading key is not set on this deployment.'
          : lastRun ? `Last listened ${new Date(lastRun.runAt).toLocaleString('en-AU', { timeZone: 'Australia/Sydney', dateStyle: 'medium', timeStyle: 'short' })}.`
          : 'Listens for the first time tonight.'}
        {' '}Public sources only — nothing any business has told SPEC is read for this.
      </p>
      {waiting.length > 0 && (
        <ul className="mt-4 grid gap-3">
          {waiting.map(r => {
            const sources: string[] = (() => { try { return JSON.parse(r.sources); } catch { return []; } })();
            return (
              <li key={r.id} className="rounded-2xl bg-cream p-4">
                <p className="text-sm font-semibold text-ink">{r.theme}</p>
                <p className="mt-1 text-sm text-ink">{r.heard}</p>
                <p className="mt-1 text-[13px] text-ink-light">
                  {sources.map((s, i) => <a key={i} href={s} rel="noopener noreferrer nofollow" target="_blank" className="mr-2 underline">{new URL(s).hostname}</a>)}
                </p>
                <p className="mt-2 text-sm text-ink"><strong>Proposed fix:</strong> {r.fix}</p>
                <form action={decideListening} className="mt-3 flex flex-wrap gap-2">
                  <input type="hidden" name="id" value={r.id} />
                  <SubmitButton className="btn-primary text-sm" pending="…" name="decision" value="approve">Approve</SubmitButton>
                  <SubmitButton className="btn-secondary text-sm" pending="…" name="decision" value="set_aside">Not now</SubmitButton>
                </form>
              </li>
            );
          })}
        </ul>
      )}
      {decided.length > 0 && (
        <ul className="mt-4 grid gap-1 text-[13px] text-ink-light">
          {decided.map(r => <li key={r.id}>{r.state === 'approved' ? 'Approved' : 'Set aside'} · {r.theme}</li>)}
        </ul>
      )}
    </section>
  );
}
