import Image from 'next/image';
import { Footer } from '@/components/ui';
import { SpecMark } from '@/components/spec-mark';
import { ProblemBox } from '@/components/problem-box';
import { SEAT_PRICES, HOME_CURRENCY, moneyLabel } from '@/lib/pricing';
import { PILLAR_META } from '@/lib/pillars';

/**
 * The front door.
 *
 * It stopped being a pitch. A stranger types one ongoing problem, watches SPEC work out what is
 * actually underneath it, and is asked whether they would like it fixed — and the problem they
 * typed is waiting in the middle of their page when they arrive. That is the same improvement
 * register somebody inside the product uses, which is the point: a problem raised before anybody
 * had an account is not a different kind of thing from one raised in month six.
 *
 * Nothing is claimed before it is demonstrated. By the time a price appears, the page has already
 * told this person something true about their own business.
 *
 * The look-around is kept, further down, for people who would rather see the product than talk
 * about themselves. Both doors lead to the same place.
 */

const SEAT = SEAT_PRICES[HOME_CURRENCY];

/** The four questions, in the design's own words. One yes is enough. */
const QUESTIONS = [
  { pillar: 'safety', ask: 'Do you have safety issues?' },
  { pillar: 'people', ask: 'Do you have people issues?' },
  { pillar: 'earnings', ask: 'Do you have earnings issues?' },
  { pillar: 'compliance', ask: 'Do you have compliance issues?' },
] as const;

/*
  The words everybody else is selling, struck out.

  Not a swipe at the category — SPEC uses every one of these. The point is that a business owner has
  been sold all eight and still cannot answer whether their people are going well, and the honest
  position is that horsepower was never what they were short of. Struck through rather than mocked
  in prose, because the reader supplies the feeling themselves and that lands harder than a sentence
  telling them to feel it.
*/
const BUZZWORDS = [
  'AI', 'Agents', 'Automation', 'Machine learning',
  'Dashboards', 'Integrations', 'Workflows', 'Platforms',
];

