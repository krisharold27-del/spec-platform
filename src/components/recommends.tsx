import Link from 'next/link';
import { after } from 'next/server';
import { getCurrentUser, canManage } from '@/lib/auth';
import { SubmitButton } from '@/components/submit-button';
import { decide } from '@/app/recommends/actions';
import { cardState, fingerprint, recheckLine, type Recommendation } from '@/lib/recommends';
import {
  recommendationFor, lastAnswer, wordsFor, wordInBackground, relevantAreas, switchReading, businessCounts,
} from '@/lib/recommends-data';
import { didYouKnow, ownPath, GUARANTEE, DAY_ONE, SHADOW_LINES, SHADOW_OFFER, type SwitchAreaKey } from '@/lib/switch';

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
  /** Who can own an action — for a fix accepted in the meeting. */
  owners?: string[];
  children?: React.ReactNode;
  /** Drawn inside another card: a soft ground instead of a second border. One card style, never nested boxes. */
  inset?: boolean;
}

export async function RecommendCard({ rec, tenantId, back, lead, owners = [], children, inset }: CardProps) {
  const [last, words] = await Promise.all([lastAnswer(tenantId, rec.topic), wordsFor(tenantId, rec)]);
  // Claude words it after the page has gone, so nobody waits on it. Next visit shows the wording.
  if (!words) after(() => wordInBackground(tenantId, rec));

  const state = cardState(rec, last);
  const fp = fingerprint(rec);
  const recentlyDone = last && last.answer === 'yes' && last.outcome === 'done'
    && Date.now() - Date.parse(last.decidedAt) < DONE_SHOWN_DAYS * 86_400_000;

  const needsOwner = rec.kind === 'recommend' && rec.action.type === 'meeting_action';
  const Answer = ({ answer, label, primary }: { answer: 'yes' | 'not_yet'; label: string; primary?: boolean }) => (
    <form action={decide} className="flex flex-wrap items-center gap-y-2">
      <input type="hidden" name="topic" value={rec.topic} />
      <input type="hidden" name="fingerprint" value={fp} />
      <input type="hidden" name="answer" value={answer} />
      <input type="hidden" name="back" value={back} />
      {needsOwner && answer === 'yes' && (
        owners.length ? (
          /*
            Nobody pre-selected (26 September). With no empty option this arrived set to whoever
            came first in the list, so pressing Yes without looking handed the action to them — and
            an action nobody agreed to own is an action nobody does. Who owns it IS the decision;
            the button only records that it was made.
          */
          <select name="owner" required defaultValue="" aria-label="Who owns it" className="mr-2 rounded-lg border border-ink/20 bg-surface px-3 py-2 text-sm">
            <option value="">Who owns it</option>
            {owners.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        ) : (
          <input name="owner" required maxLength={80} placeholder="Who owns it" aria-label="Who owns it" className="mr-2 rounded-lg border border-ink/20 bg-surface px-3 py-2 text-sm" />
        )
      )}
      <SubmitButton className={primary ? 'btn-primary px-4 py-2 text-sm' : 'btn-secondary px-4 py-2 text-sm'}>{label}</SubmitButton>
    </form>
  );

  /*
    Not yet is respected: the card folds to one quiet line, with the way back if they change their
    mind. No lead, no numbers, no guarantee — nothing that reads as asking again.
  */
  if (state === 'waiting' && last) {
    const again = rec.kind === 'recommend' ? rec.yes : rec.kind === 'missing' ? rec.interest?.yes : undefined;
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-cream px-3.5 py-2 text-sm" data-recommends={rec.topic} data-recommends-state="waiting">
        <span className="text-ink-light">{rec.headline} {recheckLine(last.decidedAt, rec.recheck)}</span>
        {again && <Answer answer="yes" label={again} />}
      </div>
    );
  }

  return (
    <article className={inset ? 'grid gap-2.5 rounded-xl bg-cream p-4 sm:p-5' : 'card grid gap-2.5'} data-recommends={rec.topic} data-recommends-state={state}>
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

      {/*
        What is still missing, folded to the headline's one line with "Show me" — Kris, on the live
        page: seven lines of it broke the brief. Split by whose move it is: what the business can do
        now, each with where, and what the product is still getting ready, in one line.
      */}
      {rec.kind === 'missing' && (() => {
        const yours = rec.missing.filter(m => m.side !== 'product');
        const theirs = rec.missing.filter(m => m.side === 'product');
        return (
          <details className="group text-sm" data-recommends-missing>
            <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-rust-700 hover:underline [&::-webkit-details-marker]:hidden">
              <span className="group-open:hidden">Show me</span>
              <span className="hidden group-open:inline">Hide</span>
            </summary>
            <div className="mt-3 grid gap-4">
              {yours.length > 0 && (
                <div data-recommends-yours>
                  <span className="label-caps">You can do now</span>
                  <ul className="mt-1.5 grid gap-1.5">
                    {yours.map(m => (
                      <li key={m.what}>
                        {m.href ? <Link href={m.href} className="text-ink hover:text-rust-700">{m.what} &rarr;</Link> : <span className="text-ink">{m.what}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {theirs.length > 0 && (
                <div data-recommends-theirs>
                  {theirs.map(m => <p key={m.what} className="text-ink-light">{m.what}</p>)}
                </div>
              )}
            </div>
          </details>
        );
      })()}

      {/* On a missing card the facts are the same list again — Show me already carries it. */}
      {rec.facts.length > 0 && rec.kind !== 'missing' && (
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
          <Answer answer="not_yet" label="Not yet" />
        </div>
      )}
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
  const rec = await recommendationFor(user.tenantId, topic, user);
  if (!rec) return null;
  return <RecommendCard rec={rec} tenantId={user.tenantId} back={back} />;
}

/**
 * Switch when ready — a card for each of these areas that shows up for this business, with the
 * "Did you know?" line, Kris's guarantee, and for accounting the Shadow offer.
 */
export async function SwitchCards({ areas, back, inset }: { areas: readonly SwitchAreaKey[]; back: string; inset?: boolean }) {
  const user = await viewer();
  if (!user) return null;
  const shown = (await relevantAreas(user.tenantId)).filter(a => areas.includes(a.key));
  if (!shown.length) return null;
  const counts = await businessCounts(user.tenantId);
  const readings = await Promise.all(shown.map(a => switchReading(user.tenantId, a, counts)));

  return (
    <div className="grid gap-3" data-switch-cards>
      {readings.map(r => (
        <RecommendCard key={r.area.key} rec={r.rec} tenantId={user.tenantId} back={back} inset={inset} lead={r.row ? undefined : didYouKnow(r.area)}>
          {r.area.key === 'accounting' && !r.row && (
            <div className="grid gap-1 rounded-xl bg-cream px-3.5 py-2.5 text-sm" data-shadow-offer>
              <span className="text-ink">{SHADOW_OFFER}</span>
              <span className="font-semibold text-ink">{SHADOW_LINES.join(' ')}</span>
            </div>
          )}
          <p className="text-xs leading-relaxed text-ink-light">
            <span data-own-path>{ownPath(r.area)}</span> <span data-guarantee>{GUARANTEE} {DAY_ONE}</span>
          </p>
        </RecommendCard>
      ))}
    </div>
  );
}
