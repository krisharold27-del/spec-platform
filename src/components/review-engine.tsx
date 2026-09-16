import Link from 'next/link';
import { SubmitButton } from '@/components/submit-button';
import { pillTone, LIGHT_INK } from '@/lib/today';
import { BUCKET_LABEL, BUCKET_MEANING, type Bucket } from '@/lib/tasks';
import { EFFORT_MEANING } from '@/lib/how-brief';
import { THREE_QUESTIONS, type Review, type Candidate } from '@/lib/review-engine';
import { decide, describeRole } from '@/app/org/automation/review-actions';

/**
 * The review, as a leader reads it: what to build, what to protect, and what is in the queue.
 *
 * ── The thing this screen must never become ──────────────────────────────────────────────────────
 *
 * A list of people with a machine's opinion of whether they are needed.
 *
 * So: Keep human is a section with the same weight as the others, headed as the JOB rather than as
 * a leftover. Nothing is presented as decided until somebody has decided it. Every item says why it
 * landed where it did and what it would actually take. And no sentence anywhere reaches for
 * headcount — the brief's words are *"here's the drudge we can take off your team."*
 */

const TONE: Record<Bucket, { background: string; color: string }> = {
  automate: pillTone('green'),
  streamline: pillTone('amber'),
  // No wash. Keep human asks nobody to do anything, and colouring it would put it in the same
  // visual language as the things that need action.
  keep_human: { background: 'transparent', color: LIGHT_INK.pending },
};

export function ReviewEngine({ review }: { review: Review }) {
  return (
    <>
      <Summary review={review} />
      {review.rolesWithNoTasks.length > 0 && <ThreeQuestions review={review} />}
      {review.queue.length > 0 && <Queue items={review.queue} />}
      <Candidates title="Worth starting on" items={review.top} lead />
      {review.backlog.length > 0 && (
        <Candidates title={`And ${review.backlog.length} more in the backlog`} items={review.backlog} />
      )}
      <KeepHuman items={review.keepHuman} />
      {review.rolesWithNoKpi.length > 0 && <NoKpi roles={review.rolesWithNoKpi} />}
    </>
  );
}

function Summary({ review }: { review: Review }) {
  const s = review.summary;
  return (
    <section aria-label="The review" className="card mt-4">
      <h2 className="font-serif text-lg text-ink">Across the business</h2>
      <p className="mt-1 max-w-2xl text-sm text-ink-light">{s.line}</p>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {(['automate', 'streamline', 'keep_human'] as const).map(b => (
          <div key={b} className="rounded-lg p-3" style={TONE[b]}>
            <div className="font-serif text-2xl" style={{ color: TONE[b].color }}>
              {b === 'keep_human'
                ? review.keepHuman.length
                : [...review.top, ...review.backlog].filter(c => c.bucket === b).length}
            </div>
            <div className="text-sm text-ink">{BUCKET_LABEL[b]}</div>
            <div className="mt-1 text-sm text-ink-light">{BUCKET_MEANING[b]}</div>
          </div>
        ))}
      </div>

      {/*
        The one number that will be quoted, and the sentence that keeps it honest. `summarise` counts
        only hours somebody actually stated and says how many it could not — see lib/tasks.
      */}
      {s.failingKpisAddressable > 0 && (
        <p className="mt-3 text-sm text-ink">
          <b>{s.failingKpisAddressable}</b> KPI{s.failingKpisAddressable === 1 ? '' : 's'} the
          business is currently missing would be moved by this work. That is why the order below is
          what it is.
        </p>
      )}
    </section>
  );
}

