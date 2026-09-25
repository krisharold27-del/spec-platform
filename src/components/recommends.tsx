import Link from 'next/link';
import { after } from 'next/server';
import { getCurrentUser, canManage } from '@/lib/auth';
import { SubmitButton } from '@/components/submit-button';
import { decide } from '@/app/recommends/actions';
import { cardState, fingerprint, recheckLine, type Recommendation } from '@/lib/recommends';
import {
  recommendationFor, lastAnswer, wordsFor, wordInBackground, relevantAreas, switchReading, businessCounts,
} from '@/lib/recommends-data';
import { didYouKnow, GUARANTEE, DAY_ONE, SHADOW_LINES, SHADOW_OFFER, type SwitchAreaKey } from '@/lib/switch';

/**
 * Claude recommends — the card every decision SPEC helps with is drawn on.
 *
 * Three steps, the same everywhere: the recommendation with its reason and the numbers behind it (one
 * tap), "Ready to do this?" with Yes and Not yet, and on Yes a line saying it is done. Not enough to
 * recommend reads as exactly what is missing, never a guess. See lib/recommends.
 *
 * Headed "Claude recommends" only when Claude actually worded it; otherwise "SPEC recommends", over
 * the same figures. A label that claims a reading that did not happen is the kind of small untruth
 * this product keeps finding and removing.
 */

const DONE_SHOWN_DAYS = 7;

interface CardProps {
  rec: Recommendation;
  tenantId: string;
  /** Where the answer comes back to. */
  back: string;
  /** A line above the headline — "Did you know…". */
  lead?: string;
  children?: React.ReactNode;
}

export async function RecommendCard({ rec, tenantId, back, lead, children }: CardProps) {
  const [last, words] = await Promise.all([lastAnswer(tenantId, rec.topic), wordsFor(tenantId, rec)]);
  // Claude words it after the page has gone, so nobody waits on it. Next visit shows the wording.
  if (!words) after(() => wordInBackground(tenantId, rec));

  const state = cardState(rec, last);
  const fp = fingerprint(rec);
  const recentlyDone = last && last.answer === 'yes' && last.outcome === 'done'
    && Date.now() - Date.parse(last.decidedAt) < DONE_SHOWN_DAYS * 86_400_000;

  const Answer = ({ answer, label, primary }: { answer: 'yes' | 'not_yet'; label: string; primary?: boolean }) => (
    <form action={decide}>
      <input type="hidden" name="topic" value={rec.topic} />
      <input type="hidden" name="fingerprint" value={fp} />
      <input type="hidden" name="answer" value={answer} />
      <input type="hidden" name="back" value={back} />
      <SubmitButton className={primary ? 'btn-primary px-4 py-2 text-sm' : 'btn-secondary px-4 py-2 text-sm'}>{label}</SubmitButton>
    </form>
  );

  return (
    <article className="card grid gap-2" data-recommends={rec.topic} data-recommends-state={state}>
      <span className="label-caps">{words ? 'Claude recommends' : 'SPEC recommends'}</span>
      {lead && <p className="text-sm text-ink-light" data-recommends-lead>{lead}</p>}

      {recentlyDone && state !== 'done' && (
        <p className="text-sm text-ink" data-recommends-done>
          Done {new Date(last.decidedAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'long' })}. SPEC did what you said yes to, and it is logged with the numbers it was based on.
        </p>
      )}

      <h3 className="font-serif text-lg text-ink">{rec.headline}</h3>

      {words ? (
        <p className="text-sm text-ink">{words}</p>
      ) : rec.kind !== 'missing' ? (
        <p className="text-sm text-ink">{rec.reason}</p>
      ) : null}

      {rec.kind === 'missing' && (
        <div data-recommends-missing>
          <span className="text-sm text-ink">What’s still missing:</span>
          <ul className="mt-1 grid gap-1 text-sm">
            {rec.missing.map(m => (
              <li key={m.what} className="text-ink-light">
                {m.href ? <Link href={m.href} className="text-rust-700 hover:underline">{m.what}</Link> : m.what}
              </li>
            ))}
          </ul>
        </div>
      )}

      {rec.facts.length > 0 && (
        <details className="text-sm" data-recommends-facts>
          <summary className="cursor-pointer text-rust-700">The numbers behind it</summary>
          <dl className="mt-2 grid gap-1.5">
            {rec.facts.map(f => (
              <div key={f.label} className="flex flex-wrap justify-between gap-x-3 border-b border-ink/5 pb-1">
                <dt className="text-ink-light">{f.label}{f.note && <span className="block text-xs">{f.note}</span>}</dt>
                <dd className="font-semibold text-ink">{f.value}</dd>
              </div>
            ))}
          </dl>
        </details>
      )}

      {state === 'ask' && rec.kind === 'recommend' && (
        <div className="mt-1 grid gap-2">
          <span className="text-sm font-semibold text-ink">Ready to do this?</span>
          <div className="flex flex-wrap gap-2">
            <Answer answer="yes" label={rec.yes} primary />
            <Answer answer="not_yet" label="Not yet" />
          </div>
        </div>
      )}
      {state === 'missing' && rec.kind === 'missing' && rec.interest && (
        <div className="mt-1 flex flex-wrap gap-2">
          <Answer answer="yes" label={rec.interest.yes} primary />
        </div>
      )}
      {state === 'waiting' && last && <p className="text-sm text-ink-light" data-recommends-waiting>{recheckLine(last.decidedAt)}</p>}
      {state === 'done' && <p className="text-sm text-ink" data-recommends-done>Done. SPEC did it and logged the decision with the numbers above.</p>}
      {rec.kind === 'hold' && rec.link && (
        <Link href={rec.link.href} className="text-sm text-rust-700 hover:underline">{rec.link.label} &rarr;</Link>
      )}

      {children}
    </article>
  );
}

