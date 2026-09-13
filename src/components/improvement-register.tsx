import { SubmitButton } from './submit-button';
import { ExampleChips } from './example-chips';
import { PILLAR_META } from '@/lib/pillars';
import { PILLARS } from '@/lib/scoring';
import { LIGHT_COLOUR, LIGHT_INK, pillTone } from '@/lib/today';
import {
  PRIORITY_LABEL, priorityOf, waitingOn, isOverdue, auditDue, snapScore,
  type RegisterEntry,
} from '@/lib/register';
import {
  logImprovement, assignImprovement, respondToImprovement,
  markImprovementDone, signOffImprovement,
} from '@/app/my-page/register-actions';

/**
 * The improvement register, on the page a person opens every morning.
 *
 * Two halves that are really one thing: a box to say what is wrong, and the list of everything
 * anybody said. The box is deliberately not an everyday prompt — "not for every day, this is for
 * when you stumble onto something real" — because a business asked daily for a problem will invent
 * one, and a register full of invented problems is worse than an empty one.
 */

/** Harm, money, people, everything else — the colour follows the same rule as every other light. */
const PRIORITY_LIGHT = ['red', 'amber', 'green', 'pending'] as const;

export function ImprovementBox({ canWrite, read }: { canWrite: boolean; read: boolean }) {
  return (
    <section className="card">
      <h2 className="font-serif text-xl text-ink">Improvement opportunity</h2>
      <p className="mt-1 text-sm text-ink-light">
        Not for every day — this is for when you stumble onto something real. Type it in plain words, an
        ongoing one rather than a one-off.{' '}
        {read
          ? 'SPEC works out what is really going on and where it starts.'
          : 'Then say which pillars it touches — on Basic you name them yourself.'}
      </p>
      {canWrite ? (
        <form action={logImprovement} className="mt-4 grid gap-2">
          <textarea
            id="improvement-text"
            className="input min-h-[84px] rounded-lg"
            name="text"
            required
            minLength={8}
            maxLength={2000}
            aria-label="What keeps happening?"
            placeholder="The yard is a mess every Monday morning and the crew lose an hour finding gear."
          />
          {/* Two tellings of one problem — see components/example-chips for why there are two. */}
          <ExampleChips target="improvement-text" />
          {/*
            Basic has no AI in it, so nothing is read for them. The entry is identical in every
            other way — ranked the same, assigned the same, signed off the same. The difference
            between the tiers is who does the thinking, never whether the feature exists.
          */}
          {!read && (
            <fieldset className="mt-1 grid gap-2">
              <legend className="label-caps">Which of the four does this touch?</legend>
              <div className="flex flex-wrap gap-4">
                {PILLARS.map(p => (
                  <label key={p} className="flex items-center gap-2 text-sm text-ink">
                    <input type="checkbox" name={`pillar.${p}`} />
                    {PILLAR_META[p].name}
                  </label>
                ))}
              </div>
              <label className="grid gap-1 text-xs text-ink-light">
                Who owns it, if you already know
                <input className="input" name="owner" placeholder="Leave blank if nobody owns it yet" />
              </label>
            </fieldset>
          )}
          <SubmitButton className="btn-primary justify-self-start" pending={read ? 'Reading it…' : 'Logging it…'}>
            Log it
          </SubmitButton>
        </form>
      ) : (
        <p className="mt-3 text-sm text-ink-light">
          You are looking around, so nothing is written down. In a real business this is where a problem
          gets logged and given an owner.
        </p>
      )}
    </section>
  );
}

