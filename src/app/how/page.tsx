import Link from 'next/link';
import { Footer } from '@/components/ui';
import { PublicNav } from '@/components/public-nav';
import { CHARTER } from '@/lib/charter';
import { MAX_STRETCH, MIN_MONTHS_TO_JUDGE, FULL_HISTORY_MONTHS, soundness } from '@/lib/targets';
import { HAND_BUILT_DISCOVERY_DAYS } from '@/lib/jcurve';
import { PILLAR_META, BRAND_COLOUR } from '@/lib/pillars';
import { LIGHT_COLOUR } from '@/lib/today';

export const metadata = { title: 'SPEC — how it works' };

/**
 * How it works: the four things SPEC actually stands on.
 *
 * Everything on this page is rendered from the SAME objects the product runs on — the charter comes
 * from lib/charter, the stretch band and the worked example come from lib/targets, the discovery
 * benchmark from lib/jcurve. Nothing here is prose restating a rule from memory.
 *
 * That is the point rather than a convenience. A marketing page that paraphrases the product drifts
 * from it within a release or two, and then the site is quietly making a claim the software no
 * longer honours. Here it cannot: change the rule and this page changes with it, or the build fails.
 */

/**
 * The worked example, computed rather than asserted.
 *
 * A business running at 40% gross profit, judged by the real function. The figures are a fictional
 * illustration and stay on this page: what a trade actually runs at is a fact about one business,
 * and putting a real one in the product would make SPEC fit exactly one customer.
 */
const ILLUSTRATION = [40.2, 38.9, 41.6, 39.4, 40.0, 42.1, 40.8, 41.2];
const example = (target: number) =>
  soundness({ target, actuals: ILLUSTRATION, direction: 'higher', unit: '%' });

const VERDICT_COLOUR = {
  too_easy: LIGHT_COLOUR.amber,
  sound: LIGHT_COLOUR.green,
  out_of_reach: LIGHT_COLOUR.red,
} as const;