/** Whether this viewer is one the cards are for — anybody who manages. */
async function viewer() {
  const user = await getCurrentUser();
  return user && canManage(user.access) ? user : null;
}

/** One topic's card, reading its own recommendation. */
export async function Recommends({ topic, back }: { topic: string; back: string }) {
  const user = await viewer();
  if (!user) return null;
  const rec = await recommendationFor(user.tenantId, topic);
  if (!rec) return null;
  return <RecommendCard rec={rec} tenantId={user.tenantId} back={back} />;
}

/**
 * Switch when ready — a card for each of these areas that shows up for this business, with the
 * "Did you know?" line, Kris's guarantee, and for accounting the Shadow offer.
 */
export async function SwitchCards({ areas, back }: { areas: readonly SwitchAreaKey[]; back: string }) {
  const user = await viewer();
  if (!user) return null;
  const shown = (await relevantAreas(user.tenantId)).filter(a => areas.includes(a.key));
  if (!shown.length) return null;
  const counts = await businessCounts(user.tenantId);
  const readings = await Promise.all(shown.map(a => switchReading(user.tenantId, a, counts)));

  return (
    <div className="grid gap-3" data-switch-cards>
      {readings.map(r => (
        <RecommendCard key={r.area.key} rec={r.rec} tenantId={user.tenantId} back={back} lead={r.row ? undefined : didYouKnow(r.area)}>
          {r.area.key === 'accounting' && !r.row && (
            <div className="grid gap-1 rounded-xl bg-cream px-3.5 py-2.5 text-sm" data-shadow-offer>
              <span className="text-ink">{SHADOW_OFFER}</span>
              <span className="font-semibold text-ink">{SHADOW_LINES.join(' ')}</span>
            </div>
          )}
          <p className="text-xs text-ink-light" data-guarantee>{GUARANTEE} {DAY_ONE}</p>
        </RecommendCard>
      ))}
    </div>
  );
}
