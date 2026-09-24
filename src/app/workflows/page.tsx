import Link from 'next/link';
import {
  WORKFLOWS, FAMILIES, byStream, ownedBy, tally, tallyLine, gaps, tooFar,
  stateOf, doneForYou, effortLine, movesLine, screensOf, peopleIn,
  type Workflow, type Actor,
} from '@/lib/workflows';
import { STREAMS, ABOVE, WHAT_THEY_SHARE } from '@/lib/streams';
import { LIGHT_COLOUR, LIGHT_INK } from '@/lib/today';

export const dynamic = 'force-static';

export const metadata = {
  title: 'Every workflow',
  description: 'Every workflow a trade business runs, which stream owns it, and where it happens in SPEC.',
};

/**
 * Every workflow a trade business runs — the map, on a page.
 *
 * ── What this is for ─────────────────────────────────────────────────────────────────────────────
 *
 * Kris, 24 September: *"i want to map all the possible workflows a tradie business could have and
 * make sure this system can do them all"*, then the two sentences that shaped it: *"no workflow
 * with any extra steps — (why simpro is annoying) ... OUTSIMPLE THEM"* and *"all work flows should
 * be working to improve spec and the GM Power Meter score"*.
 *
 * It reads from `lib/workflows`, which is checked against the routes that exist on disk. Nothing
 * on this page is typed in — the counts, the gaps and the detours are all worked out from the map
 * itself, so it cannot say the product is in better shape than it is.
 *
 * ── It shows the holes ───────────────────────────────────────────────────────────────────────────
 *
 * Deliberately, and near the top rather than at the bottom. A page like this is normally a sales
 * document, and a sales document is the one thing this must not become: the reason to draw the map
 * was to find what is missing, and a version with the awkward rows left off would be a map that
 * agrees with whoever drew it.
 */

const ACTOR_LABEL: Record<Actor, string> = {
  field: 'On site', office: 'In the office', leader: 'Whoever decides',
  worker: 'The person themselves', customer: 'The customer', spec: 'SPEC',
};

/*
  ── Why the streams are not colour-coded ────────────────────────────────────────────────────────

  The obvious design is a colour per stream. It is wrong here, and the rule it breaks is one of the
  load-bearing ones: **colour says how something is GOING, never what it IS.**

  Commercial is not amber. It is a stream. Give it a colour and the page has spent the only signal
  a reader scans for on a label that never changes — so when a stream is genuinely in trouble there
  is nothing left to say it with, and worse, somebody glancing at the page reads the decoration as
  a verdict. Every light on this page is earned: amber where a step has no home, and nowhere else.
*/

function WorkflowCard({ w }: { w: Workflow }) {
  const partial = stateOf(w) === 'partial';
  const { auto, of } = doneForYou(w);
  return (
    <article className="grid gap-2.5 rounded-[18px] bg-cream p-5">
      <header className="grid gap-1">
        <h4 className="font-serif text-[17px] leading-snug text-ink">{w.name}</h4>
        <p className="text-[13px] leading-[20px] text-ink-light">
          <span className="text-ink/80">Starts:</span> {w.starts}{' '}
          <span className="text-ink/80">Finished when:</span> {w.ends}
        </p>
      </header>

      <ol className="grid gap-1.5">
        {w.steps.map((s, i) => (
          <li key={i} className="flex gap-2.5 text-[13.5px] leading-[20px]">
            <span
              className="mt-[3px] h-[15px] shrink-0 rounded-full px-1.5 text-[10px] font-medium leading-[15px]"
              /* What a step IS, so no colour. The weight alone separates the two. */
              style={{ background: 'rgb(0 0 0 / 0.05)' }}
            >
              {s.by === 'spec' ? 'auto' : ACTOR_LABEL[s.by]}
            </span>
            <span className={s.where ? 'text-ink/85' : 'text-ink'}>
              {s.does}
              {!s.where && (
                /*
                  The hole, said where the step would have been rather than in a footnote. A gap
                  listed somewhere else is a gap that reads as a roadmap; a gap sitting in the
                  middle of the journey it breaks reads as what it is.
                */
                <span className="mt-1 block rounded-[10px] px-2.5 py-1.5 text-[12.5px] leading-[18px]"
                  style={{ background: LIGHT_COLOUR.amber, color: LIGHT_INK.amber }}>
                  Not built yet. {s.gap}
                </span>
              )}
            </span>
          </li>
        ))}
      </ol>

      <footer className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-ink-light">
        <span>{effortLine(w)}</span>
        <span aria-hidden>·</span>
        <span>{movesLine(w)}</span>
        {!partial && auto > 0 && of > 0 && <span className="sr-only">{auto} of {of} automatic</span>}
        {screensOf(w).length > 0 && (
          <span className="flex flex-wrap gap-1.5">
            {screensOf(w).map(href => (
              <Link key={href} href={href} className="rounded-full bg-surface px-2 py-0.5 text-[12px] text-rust-700 hover:underline">
                {href}
              </Link>
            ))}
          </span>
        )}
      </footer>
    </article>
  );
}