/*
  The queue.

  Approved items, which is literally the same rows in a different state — there is no second table,
  because a queue that can disagree with the list it came from is a queue that will.
*/
function Queue({ items }: { items: Candidate[] }) {
  return (
    <section aria-label="In the build queue" className="card mt-4">
      <h2 className="font-serif text-lg text-ink">In the build queue</h2>
      <p className="mt-1 text-sm text-ink-light">
        Approved. Each one has a brief somebody can pick up and build.
      </p>
      <ul className="mt-3 grid gap-2">
        {items.map(c => (
          <li key={c.id} className="rounded-lg border border-ink/10 p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-sm text-ink">{c.name}</span>
              <span className="text-sm text-ink-light">{c.roleTitle}</span>
            </div>
            <Brief c={c} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function Candidates({ title, items, lead }: { title: string; items: Candidate[]; lead?: boolean }) {
  if (!items.length) return null;
  return (
    <section aria-label={title} className="card mt-4">
      <h2 className="font-serif text-lg text-ink">{title}</h2>
      {lead && (
        <p className="mt-1 max-w-2xl text-sm text-ink-light">
          Ordered by what the business is currently missing, then by how much time it takes, then by
          how much it hurts the person doing it.
        </p>
      )}
      <div className="mt-3 grid gap-2">
        {items.map(c => <Item key={c.id} c={c} />)}
      </div>
    </section>
  );
}

function Item({ c }: { c: Candidate }) {
  return (
    <div className="rounded-lg border border-ink/10 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm text-ink">{c.name}</span>
        <span className="rounded px-2 py-0.5 text-sm" style={TONE[c.bucket]}>{BUCKET_LABEL[c.bucket]}</span>
      </div>
      <p className="mt-1 text-sm text-ink-light">
        {c.roleTitle}{c.holder ? ` · ${c.holder}` : ''}{c.source === 'intake' ? ' · somebody wrote this in' : ''}
      </p>
      <p className="mt-1 text-sm text-ink-light">{c.why}</p>

      {c.kpi?.met === false && (
        <p className="mt-1 text-sm" style={{ color: LIGHT_INK.amber }}>
          Feeds a KPI the business is currently missing: {c.kpi.text}
        </p>
      )}
      {c.needs.length > 0 && (
        <p className="mt-1 text-sm text-ink-light">
          Needs {c.needs.join(' and ')} connected first.{' '}
          <Link href="/connections" className="underline">Connections</Link>
        </p>
      )}

      <Brief c={c} />
      <Decide c={c} />
    </div>
  );
}

/* The HOW. A suggestion without a build path is noise — the brief's own rule. */
function Brief({ c }: { c: Candidate }) {
  const b = c.brief;
  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-sm text-ink-light">
        How it would work · {b.effort} — {EFFORT_MEANING[b.effort]}
      </summary>
      <div className="mt-2 rounded-lg bg-cream p-3 text-sm text-ink">
        <p><b>Starts when: </b>{b.trigger}</p>
        <p className="mt-2"><b>Steps</b></p>
        <ol className="ml-4 list-decimal">{b.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
        <p className="mt-2"><b>Touches: </b>{b.systems.join(', ')}</p>
        <p className="mt-2"><b>Guardrails</b></p>
        <ul className="ml-4 list-disc">{b.guardrails.map((g, i) => <li key={i}>{g}</li>)}</ul>
        {b.moves && <p className="mt-2"><b>KPI it moves: </b>{b.moves}</p>}
      </div>
    </details>
  );
}

function Decide({ c }: { c: Candidate }) {
  return (
    <form action={decide} className="mt-2 flex flex-wrap items-end gap-2">
      <input type="hidden" name="taskId" value={c.id} />
      <label className="text-sm text-ink-light">
        <select name="decision" defaultValue={c.state} className="rounded border border-ink/20 p-1 text-sm">
          <option value="proposed">Not decided</option>
          <option value="approved">Approve — build it</option>
          <option value="parked">Park it</option>
          <option value="rejected">Reject</option>
        </select>
      </label>
      {/*
        The reason is only ever needed for a rejection, and the engine refuses one without it. Asked
        for here rather than behind a second click, because a no somebody has to come back for is a
        no that gets given without one.
      */}
      <input
        name="reason"
        placeholder="if rejecting, one line saying why"
        className="w-64 rounded border border-ink/20 p-1 text-sm"
      />
      <SubmitButton className="btn-secondary text-sm">Save</SubmitButton>
    </form>
  );
}

/*
  Keep human — a section, not a leftover.

  The brief's other half, and the half that matters to everybody who is not being automated: a role
  a process cannot absorb is confirmed as a real job, and the person in it gets told plainly what is
  expected rather than being left to wonder.
*/
function KeepHuman({ items }: { items: Candidate[] }) {
  if (!items.length) return null;
  const byRole = new Map<string, Candidate[]>();
  for (const c of items) byRole.set(c.roleTitle, [...(byRole.get(c.roleTitle) ?? []), c]);

  return (
    <section aria-label="This is the job" className="card mt-4">
      <h2 className="font-serif text-lg text-ink">This is the job</h2>
      <p className="mt-1 max-w-2xl text-sm text-ink-light">
        {items.length} things a process cannot do. Not a leftover list — this is what the business is
        actually paying for, and what everything above exists to give people more room for.
      </p>
      <div className="mt-3 grid gap-3">
        {[...byRole.entries()].map(([role, tasks]) => (
          <div key={role}>
            <div className="label-caps">{role}</div>
            <ul className="mt-1 ml-4 list-disc text-sm text-ink">
              {tasks.map(t => <li key={t.id}>{t.name}</li>)}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

/*
  A role with no KPI is its own finding.

  The brief: "Role with no KPIs → still review it; flag 'no KPI — cannot measure' as its own
  finding." Skipping it quietly would hide the more serious problem underneath — a role nobody can
  tell is working or not.
*/
function NoKpi({ roles }: { roles: string[] }) {
  return (
    <section aria-label="Roles nothing is measured against" className="card mt-4">
      <h2 className="font-serif text-lg text-ink">Nothing is measured against these roles</h2>
      <p className="mt-1 max-w-2xl text-sm text-ink-light">
        {roles.join(', ')}. That is a finding in its own right and a bigger one than anything above:
        a role with no KPI is a role nobody can say is working.{' '}
        <Link href="/org" className="underline">Set what they are measured on</Link>.
      </p>
    </section>
  );
}

/*
  The three questions.

  For a role nobody has written a task list against. Deliberately three, deliberately plain, and the
  last one is the one that finds things nothing else does — people will describe their week in terms
  of what they are supposed to do, and name the drudge only when asked what they hate.
*/
function ThreeQuestions({ review }: { review: Review }) {
  const role = review.rolesWithNoTasks[0];
  return (
    <section aria-label="Roles with no task list" className="card mt-4">
      <h2 className="font-serif text-lg text-ink">
        {review.rolesWithNoTasks.length} role{review.rolesWithNoTasks.length === 1 ? ' has' : 's have'} no
        task list yet
      </h2>
      <p className="mt-1 max-w-2xl text-sm text-ink-light">
        {review.rolesWithNoTasks.map(r => r.title).join(', ')}. Three questions to whoever holds the
        role is enough to start. Ask them — their answers outrank anything SPEC guessed.
      </p>
      <form action={describeRole} className="mt-3 grid gap-2">
        <input type="hidden" name="roleId" value={role.roleId} />
        <div className="label-caps">{role.title}</div>
        {(['weekly', 'longest', 'hated'] as const).map((field, i) => (
          <label key={field} className="text-sm text-ink">
            {THREE_QUESTIONS[i]}
            <textarea
              name={field}
              rows={2}
              placeholder="One per line"
              className="mt-1 w-full rounded border border-ink/20 p-2 text-sm"
            />
          </label>
        ))}
        <div><SubmitButton className="btn-secondary text-sm">Add these</SubmitButton></div>
      </form>
    </section>
  );
}
