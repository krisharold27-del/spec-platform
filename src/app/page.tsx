import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Footer } from '@/components/ui';
import { getCurrentUser } from '@/lib/auth';
import { DEFAULT_AFTER_SIGN_IN } from '@/lib/auth-redirect';
import { SpecMark } from '@/components/spec-mark';
import { ProblemBox } from '@/components/problem-box';
import { SEAT_PRICES, HOME_CURRENCY, moneyLabel } from '@/lib/pricing';
import { TRACK_RECORD } from '@/lib/calculator';

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
 * Built to designs/SPEC Landing.dc.html — export 6, which stripped it back to one idea per section:
 * the wordmark and the word "Simple.", then the box that asks for a real problem, then the reading,
 * then the price. Nothing is claimed before it is demonstrated. By the time a price appears, the
 * page has already told this person something true about their own business.
 *
 * Two sections were deliberately removed in that export and are not to be reinstated without a
 * decision: the crossed-out buzzwords with the AI argument under them, and the four-question grid.
 * Both said true things. Both said them BEFORE the page had earned the right to, which is the one
 * thing this page is not allowed to do — and the argument they made is made better by the reading
 * itself, where a stranger watches it happen on their own problem instead of being told it works.
 * The order they defended is not lost: components/problem-box states it as the fix, at the moment
 * it is demonstrated.
 *
 * The look-around is kept, further down, for people who would rather see the product than talk
 * about themselves. It is not in the design because it is a product decision rather than a visual
 * one; both doors lead to the same place and both are proven by scripts/journey.mjs.
 */