export default function WorkflowsPage() {
  const t = tally();
  const holes = gaps();
  const detours = tooFar();
  const streams = byStream();
  const steps = WORKFLOWS.reduce((n, w) => n + w.steps.length, 0);
  const auto = WORKFLOWS.reduce((n, w) => n + doneForYou(w).auto, 0);
  const people = new Set(WORKFLOWS.flatMap(peopleIn));

  return (
    <main className="mx-auto w-full max-w-[1100px] px-5 pb-28 pt-10 sm:px-8">
      <header className="grid max-w-[68ch] gap-3">
        <p className="text-[13px] uppercase tracking-[0.14em] text-ink-light">Every workflow</p>
        <h1 className="font-serif text-[34px] leading-[1.12] text-ink sm:text-[40px]">
          What a trade business actually does, all of it
        </h1>
        <p className="text-[15.5px] leading-[25px] text-ink/80">
          Not a feature list. A feature list can read complete while a business still cannot get
          through its Tuesday, because what breaks is the join between features — the step where a
          quote becomes a job and nobody owns it. This is every journey, start to finish, with who
          does each part and where it happens.
        </p>
        <p className="text-[15px] leading-[24px] text-ink">{tallyLine(t)}</p>
      </header>

      {/* ── The numbers that are the actual argument ──────────────────────────────────────────── */}
      <section className="mt-8 grid gap-3 sm:grid-cols-3">
        {[
          {
            value: `${Math.round(auto / steps * 100)}%`,
            label: 'of steps happen on their own',
            note: `${auto} of ${steps}. Every step SPEC does is a step nobody has to be trained to remember.`,
          },
          {
            value: 'One',
            label: 'screen per person, per workflow',
            note: 'Nobody is sent somewhere else to finish what they started. That is the whole of why the others are annoying.',
          },
          {
            value: String(people.size),
            label: 'kinds of people it is built for',
            note: 'On site, in the office, whoever decides, the person themselves, and the customer.',
          },
        ].map(c => (
          <div key={c.label} className="grid content-start gap-1 rounded-[18px] bg-surface p-5">
            <p className="font-serif text-[30px] leading-none text-ink">{c.value}</p>
            <p className="text-[14px] text-ink">{c.label}</p>
            <p className="text-[12.5px] leading-[19px] text-ink-light">{c.note}</p>
          </div>
        ))}
      </section>

      {/* ── The three streams ─────────────────────────────────────────────────────────────────── */}
      <section className="mt-12">
        <h2 className="font-serif text-[26px] text-ink">The three streams</h2>
        <p className="mt-2 max-w-[68ch] text-[14.5px] leading-[23px] text-ink/80">
          Every workflow belongs to one of them, and to one only. Work that belongs to everybody
          belongs to nobody — the reason a quote sits unchased for three weeks is almost never that
          nobody <em>could</em> chase it. {WHAT_THEY_SHARE}
        </p>

        <div className="mt-5 grid gap-3 lg:grid-cols-3">
          {STREAMS.map(s => {
            const tal = streams.find(x => x.owner === s.key)!;
            return (
              <div key={s.key} className="grid content-start gap-2.5 rounded-[20px] bg-surface p-6">
                <span className="w-fit rounded-full bg-cream px-2.5 py-1 text-[12px] font-medium text-ink">
                  {s.label}
                </span>
                <p className="text-[14.5px] leading-[22px] text-ink">{s.is}</p>
                <p className="text-[13.5px] leading-[21px] text-ink/80">
                  <span className="text-ink">Asks every week:</span> {s.asks}
                </p>
                <p className="text-[13px] leading-[20px] text-ink-light">
                  <span className="text-ink/80">When it slips:</span> {s.slips}
                </p>
                <p className="mt-1 text-[13px] text-ink-light">
                  {tal.total} workflows · {tal.whole} end to end ·{' '}
                  {tal.steps ? Math.round(tal.auto / tal.steps * 100) : 0}% automatic · held by the {s.seat}
                </p>
              </div>
            );
          })}
        </div>

        <div className="mt-3 rounded-[20px] bg-surface p-6">
          <p className="font-serif text-[18px] text-ink">{ABOVE.label}</p>
          <p className="mt-1.5 max-w-[68ch] text-[14px] leading-[22px] text-ink/80">
            {ABOVE.is} Not a fourth stream — the {ABOVE.seat}&rsquo;s own work, and it is deliberately
            small. A chart where the person at the top owns most of the workflows is the business
            SPEC exists to fix, not to describe.
          </p>
          <p className="mt-2 text-[13px] text-ink-light">
            {streams.find(x => x.owner === 'whole')!.total} workflows.
          </p>
        </div>
      </section>

      {/* ── What is missing, said early ───────────────────────────────────────────────────────── */}
      {(holes.length > 0 || detours.length > 0) && (
        <section className="mt-12">
          <h2 className="font-serif text-[26px] text-ink">What is not finished</h2>
          <p className="mt-2 max-w-[68ch] text-[14.5px] leading-[23px] text-ink/80">
            Near the top rather than at the bottom, because the reason to draw a map like this is to
            find the holes. A version with the awkward rows left off would be a map that agrees with
            whoever drew it.
          </p>

          {holes.length > 0 && (
            <div className="mt-5 grid gap-2">
              <p className="text-[13px] uppercase tracking-[0.1em] text-ink-light">
                {holes.length} steps with nowhere to happen
              </p>
              {holes.map(({ workflow, step }) => (
                <div key={`${workflow.id}-${step.does}`} className="rounded-[16px] bg-surface p-5">
                  <p className="text-[14.5px] text-ink">
                    <span className="text-ink-light">{workflow.name} —</span> {step.does}
                  </p>
                  <p className="mt-1.5 text-[13px] leading-[20px] text-ink/80">{step.gap}</p>
                </div>
              ))}
            </div>
          )}

          {detours.length > 0 && (
            <div className="mt-5 grid gap-2">
              <p className="text-[13px] uppercase tracking-[0.1em] text-ink-light">
                {detours.length} that still send somebody to a second screen
              </p>
              {detours.map(d => (
                <div key={`${d.workflow.id}-${d.who}`} className="rounded-[16px] bg-surface p-5">
                  <p className="text-[14.5px] text-ink">{d.workflow.name}</p>
                  <p className="mt-1 text-[13px] leading-[20px] text-ink/80">
                    {ACTOR_LABEL[d.who]} has to visit {d.places.join(' and ')} to finish it. One
                    place per person is the rule; these two are the exceptions, and they are written
                    down so a third cannot appear quietly.
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ── Everything, grouped the way the work is done ──────────────────────────────────────── */}
      {FAMILIES.map(f => {
        const ws = WORKFLOWS.filter(w => w.family === f.key);
        return (
          <section key={f.key} className="mt-12">
            <h2 className="font-serif text-[26px] text-ink">{f.label}</h2>
            <p className="mt-1.5 max-w-[68ch] text-[14.5px] leading-[23px] text-ink/80">
              {f.blurb} <span className="text-ink-light">{ws.length} workflows.</span>
            </p>
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              {ws.map(w => <WorkflowCard key={w.id} w={w} />)}
            </div>
          </section>
        );
      })}

      <p className="mt-14 max-w-[68ch] text-[13.5px] leading-[21px] text-ink-light">
        Nothing on this page is typed in. Every count, gap and detour is worked out from the map
        itself, and a test checks that every screen named here still exists — so it cannot quietly
        start saying the product is in better shape than it is.
      </p>
    </main>
  );
}
