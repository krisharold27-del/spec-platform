import Link from 'next/link';
import { SubmitButton } from '@/components/submit-button';
import { pillTone, LIGHT_INK, LIGHT_COLOUR } from '@/lib/today';
import { VERDICT_LABEL, VERDICT_MEANING, VERDICT_ORDER, WHY_RESTRICTED, type Verdict } from '@/lib/automation';
import type { AutomationReview as Review, RoleLine, ReviewedMeasure } from '@/lib/automation-data';
import { setVerdict } from '@/app/org/automation/actions';

/**
 * The automation review, as a leader reads it.
 *
 * ── The thing this screen must never become ──────────────────────────────────────────────────────
 *
 * A list of names with a machine's opinion of whether they are needed.
 *
 * So: no person is named beside a verdict without the role and the measure that produced it; every
 * verdict shows its reason in the same breath; nothing is presented as decided until somebody has
 * decided it; and the section that says what must STAY with a person is given the same weight as
 * the section that says what could move. A page that only lists what can be cut is a page that will
 * be used to cut things.
 */

/*
  Only three of the four verdicts get a colour, and that is the design decision here.

  The palette has exactly four lights — green, amber, red, pending — and red is absent on purpose:
  nothing on this page is a fault. `automated` is green because it is ready, not because it is good
  news for everybody; `assisted` is amber because something is needed before it can move; `unknown`
  is the warm grey the design system uses for not-yet-known.

  `person` gets no wash at all. It is the one verdict that asks nobody to do anything, and giving it
  a colour would put it in the same visual language as the things that need action — which is how a
  leader ends up scanning for the coloured rows and reading this as a list of what to cut. The
  absence is the point.
*/
const TONE: Record<Verdict, { background: string; color: string }> = {
  automated: pillTone('green'),
  assisted: pillTone('amber'),
  unknown: pillTone('pending'),
  person: { background: 'transparent', color: LIGHT_INK.pending },
};

export function AutomationReview({ review, saved }: { review: Review; saved: boolean }) {
  return (
    <>
      {saved && (
        <p className="mb-4 rounded-lg bg-cream p-3 text-sm text-ink">Saved.</p>
      )}

      <Confidentiality />

      {review.nothingConnected && <NothingConnected />}

      <Summary review={review} />

      {review.roles.map(r => <Role key={r.roleId} line={r} />)}

      {review.roles.length === 0 && (
        <p className="mt-6 text-sm text-ink-light">
          There are no roles on the chart yet, so there is nothing to review.{' '}
          <Link href="/org" className="underline">Draw the business first.</Link>
        </p>
      )}
    </>
  );
}

/*
  Said at the top, every time, and not as small print.

  Somebody will eventually screenshot this page into a group chat. That cannot be prevented in
  software, but it can be made unmistakable that doing so is a decision with consequences, on the
  page rather than in a policy nobody opened.
*/
function Confidentiality() {
  return (
    <div className="card" style={{ borderLeft: `3px solid ${LIGHT_COLOUR.amber}` }}>
      <div className="label-caps">Not to be forwarded</div>
      <p className="mt-1 text-sm text-ink-light">{WHY_RESTRICTED}</p>
    </div>
  );
}

function NothingConnected() {
  return (
    <div className="card mt-4">
      <h2 className="font-serif text-lg text-ink">Nothing is connected yet, so nothing can be read as ready</h2>
      <p className="mt-1 max-w-2xl text-sm text-ink-light">
        A process can only take over work whose numbers come from an agreed system rather than somebody's
        judgement each month. Until one is
        connected, the best any measure below can say is <b>{VERDICT_LABEL.assisted.toLowerCase()}</b> —
        worth doing, not yet possible unattended. That is an honest ceiling rather than a limitation of
        this page.{' '}
        <Link href="/connections" className="underline">Connect a system</Link> and this rereads itself.
      </p>
    </div>
  );
}