export default function How() {
  const worked = [
    { target: 35, caption: 'Below what the business already does' },
    { target: 44, caption: 'Above it, inside what it has shown it can do' },
    { target: 50, caption: 'Further than it has ever reached' },
  ].map(x => ({ ...x, s: example(x.target) }));

  return (
    <div className="min-h-screen">
      <PublicNav current="/how" />

      <main className="mx-auto max-w-6xl px-6 py-10">
        <h1 className="font-serif text-3xl tracking-tight text-ink sm:text-4xl">
          Four questions, four commitments, and numbers nobody made up.
        </h1>
        <p className="mt-3 max-w-2xl text-base text-ink-light">
          SPEC is opinionated in a small number of places and silent everywhere else. These are the
          places, stated plainly enough to argue with.
        </p>

        {/* ── The Board Charter ─────────────────────────────────────────────── */}
        <section className="mt-12">
          <div className="label-caps">One</div>
          <h2 className="mt-1 font-serif text-2xl text-ink">The Board Charter</h2>
          <p className="mt-2 max-w-2xl text-base text-ink-light">
            Everything else in SPEC is negotiated — which roles exist, which measures sit under each
            pillar, what every target is. Four things are not. They are the same in every business, they
            are carried by pass-or-fail gates reported beside the score and never averaged into it, and a
            business that does not hold all four is not running SPEC.
          </p>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {CHARTER.map(c => (
              <div
                key={c.pillar}
                className="card"
                style={{ borderTopColor: BRAND_COLOUR[c.pillar], borderTopWidth: 4 }}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="label-caps" style={{ color: BRAND_COLOUR[c.pillar] }}>
                    {PILLAR_META[c.pillar].name}
                  </span>
                  <span className="label-caps">
                    {c.basis === 'absolute' ? 'Not negotiable' : 'Set from your own record'}
                  </span>
                </div>
                <h3 className="mt-2 font-serif text-lg leading-snug text-ink">{c.says}</h3>
                <p className="mt-3 text-sm text-ink-light">{c.because}</p>
              </div>
            ))}
          </div>

          <p className="mt-5 max-w-3xl text-sm text-ink-light">
            Three of the four are absolute: the figure is nought and it is never derived from what the
            business has been managing. Averaging a year of injuries into an achievable target is a
            statement about how many people you expect to hurt, and there is no version of that a board
            can sign.{' '}
            <b className="text-ink">Exactly one is earned</b>, and it is the money one — gross profit is
            the only one of the four that is a fact about your business rather than a line every business
            holds, so it is the only one SPEC cannot hand you.
          </p>
        </section>

        {/* ── Target soundness ──────────────────────────────────────────────── */}
        <section className="mt-14">
          <div className="label-caps">Two</div>
          <h2 className="mt-1 font-serif text-2xl text-ink">A target has to be earned, not agreed</h2>
          <p className="mt-2 max-w-2xl text-base text-ink-light">
            A target gets set in a room, everybody nods, and then it is never checked against anything
            again. A year later it has either been met every single month — so it was never a target — or
            missed every single month, so nobody is trying to meet it any more. Both look like a working
            scorecard from the outside.
          </p>

          <p className="mt-4 max-w-2xl text-base text-ink-light">
            So SPEC reads every target against your own closed months: the middle month of the last{' '}
            {FULL_HISTORY_MONTHS}, not the average, so one shutdown or one enormous job cannot reset what
            everybody is held to.
          </p>

          {/*
            The illustration runs through the real function. If the rule changes, these three cards
            change with it — a marketing example that is hand-written prose is a claim waiting to
            stop being true.
          */}
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            {worked.map(({ target, caption, s }) => (
              <div
                key={target}
                className="card"
                style={{
                  borderTopColor: VERDICT_COLOUR[s.verdict as keyof typeof VERDICT_COLOUR] ?? LIGHT_COLOUR.pending,
                  borderTopWidth: 4,
                }}
              >
                <div className="label-caps">Target {target}%</div>
                <div className="mt-2 font-serif text-2xl text-ink">
                  {s.verdict === 'too_easy' ? 'Too easy' : s.verdict === 'sound' ? 'Sound' : 'Out of reach'}
                </div>
                <p className="mt-2 text-xs text-ink-light">{caption}</p>
                <p className="mt-3 text-sm text-ink-light">{s.line}</p>
              </div>
            ))}
          </div>

          <p className="mt-4 max-w-3xl text-sm text-ink-light">
            The business above runs at {worked[0].s.actual}% across {worked[0].s.months} closed months, so
            the sound band is {worked[0].s.band?.from}% to {worked[0].s.band?.to}% — up to a fifth above
            what it already does. The fifth ({Math.round(MAX_STRETCH * 100)}%) and the{' '}
            {MIN_MONTHS_TO_JUDGE}-month minimum are judgements rather than laws, and they are written down
            so you can disagree with them. Under {MIN_MONTHS_TO_JUDGE} closed months SPEC declines to
            judge at all and says so, because a confident answer from evidence that does not support one
            is worse than no answer.
          </p>
          <p className="mt-3 max-w-3xl text-sm text-ink-light">
            The figures here are an illustration. What a business in your trade actually runs at is a fact
            about that business, and SPEC ships the rule that finds it rather than somebody else&rsquo;s
            number.
          </p>
        </section>

        {/* ── The shallow J curve ───────────────────────────────────────────── */}
        <section className="mt-14">
          <div className="label-caps">Three</div>
          <h2 className="mt-1 font-serif text-2xl text-ink">The shallow J curve</h2>
          <p className="mt-2 max-w-2xl text-base text-ink-light">
            Every transformation dips before it climbs. The dip is normally deep, and the reason is almost
            never the work — it is discovery. Weeks of interviews, spreadsheet archaeology and waiting on
            month end, during which nothing improves because nothing is visible yet.
          </p>

          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <div className="card">
              <div className="label-caps">The usual shape</div>
              <p className="mt-2 text-sm text-ink-light">
                Most of a quarter spent working out what is actually wrong. The business is paying for the
                engagement and for the disruption, and getting a picture in return.
              </p>
            </div>
            <div className="card" style={{ borderTopColor: LIGHT_COLOUR.green, borderTopWidth: 4 }}>
              <div className="label-caps">What changes it</div>
              <p className="mt-2 text-sm text-ink-light">
                Your systems already hold the picture. When they feed the KPIs, discovery collapses to the
                day they connect — there is nothing left to find out.
              </p>
            </div>
            <div className="card">
              <div className="label-caps">What is left</div>
              <p className="mt-2 text-sm text-ink-light">
                Execution. Getting people to do their jobs properly against numbers everybody can already
                see. That was always the part that moved anything.
              </p>
            </div>
          </div>

          <p className="mt-4 max-w-3xl text-sm text-ink-light">
            This is a deliberate feature rather than a happy accident, so SPEC measures it instead of
            claiming it. Inside the product every business sees its own curve: how long its discovery
            actually lasted against the {HAND_BUILT_DISCOVERY_DAYS} days a hand-built picture is assumed to
            take, how deep the dip went, and when it reached the standard —{' '}
            <b className="text-ink">including when that was slower than it should have been.</b> A page
            that can only ever congratulate the product is not a measurement.
          </p>
          <p className="mt-3 max-w-3xl text-sm text-ink-light">
            Discovery is the part SPEC shortens, and it is not the only thing that makes a dip deep. A
            target nobody can meet and a role nobody is in will both hold one open for months, so the same
            page measures those too, and names what would move each one.
          </p>
          <p className="mt-3 max-w-3xl text-sm text-ink-light">
            Being exact about which half of the price list this applies to:{' '}
            <b className="text-ink">the collapse is caused by connectors, so it happens on Advanced and
            not on Basic.</b>{' '}
            Basic is a complete way to run the whole system and it is not a shallow J curve. Saying
            otherwise would make every other number here worth less.
          </p>
        </section>

        {/* ── Conversation boards ───────────────────────────────────────────── */}
        <section className="mt-14">
          <div className="label-caps">Four</div>
          <h2 className="mt-1 font-serif text-2xl text-ink">Conversation boards</h2>
          <p className="mt-2 max-w-2xl text-base text-ink-light">
            Some things about how a business is run cannot be said to the person running it. Not because
            they are unsayable, but because hearing them from a consultant makes them an accusation, and
            an accusation gets argued with rather than absorbed.
          </p>
          <p className="mt-4 max-w-2xl text-base text-ink-light">
            A conversation board is a purpose-built picture, drawn from what the business already recorded,
            engineered to raise one specific question. The data does the confronting. Nobody has to.
          </p>

          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <div className="card">
              <div className="label-caps">Never labels the person</div>
              <p className="mt-2 text-sm text-ink-light">
                It shows what was recorded and stops. The reader reaches the conclusion, which is the only
                version of it anybody acts on.
              </p>
            </div>
            <div className="card">
              <div className="label-caps">Only ever about you</div>
              <p className="mt-2 text-sm text-ink-light">
                There is no way to open somebody else&rsquo;s. The moment a board can be pointed at a
                person it stops being a mirror and becomes surveillance.
              </p>
            </div>
            <div className="card">
              <div className="label-caps">Always carries the change</div>
              <p className="mt-2 text-sm text-ink-light">
                A realisation with no next action is just bad news about yourself. Every board names the
                one thing that would move it.
              </p>
            </div>
          </div>

          <p className="mt-4 max-w-3xl text-sm text-ink-light">
            The first three ask who decides here, who is actually in the room, and where things wait. None
            of them is a score, none counts towards anything, and nobody above you sees yours. They are
            compared against a described way of working and never against another person or another
            business — a board is exactly where a ranking would be most tempting and most damaging.
          </p>
        </section>

        <section className="callout mt-14">
          <h2 className="font-serif text-xl text-ink">What none of this does</h2>
          <p className="mt-2 max-w-3xl text-sm text-ink-light">
            No leaderboard, no ranking, no sorting people by score, not even anonymised. Nothing is emailed
            with your numbers in it. No AI writes a KPI, a target or a score. Nothing recalculates a month
            you have already closed. If you stop paying it goes read-only and export still works, because a
            business that has stopped paying still owns its own record.
          </p>
        </section>

        <div className="mt-10 flex flex-wrap items-center gap-4">
          <Link href="/signup" className="btn-primary inline-block">Start drawing your business</Link>
          <Link href="/pricing" className="text-sm text-rust-700 hover:underline">What it costs, at your numbers →</Link>
        </div>
        <p className="mt-2 text-xs text-ink-light">No card. Nothing bills until you invite somebody in.</p>

        <Footer />
      </main>
    </div>
  );
}
