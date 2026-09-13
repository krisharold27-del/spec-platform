import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Footer } from '@/components/ui';
import { getCurrentUser } from '@/lib/auth';
import { DEFAULT_AFTER_SIGN_IN } from '@/lib/auth-redirect';
import { SpecMark } from '@/components/spec-mark';
import { ProblemBox } from '@/components/problem-box';
import { SEAT_PRICES, HOME_CURRENCY, moneyLabel } from '@/lib/pricing';
import { IMPROVEMENT_ANCHOR } from '@/lib/calculator';
import { PILLAR_META } from '@/lib/pillars';

export const dynamic = 'force-dynamic';

/**
 * The front door — and it IS the address, not a page the address points at.
 *
 * SPEC has two pages that matter and this is the first of them:
 *
 *   specbizhq.com   this, for anybody who has not signed in.
 *   My page         for anybody who has. Everything inside the system opens from there.
 *
 * It used to live at /welcome with the root redirecting to it, which meant the landing page and
 * "welcome" were the same thing under two names — the same small confusion as My page living at
 * /today. One thing should have one name.
 *
 * Built to designs/SPEC Landing.dc.html, in its order: one word, then the thing everybody else is
 * selling struck out, then the box that asks for a real problem — and only after all of that, any
 * mention of what SPEC is or costs. Nothing is claimed before it is demonstrated. By the time a
 * price appears, the page has already told this person something true about their own business.
 *
 * The look-around is kept, further down, for people who would rather see the product than talk
 * about themselves. It is not in the design because it is a product decision rather than a visual
 * one; both doors lead to the same place and both are proven by scripts/journey.mjs.
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

export default async function Landing() {
  /*
    Somebody already signed in does not need the shopfront; they need their day.

    Guarded, and the guard is not defensive habit. This is the page every stranger sees, and it must
    render with NO database and NO sign-in service configured — a marketing site going down because
    a setting was missing is exactly how production broke on 11 September. Asking who somebody is
    can fail; the landing page never may. A failure here means "not signed in", which is both the
    safe answer and the true one for anybody it could happen to.
  */
  if (await getCurrentUser().catch(() => null)) redirect(DEFAULT_AFTER_SIGN_IN);

  return (
    <main className="min-h-screen bg-surface">
      {/*
        The only navigation on the site, and it exists because a stranger needs somewhere to go
        other than the one box. Inside the product there is no menu at all — see lib/doors.
      */}
      <nav className="border-b border-ink/10">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-6 py-3">
          <Link href="/" className="flex items-center gap-2.5 font-serif text-xl text-ink">
            <SpecMark size={44} />
            SPEC
          </Link>
          <Link href="/how" className="label-caps hover:text-rust">How it works</Link>
          <Link href="/sectors" className="label-caps hover:text-rust">Sectors</Link>
          <Link href="/pricing" className="label-caps hover:text-rust">Pricing</Link>
          <Link href="/signup" className="btn-primary ml-auto shrink-0">Start free</Link>
        </div>
      </nav>

      <div className="mx-auto max-w-4xl px-6">
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
      </div>

      {/*
        Full width on purpose. The ask sits on dark and the ground running edge to edge is what
        makes it read as a different moment rather than another panel on the same page. The answer
        comes back into the light. See components/problem-box.
      */}
      <ProblemBox />

      <div className="mx-auto max-w-4xl px-6">
        {/*
          What it is for, said once, after they have seen it work on their own problem.

          The figure is deliberately the one SPEC can stand behind: what a well run rollout RECOVERS
          of wasted labour, which is what lib/calculator models and every other page on this site
          already quotes. It is not an average across customers — SPEC has one — and saying
          otherwise would be a measured-sounding claim about results nobody has measured.
        */}
        <section className="mt-16">
          <div className="grid items-center gap-8 rounded-[32px] bg-sage-100 p-8 sm:grid-cols-2 sm:p-12">
            <div>
              <p className="max-w-[30ch] font-serif text-[22px] leading-snug text-ink">
                Are you getting the best out of your people? SPEC shows you in one place, for free,
                before you connect anything.
              </p>
              <Link href="/signup" className="btn-primary mt-6 inline-block">Start free</Link>
            </div>
            <div className="flex flex-wrap items-center gap-6">
              <p className="max-w-[26ch] flex-1 text-base leading-relaxed text-ink">
                What a well run rollout recovers of the labour a business is already losing.
              </p>
              <p className="font-serif text-[clamp(3.25rem,7vw,5.5rem)] leading-none text-sage-900">
                {IMPROVEMENT_ANCHOR}%
              </p>
            </div>
          </div>
        </section>

        <section className="mt-16">
          <span className="label-caps">Four questions. Answer honestly.</span>
          <h2 className="mt-5 max-w-[26ch] font-serif text-[clamp(1.75rem,3.2vw,2.5rem)] leading-tight text-ink">
            One yes is enough to need a system.
          </h2>
          <p className="mt-5 max-w-[54ch] text-base leading-7 text-ink-light">
            Safety, people, earnings, compliance — yes to any one of them and you need a system. Then
            you find out why, and that is where SPEC helps.
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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

        <section className="mt-16">
          <span className="label-caps">Pricing</span>
          <h2 className="mt-5 max-w-[22ch] font-serif text-[clamp(1.75rem,3.2vw,2.5rem)] leading-tight text-ink">
            Per seat, per month, in your own currency
          </h2>
          <p className="mt-3 max-w-[52ch] text-base leading-7 text-ink-light">
            A price is set for your region and never moves because an exchange rate did. You are
            billed where the business is.
          </p>
          <div className="mt-8 grid gap-5 sm:grid-cols-2">
            <div className="card p-8">
              <div className="label-caps">SPEC Basic</div>
              <div className="mt-3 font-serif text-[44px] leading-tight text-ink">
                {moneyLabel(HOME_CURRENCY, SEAT.seat)}
              </div>
              <p className="mt-1.5 text-sm text-ink-light">per seat, per month</p>
              <p className="mt-5 text-base leading-7 text-ink">
                The platform with no AI support: org chart, roles, monthly scoring, hard gates and the
                board pack. Every number typed by hand.
              </p>
              <Link href="/signup" className="btn-secondary mt-6 inline-block">Start free</Link>
            </div>
            <div className="rounded-lg bg-sage-100 p-8">
              <div className="label-caps text-sage-800">SPEC Advanced</div>
              <div className="mt-3 font-serif text-[44px] leading-tight text-ink">
                {moneyLabel(HOME_CURRENCY, SEAT.withTraining)}
              </div>
              <p className="mt-1.5 text-sm text-ink-light">per seat, per month</p>
              <p className="mt-5 text-base leading-7 text-ink">
                Everything in Basic, plus the connectors, KPIs fed from your systems, Claude on every
                page, and the AI paid for through SPEC.
              </p>
              <Link href="/pricing" className="btn-primary mt-6 inline-block">Talk to us</Link>
            </div>
          </div>
          <p className="mt-6 text-sm leading-7 text-ink-light">
            Building the business and setting the KPIs is free. Seats are charged once you start
            scoring, and a person on the chart without a seat is free and still scored.
          </p>
        </section>

        <section className="mt-14 pb-4">
          <div className="rounded-[32px] bg-sage-100 p-8 sm:p-14">
            <h3 className="max-w-[24ch] font-serif text-[28px] leading-tight text-ink">
              Your page opens as soon as a role has its KPIs
            </h3>
            <p className="mt-3.5 max-w-[54ch] text-base leading-7 text-ink-light">
              Set two numbers per pillar for one role and it fills in. Start with a work email.
            </p>
            <Link href="/signup" className="btn-primary mt-7 inline-block">Start free</Link>
            <p className="mt-5 text-sm text-ink-light">
              Already on SPEC? <Link href="/signin" className="underline">Sign in</Link>
            </p>
          </div>
        </section>

        <Footer />
      </div>
    </main>
  );
}