function Summary({ review }: { review: Review }) {
  const counts = review.roles.reduce((acc, r) => {
    for (const v of VERDICT_ORDER) acc[v] += r.review.counts[v];
    return acc;
  }, { person: 0, assisted: 0, automated: 0, unknown: 0 } as Record<Verdict, number>);

  return (
    <section aria-label="Across the business" className="card mt-4">
      <h2 className="font-serif text-lg text-ink">Across the business</h2>

      <div className="mt-3 grid gap-2 sm:grid-cols-4">
        {VERDICT_ORDER.map(v => (
          <div key={v} className="rounded-lg p-3" style={{ background: TONE[v].background }}>
            <div className="font-serif text-2xl" style={{ color: TONE[v].color }}>{counts[v]}</div>
            <div className="text-sm text-ink">{VERDICT_LABEL[v]}</div>
          </div>
        ))}
      </div>

      {/*
        The money, and the sentence that keeps it honest.

        `saving` counts only hours somebody actually stated, and says so when it counted fewer than
        it could have. That caveat is printed at the same size as the figure on purpose: a savings
        number a leader repeats to a board, and then cannot stand behind, would cost SPEC every other
        number on every other page.
      */}
      <p className="mt-4 text-sm text-ink">
        <b>What that is worth: </b>{review.total.line}
      </p>

      {review.wholeRoles.length > 0 && (
        <div className="mt-4 rounded-lg p-3" style={pillTone('amber')}>
          <div className="label-caps">Worth a conversation</div>
          {/*
            A conversation WITH them, not about them.

            Everything these roles are measured on could move. That is a statement about a scorecard
            and not about a person — the judgement, the relationships and the hundred things nobody
            wrote down are not on the card. The wording says the time comes back and asks what it
            should buy, and never reaches for the other sentence.
          */}
          <p className="mt-1 text-sm text-ink">
            Everything {review.wholeRoles.map(r => r.title).join(', ')}
            {review.wholeRoles.length === 1 ? ' is' : ' are'} measured on today could move to a
            process. A scorecard is not a job — so this is time coming back to
            {review.wholeRoles.length === 1 ? ' somebody' : ' people'} who already
            {review.wholeRoles.length === 1 ? ' does' : ' do'} more than it lists. Ask them what it
            should buy. Nobody has been told anything, and nothing here has been decided.
          </p>
        </div>
      )}
    </section>
  );
}

function Role({ line }: { line: RoleLine }) {
  const { review } = line;
  if (review.lines.length === 0) return null;

  return (
    <section aria-label={line.title} className="card mt-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-serif text-lg text-ink">{line.title}</h2>
        <span className="text-sm text-ink-light">
          {line.holder ? line.holder : 'Nobody in it'} · {line.decided} of {review.lines.length} decided
        </span>
      </div>

      <p className="mt-1 max-w-2xl text-sm text-ink-light">{review.headline}</p>
      <p className="mt-1 text-sm text-ink-light">{line.saving.line}</p>

      <div className="mt-3 grid gap-2">
        {line.measures.map(m => (
          <Measure key={m.criterionId} line={m} />
        ))}
      </div>
    </section>
  );
}

/*
  Each measure carries its own criterion id, rather than being matched back by array position.

  Position-matching worked, and would have kept working right up until somebody filtered or sorted
  one of the two arrays — at which point a leader's decision would be written against a different
  person's measure, silently, with nothing erroring anywhere.
*/
function Measure({ line }: { line: ReviewedMeasure }) {
  const criterionId = line.criterionId;
  const tone = TONE[line.verdict];
  return (
    <form action={setVerdict} className="rounded-lg border border-ink/10 p-3">
      <input type="hidden" name="criterionId" value={criterionId} />

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm text-ink">{line.text}</span>
        <span className="rounded px-2 py-0.5 text-sm" style={tone}>
          {VERDICT_LABEL[line.verdict]}
        </span>
      </div>

      {/* The reason, always beside the verdict. A verdict with no reason is an opinion. */}
      <p className="mt-1 text-sm text-ink-light">{line.why}</p>

      <div className="mt-2 flex flex-wrap items-end gap-2">
        <label className="text-sm text-ink-light">
          Your answer
          <select name="verdict" defaultValue={line.verdict} className="ml-2 rounded border border-ink/20 p-1 text-sm">
            {VERDICT_ORDER.map(v => (
              <option key={v} value={v} title={VERDICT_MEANING[v]}>{VERDICT_LABEL[v]}</option>
            ))}
          </select>
        </label>

        {/*
          Hours, asked for plainly and never guessed.

          The placeholder says what happens if it is left alone, because the honest behaviour is
          surprising: a blank contributes NOTHING to the savings figure rather than a small
          estimate. Somebody who assumed otherwise would under-report their own case.
        */}
        <label className="text-sm text-ink-light">
          Hours a month
          <input
            name="hours"
            type="number"
            min="0"
            step="0.5"
            defaultValue={line.hoursPerMonth ?? ''}
            placeholder="left blank = not counted"
            className="ml-2 w-44 rounded border border-ink/20 p-1 text-sm"
          />
        </label>

        <SubmitButton className="btn-secondary text-sm">Save</SubmitButton>
      </div>
    </form>
  );
}