const SEAT = SEAT_PRICES[HOME_CURRENCY];

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
          The hero is the word, set enormous. Cream ground, ink type, and a deliberately large gap
          underneath it.

          Everything below this asks a business owner to think about something difficult, and the
          first thing they should feel is that this will not be hard. A whole viewport spent on one
          word is expensive, and that expense is exactly what makes the claim credible — a page that
          says "simple" while showing you nine panels is arguing against itself.

          It was a wordmark PNG for two days, on a comment claiming "the design replaced it with the
          wordmark". The design does not. `SPEC Landing.dc.html` has NO `<img>` in it at all: the
          hero is one `<p>` in the heading face at clamp(56px,10vw,120px), and the export Kris sent
          on 16 September is byte-identical to the one in this repo, so it was never true for this
          export. What a stranger actually met was a rainbow gradient wordmark in cyan, magenta and
          orange — four colours that appear nowhere in the Organic palette — as the first thing on
          the front door of a company whose whole argument is restraint.

          The padding is asymmetric on purpose and copied from the design: a little above, a lot
          below. That gap is what makes the word land.
        */}
        <section
          aria-label="SPEC"
          className="flex items-center justify-center px-5 pt-12 pb-[clamp(140px,20vh,240px)] sm:pt-24"
        >
          <p className="m-0 font-serif text-[clamp(56px,10vw,120px)] leading-none text-ink">
            Simple.
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
          The strongest thing SPEC can say, said with its evidence — and the spreadsheet is the best
          part of it.

          Eighteen per cent is not a model or a projection: it is the average over the first twelve
          months, across more than thirty businesses in fifteen years. Eighteen rather than a round
          twenty on purpose — a round number is what a marketing department writes and an eighteen
          is what a measurement returns, and rounding up would cost more credibility than the two
          points could buy. Those businesses were run on a spreadsheet, and saying so
          answers the question every buyer of new software actually has — HAS THIS EVER WORKED
          BEFORE? Most new products cannot answer it at all. This one can answer it thirty times.

          The claim is attributed to the method, never to the platform's own user base. The method is
          fifteen years old; the software is new. See TRACK_RECORD in lib/calculator.
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
              <p className="max-w-[30ch] flex-1 text-base leading-relaxed text-ink">
                Average productivity improvement in the first{' '}
                <b className="text-ink">{TRACK_RECORD.months} months</b>, across{' '}
                <b className="text-ink">{TRACK_RECORD.businesses}+ businesses</b> over{' '}
                <b className="text-ink">{TRACK_RECORD.years} years</b>.
                <span className="mt-2 block text-sm text-ink-light">
                  Every one of them run on a spreadsheet. SPEC is the same method, built properly.
                </span>
              </p>
              <p className="font-serif text-[clamp(3.25rem,7vw,5.5rem)] leading-none text-sage-900">
                {TRACK_RECORD.improvement}%
              </p>
            </div>
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
            billed where the business is, and <b className="text-ink">the first seat is free</b>.
          </p>
          <div className="mt-8 grid gap-5 sm:grid-cols-2">
            <div className="card p-8">
              <div className="label-caps">A seat</div>
              <div className="mt-3 font-serif text-[44px] leading-tight text-ink">
                {moneyLabel(HOME_CURRENCY, SEAT.seat)}
              </div>
              <p className="mt-1.5 text-sm text-ink-light">per seat, per month</p>
              <p className="mt-5 text-base leading-7 text-ink">
                Org chart, roles, monthly scoring, hard gates and the board pack. Connectors and the
                assistant are the same price, because it is the same system — the difference is where
                the numbers come from.
              </p>
              <Link href="/signup" className="btn-secondary mt-6 inline-block">Start free</Link>
            </div>
            {/*
              This card used to print the A$44 above the words "SPEC Advanced", which is two
              different products wearing one number. Advanced is connectors and the assistant — the
              same price, because it is the same system, which is what /pricing has always said. The
              A$44 is the frontline leader seat, a different question entirely, and a customer
              reading both pages was being told two things that could not both be true.
            */}
            <div className="rounded-lg bg-sage-100 p-8">
              <div className="label-caps text-sage-800">Seat plus training</div>
              <div className="mt-3 font-serif text-[44px] leading-tight text-ink">
                {moneyLabel(HOME_CURRENCY, SEAT.withTraining)}
              </div>
              <p className="mt-1.5 text-sm text-ink-light">per frontline leader, per month · not open yet</p>
              <p className="mt-5 text-base leading-7 text-ink">
                The same seat, plus SPEC&rsquo;s own training for supervisors and team leaders — twelve
                modules across the four pillars, done online at their own pace. For the people running
                a crew, not for everybody. The pack is still being written — the price is set for when
                it is ready, and nobody is charged for it before then.
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <Link href="/pricing" className="btn-primary inline-block">See what is in it</Link>
                {/* The design's second action here, and it should never have gone: a price with a
                    condition on it needs a way to reach a person, not only a way to read more. */}
                <a href="mailto:manager@specbizhq.com" className="text-sm text-rust-700 hover:underline">Talk to us</a>
              </div>
            </div>
          </div>
          {/*
            What starts the meter — and it is NOT scoring.

            This said "seats are charged once you start scoring", which was never what the code did:
            lib/plan bills a seat the moment a name and an email are attached to a role, and not
            before. The two sentences described different products, and the wrong one was the one on
            the public page in front of somebody deciding whether to trust us with a card.

            Export 5's wording is also the better promise. It says the org chart is free to play
            with, which is the thing a leader is most nervous about: drawing the structure they
            might need, including roles nobody holds, without it quietly costing them money.
          */}
          <p className="mt-6 text-sm leading-7 text-ink-light">
            Free to move the org chart around and try structures — a role stays free until you add a
            real name and email to it. A vacant or predicted role never carries a seat, however the
            structure moves.
          </p>
        </section>

        <section className="mt-14 pb-4">
          <div className="rounded-[32px] bg-sage-100 p-8 sm:p-14">
            {/*
              "Ready when you are." — the design's words, and it is doing a different job from the
              heading it replaces.

              The old one ("Your page opens as soon as a role has its KPIs") explained a mechanism,
              at the bottom of a page whose whole argument has already been made. By this point a
              reader has typed a real problem, watched SPEC read it, and seen the price. One more
              explanation is not what is missing; a door is. So the last thing on the page asks for
              nothing and states no claim.
            */}
            <h3 className="max-w-[24ch] font-serif text-[28px] leading-tight text-ink">
              Ready when you are.
            </h3>
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