export default function Welcome() {
  return (
    <main className="min-h-screen bg-surface">
      <div className="mx-auto max-w-4xl px-6 py-16 sm:py-20">
        <header className="flex flex-wrap items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <SpecMark size={40} />
            <div className="label-caps">SPEC</div>
          </div>
          <p className="text-sm text-ink-light">
            Already on SPEC? <a href="/signin" className="underline">Sign in</a>
          </p>
        </header>

        {/*
          One word, and nothing else on the screen.

          Everything below this asks a business owner to think about something difficult, and the
          first thing they should feel is that this will not be hard. A whole viewport spent on a
          single word is expensive and that is exactly what makes the claim credible — a page that
          says "simple" while showing you nine panels is arguing against itself.
        */}
        <section
          aria-label="Simple"
          className="flex min-h-[52vh] items-center justify-center py-10 sm:min-h-[62vh]"
        >
          <p className="font-serif text-[clamp(3.5rem,11vw,9.375rem)] leading-none tracking-tight text-ink">
            Simple.
          </p>
        </section>

        <section aria-label="Everyone else" className="pb-16 text-center sm:pb-20">
          <div className="flex flex-wrap justify-center gap-x-[18px] gap-y-2.5">
            {BUZZWORDS.map(w => (
              <span
                key={w}
                className="text-[22px] font-semibold text-ink"
                style={{
                  textDecorationLine: 'line-through',
                  textDecorationThickness: '2.5px',
                  textDecorationColor: '#a63b26',
                }}
              >
                {w}
              </span>
            ))}
          </div>
          <p className="mt-8 font-serif text-[clamp(2rem,4.5vw,3.25rem)] leading-tight text-ink sm:mt-14">
            Everyone&rsquo;s selling you AI.
            <br />
            We make it work.
          </p>
          <p className="mx-auto mt-4 max-w-[54ch] text-[17px] leading-7 text-ink-light">
            Agents give you horsepower. SPEC gives you control — the layer that turns all of it into
            an actual, spectacular business.
          </p>
        </section>

        {/*
          The glider sits beside the box rather than above it. The supporting line is "nimble and
          powerful", and a glider is the smallest animal that carries its own weight a long way —
          which is the promise being made to a business with four managers and no back office.
        */}
        <div className="mt-10 flex flex-wrap items-start gap-8">
          <div className="min-w-[18rem] flex-1">
            <ProblemBox />
          </div>
          <Image
            src="/mascot.png"
            alt=""
            width={260}
            height={260}
            priority
            className="mx-auto hidden h-auto w-32 shrink-0 lg:block"
          />
        </div>

        <section className="mt-16">
          <h2 className="font-serif text-2xl text-ink">Four questions. Answer honestly.</h2>
          <p className="mt-2 text-base text-ink-light">
            One yes is enough to need a system. Then you find out why, and that is where SPEC helps.
          </p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {QUESTIONS.map(q => (
              <div key={q.pillar} className="card">
                <span className="badge-letter">{PILLAR_META[q.pillar].letter}</span>
                <div className="mt-3 label-caps">{PILLAR_META[q.pillar].name}</div>
                <p className="mt-1 text-sm text-ink">{q.ask}</p>
              </div>
            ))}
          </div>
        </section>

        {/*
          The other door. Somebody who would rather see the product than talk about themselves gets
          the look-around, and it asks them for nothing at all.
        */}
        <section className="callout mt-12">
          <div className="font-serif text-xl text-ink">Would rather just look?</div>
          <p className="mt-1 text-sm text-ink-light">
            One press puts you inside a real business with a real chart in it — no sign-up, no email,
            no card. You do not pay for a house before seeing inside it.
          </p>
          <a href="/look" className="btn-primary mt-4 inline-block">Have a look inside</a>
        </section>

        <section className="mt-12">
          <h2 className="font-serif text-2xl text-ink">What it costs</h2>
          <p className="mt-2 text-base text-ink-light">
            Per seat, per month, in your own currency. A price is set for your region and never moves
            because an exchange rate did — you are billed where the business is.
          </p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="card">
              <div className="label-caps">SPEC Basic</div>
              <div className="mt-2 font-serif text-3xl text-ink">{moneyLabel(HOME_CURRENCY, SEAT.seat)}</div>
              <p className="mt-1 text-sm text-ink-light">per seat, per month</p>
              <p className="mt-3 text-sm text-ink-light">
                The platform with no AI support: org chart, roles, monthly scoring, hard gates and the
                board pack. Every number typed by hand.
              </p>
            </div>
            <div className="card" style={{ borderTopColor: 'var(--rust, #c67139)', borderTopWidth: 4 }}>
              <div className="label-caps">SPEC Advanced</div>
              <div className="mt-2 font-serif text-3xl text-ink">{moneyLabel(HOME_CURRENCY, SEAT.withTraining)}</div>
              <p className="mt-1 text-sm text-ink-light">per seat, per month</p>
              <p className="mt-3 text-sm text-ink-light">
                Everything in Basic, plus the connectors, KPIs fed from your systems, Claude on every
                page, and the AI paid for through SPEC.
              </p>
            </div>
          </div>
          <p className="mt-4 text-sm text-ink-light">
            Building the business and setting the KPIs is free. Seats are charged once you start
            scoring, and a person on the chart without a seat is free and still scored.
          </p>
        </section>

        <p className="mt-12 flex flex-wrap gap-x-4 gap-y-2 text-sm">
          <a href="/how" className="text-rust-700 underline">How it works</a>
          <a href="/sectors" className="text-rust-700 underline">What it looks like in your industry</a>
          <a href="/pricing" className="text-rust-700 underline">What it costs, at your numbers</a>
        </p>
        <Footer />
      </div>
    </main>
  );
}