export function ImprovementRegister({
  entries,
  me,
  people,
  canWrite,
}: {
  entries: RegisterEntry[];
  me: string;
  /** Names that can be given an entry — this person and everyone beneath them. */
  people: string[];
  canWrite: boolean;
}) {
  const snap = snapScore(entries);

  return (
    <section className="card">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-serif text-xl text-ink">Improvement register</h2>
        {/* Not a count of problems — a read of the engine. */}
        <span className="pill" style={pillTone(snap.early ? 'pending' : snap.pct! >= 75 ? 'green' : snap.pct! >= 45 ? 'amber' : 'red')}>
          {snap.early ? 'Snap Score — too early to read' : `Snap Score ${snap.pct}`}
        </span>
      </div>
      <p className="mt-1 text-sm text-ink-light">
        You see what you logged and what your direct reports logged or own — not the whole business. Ranked
        by impact: harm first, then money, then people, then everything else. Nothing here is deleted;
        closed problems become history you can look back on.
      </p>

      {entries.length === 0 ? (
        <p className="mt-4 text-sm text-ink-light">
          Nothing logged yet. That is a fine place to be — the box above is here for when something real
          turns up.
        </p>
      ) : (
        <ul className="mt-4 grid gap-3">
          {entries.map(entry => {
            const priority = priorityOf(entry);
            const light = PRIORITY_LIGHT[priority - 1];
            const overdue = isOverdue(entry);
            const audit = auditDue(entry);
            const mine = entry.owner === me;
            return (
              <li key={entry.id} className="card-inset" style={{ borderLeft: `4px solid ${LIGHT_COLOUR[light]}` }}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="pill" style={pillTone(light)}>{PRIORITY_LABEL[priority]}</span>
                  <span className="flex items-center gap-2">
                    {/* The causal chain, as letters. Colour is the score everywhere else, so the
                        letters carry the meaning here too — see Option D in lib/pillars. */}
                    {entry.bloom.map(b => (
                      <span
                        key={b.pillar}
                        title={`${PILLAR_META[b.pillar].name}${b.certainty === 'possible' ? ' — possible' : ''}`}
                        className="badge-letter h-6 w-6 text-xs"
                        style={{ opacity: b.certainty === 'possible' ? 0.5 : 1 }}
                      >
                        {PILLAR_META[b.pillar].letter}
                      </span>
                    ))}
                    {entry.recurrenceCount > 1 && (
                      <span className="label-caps" style={{ color: LIGHT_INK.red }}>
                        Raised {entry.recurrenceCount}×
                      </span>
                    )}
                    {entry.reopenCount > 0 && (
                      <span className="label-caps" style={{ color: LIGHT_INK.red }}>
                        Came back {entry.reopenCount}×
                      </span>
                    )}
                  </span>
                </div>

                <p className="mt-2 text-sm text-ink">{entry.text}</p>
                {entry.chain.length > 0 && (
                  <p className="mt-1 text-xs text-ink-light">
                    The fix, in order: {entry.chain.map(p => PILLAR_META[p].name).join(' → ')}.
                  </p>
                )}
                <p className="mt-2 text-xs text-ink-light">{waitingOn(entry)}</p>
                {overdue && (
                  <p className="mt-1 text-xs" style={{ color: LIGHT_INK.red }}>
                    Past its date — was due {entry.deadline}.
                  </p>
                )}
                {audit && (
                  <p className="mt-1 text-xs" style={{ color: LIGHT_INK.amber }}>
                    Signed off more than sixty days ago. Worth checking it actually stayed fixed.
                  </p>
                )}

                {canWrite && entry.status !== 'closed' && (
                  <div className="mt-3 flex flex-wrap items-end gap-2">
                    {/* No owner, or an owner who said it is not theirs — finding one is the job. */}
                    {!entry.owner && (
                      <form action={assignImprovement} className="flex flex-wrap items-end gap-2">
                        <input type="hidden" name="id" value={entry.id} />
                        <label className="grid gap-1 text-xs text-ink-light">
                          Who owns this?
                          <select className="input" name="owner" required aria-label="Owner" defaultValue="">
                            <option value="" disabled>Pick a person</option>
                            {people.map(p => <option key={p} value={p}>{p}</option>)}
                          </select>
                        </label>
                        <label className="grid gap-1 text-xs text-ink-light">
                          By when
                          <input className="input" type="date" name="deadline" aria-label="Deadline" />
                        </label>
                        <SubmitButton className="btn-primary shrink-0" pending="Assigning…">Assign</SubmitButton>
                      </form>
                    )}

                    {mine && entry.accepted === null && (
                      <>
                        <form action={respondToImprovement}>
                          <input type="hidden" name="id" value={entry.id} />
                          <input type="hidden" name="accepted" value="yes" />
                          <SubmitButton className="btn-primary" pending="…">Accept</SubmitButton>
                        </form>
                        <form action={respondToImprovement}>
                          <input type="hidden" name="id" value={entry.id} />
                          <input type="hidden" name="accepted" value="no" />
                          <SubmitButton className="btn" pending="…">Deny — not mine</SubmitButton>
                        </form>
                      </>
                    )}

                    {mine && entry.accepted === true && entry.status === 'open' && (
                      <form action={markImprovementDone}>
                        <input type="hidden" name="id" value={entry.id} />
                        <SubmitButton className="btn-primary" pending="…">Mark done</SubmitButton>
                      </form>
                    )}

                    {/* Signed off by somebody other than the person who did the work. One person
                        deciding their own work is finished is how a register fills with things that
                        were never actually fixed. */}
                    {entry.status === 'done' && !mine && (
                      <form action={signOffImprovement}>
                        <input type="hidden" name="id" value={entry.id} />
                        <SubmitButton className="btn-primary" pending="…">
                          Validate in the weekly meeting — sign it off
                        </SubmitButton>
                      </form>
                    )}
                    {entry.status === 'done' && mine && (
                      <p className="text-xs text-ink-light">
                        Somebody else signs this off — it goes to the weekly meeting.
                      </p>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
