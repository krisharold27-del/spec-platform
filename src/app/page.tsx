import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Footer } from '@/components/ui';
import { getCurrentUser } from '@/lib/auth';
import { DEFAULT_AFTER_SIGN_IN } from '@/lib/auth-redirect';
import { SiteVipMark } from '@/components/sitevip-mark';
import { ProblemBox } from '@/components/problem-box';
import { Dial } from '@/components/power-meter';
import { RecommendDemo } from '@/components/out-simple';
import { bandOf, type PowerReading } from '@/lib/power-meter';
import {
  OUT_SIMPLE_HERO, VIRTUAL_TEAM, RECOMMENDS, SWITCH_STORY, ANGUS_STORY, MAKE_IT_SIMPLE,
  GUARANTEE_STORY, CTA, ARRIVING, isLive, type FeatureKey,
} from '@/lib/out-simple';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'siteVIP — Simple. Your GM and your admin department, run virtually.',
  description:
    'siteVIP, powered by SPEC, runs your GM thinking and your admin department virtually. Claude recommends from your own numbers; you switch over only when you’re ready.',
  alternates: { canonical: '/' },
};

/**
 * The front door at www.sitevipapp.com — the out-simple story, 25 September 2026.
 *
 * Kris's order, kept exactly: "Simple." and the one line under it; the problem box, which reads a real
 * problem, blooms it out and hands the business into its own page; then Virtual GM + Virtual Admin,
 * Claude recommends, Switch when ready (with Angus Shield), Make it simple every week, the Simple
 * Guarantee, and a way back into the problem box. The Power Meter closes the page.
 *
 * The words and the "is this real yet?" flags live in lib/out-simple, and a test holds every flag
 * that is on to a route that exists. A section whose feature is still being built says "Arriving
 * now" and offers nothing to press — see the honesty rule there.
 *
 * The earlier siteVIP door (the seven-step job strip and the system-by-system toggles) is not here:
 * the page is judged against OUTSIMPLE THEM, and both of those explained the product where this page
 * lets somebody try it. lib/sitevip keeps them for anywhere they are wanted again.
 */
export default async function SiteVipLanding() {
  /*
    Somebody already signed in does not need the shopfront; they need their day. Guarded: this page
    must render with NO database and NO sign-in service configured, so a failure to ask is read as
    "not signed in", which is both the safe answer and the true one.
  */
  if (await getCurrentUser().catch(() => null)) redirect(DEFAULT_AFTER_SIGN_IN);

  return (
    <div className="min-h-screen overflow-x-hidden bg-white font-sans text-ink">
      <a href="#problem" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-10 focus:rounded-full focus:bg-white focus:px-4 focus:py-2 focus:shadow">
        Skip to the problem box
      </a>
      <nav className="mx-auto flex max-w-[1200px] items-center justify-between gap-4 px-[clamp(16px,5vw,72px)] py-[18px]">
        <Link href="/" aria-label="siteVIP home" className="inline-flex min-h-[44px] items-center">
          <SiteVipMark powered />
        </Link>
        <Link href="/signin" className="inline-flex min-h-[44px] items-center text-sm text-rust-700 hover:underline">Sign in</Link>
      </nav>

      <main>
        {/* (1) The word, set enormous, and the one line under it. */}
        <section aria-labelledby="hero" className="mx-auto max-w-[1000px] px-[clamp(16px,5vw,72px)] pb-[clamp(56px,10vh,112px)] pt-[clamp(40px,9vh,120px)] text-center">
          <p className="mb-4 text-[12.5px] font-semibold uppercase tracking-[0.06em] text-rust-700">For every trade, from one person to hundreds</p>
          <h1 id="hero" className="m-0 font-serif text-[clamp(64px,14vw,148px)] leading-none">{OUT_SIMPLE_HERO.word}</h1>
          <p className="mx-auto mt-[clamp(20px,3vw,32px)] max-w-[22ch] font-serif text-[clamp(24px,3.6vw,40px)] leading-tight">
            {OUT_SIMPLE_HERO.line}
          </p>
          <p className="mx-auto mt-4 max-w-[40ch] text-[clamp(17px,1.8vw,20px)] leading-[1.5] text-ink-light">{OUT_SIMPLE_HERO.push}</p>
          {/* Counted, not claimed: scripts/taps-journey.mjs presses every one in a real browser and fails if it grows. */}
          <p className="mx-auto mt-3 text-[15px] font-semibold text-ink" data-taps>Enquiry to paid in 12 taps. Count them.</p>
          <a href="#problem" className="mt-8 inline-flex min-h-[48px] items-center rounded-full bg-rust px-7 text-base font-semibold text-white hover:bg-rust-600">
            Start with one problem &darr;
          </a>
        </section>

        {/* The problem box → bloom-out → the fix, in order → "Would you like to solve problems in your business?" → sign-up → My Page. */}
        <div id="problem" className="scroll-mt-4">
          <ProblemBox />
        </div>

        <div className="mx-auto grid max-w-[1100px] gap-[clamp(48px,8vw,96px)] px-[clamp(16px,5vw,72px)] py-[clamp(48px,8vw,96px)]">
          {/* (2) Virtual GM + Virtual Admin Department. */}
          <section aria-labelledby="virtual">
            <Kicker>Virtual GM + Virtual Admin</Kicker>
            <h2 id="virtual" className="max-w-[24ch] font-serif text-[clamp(28px,4vw,44px)] leading-tight">{VIRTUAL_TEAM.heading}</h2>
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {[VIRTUAL_TEAM.gm, VIRTUAL_TEAM.admin].map(side => (
                <div key={side.title} className="rounded-lg bg-cream p-[clamp(20px,3vw,32px)]">
                  <h3 className="font-serif text-[22px] leading-tight">{side.title}</h3>
                  <p className="mt-2 text-[15px] leading-[23px] text-ink-light">{side.line}</p>
                  <ul className="mt-4 flex flex-wrap gap-2">
                    {side.items.map(i => (
                      <li key={i} className="rounded-full bg-white px-3.5 py-1.5 text-[13.5px] font-semibold">{i}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>

          {/* (3) Claude recommends. */}
          <section aria-labelledby="recommends" className="grid items-start gap-8 md:grid-cols-[1fr_1.1fr]">
            <div>
              <Kicker>Claude recommends</Kicker>
              <h2 id="recommends" className="font-serif text-[clamp(28px,4vw,44px)] leading-tight">{RECOMMENDS.heading}</h2>
              <p className="mt-4 max-w-[44ch] text-[17px] leading-[1.55] text-ink-light">{RECOMMENDS.line}</p>
              <p className="mt-3 max-w-[44ch] text-[17px] leading-[1.55] text-ink-light">
                It tells you what it would do and why. You say <strong className="text-ink">Yes</strong> or{' '}
                <strong className="text-ink">Not yet</strong>. On yes, it’s done.
              </p>
              <Status feature="recommends" />
            </div>
            {isLive('recommends') ? <RecommendDemo /> : <Pending>{RECOMMENDS.example.headline}</Pending>}
          </section>

          {/* (4) Switch when ready, with Angus Shield as the financial option. */}
          <section aria-labelledby="switch">
            <Kicker>Switch when ready</Kicker>
            <h2 id="switch" className="max-w-[24ch] font-serif text-[clamp(28px,4vw,44px)] leading-tight">{SWITCH_STORY.heading}</h2>
            <Status feature="switch" />
            <ol className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {SWITCH_STORY.steps.map((s, i) => (
                <li key={s.title} className="grid content-start gap-2 rounded-[20px] bg-cream p-5">
                  <span className="grid h-8 w-8 place-content-center rounded-full bg-white text-[13px] font-bold text-sage-800" aria-hidden>{i + 1}</span>
                  <span className="font-serif text-[18px] leading-tight">{s.title}</span>
                  <span className="text-[14px] leading-[21px] text-ink-light">{s.line}</span>
                </li>
              ))}
            </ol>
            <ul className="mt-5 flex flex-wrap gap-x-6 gap-y-2" aria-label="What it doesn’t cost you">
              {SWITCH_STORY.nots.map(n => (
                <li key={n} className="flex items-center gap-2 text-[15px] font-semibold">
                  <span className="text-sage-800" aria-hidden>✓</span>{n}
                </li>
              ))}
            </ul>
            <div className="mt-8 flex flex-wrap items-start justify-between gap-4 rounded-lg bg-sage-100 p-[clamp(20px,3vw,32px)]">
              <div className="max-w-[56ch]">
                <p className="text-[12.5px] font-semibold uppercase tracking-[0.06em] text-sage-800">The financial option</p>
                <h3 className="mt-1 font-serif text-[clamp(22px,3vw,28px)] leading-tight">
                  {ANGUS_STORY.name} <span className="text-sage-800">— {ANGUS_STORY.tagline}</span>
                </h3>
                <p className="mt-2 text-[15px] leading-[23px] text-ink-light">{ANGUS_STORY.line}</p>
              </div>
              <Status feature="angus_shield" />
            </div>
          </section>

          {/* (5) Make it simple, every week. */}
          <section aria-labelledby="weekly" className="grid items-start gap-8 md:grid-cols-[1fr_1.1fr]">
            <div>
              <Kicker>Make it simple</Kicker>
              <h2 id="weekly" className="font-serif text-[clamp(28px,4vw,44px)] leading-tight">{MAKE_IT_SIMPLE.heading}</h2>
              <p className="mt-4 max-w-[44ch] text-[17px] leading-[1.55] text-ink-light">{MAKE_IT_SIMPLE.line}</p>
              <Status feature="make_it_simple" />
            </div>
            <figure className="m-0 rounded-lg bg-white p-[clamp(20px,3vw,28px)] shadow-sm" aria-label="What the one page looks like">
              <p className="text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-light">This week, one page · example</p>
              <p className="mt-3 text-[13px] font-semibold uppercase tracking-[0.05em] text-sage-800">Got simpler</p>
              <p className="mt-1 text-[15px] leading-[23px]">{MAKE_IT_SIMPLE.sample.simpler}</p>
              <p className="mt-4 text-[13px] font-semibold uppercase tracking-[0.05em] text-rust-700">Next three to simplify</p>
              <ol className="mt-1 grid list-decimal gap-1 pl-5 text-[15px] leading-[23px]">
                {MAKE_IT_SIMPLE.sample.next.map(n => <li key={n}>{n}</li>)}
              </ol>
            </figure>
          </section>

          {/* (6) The Simple Guarantee. */}
          <section aria-labelledby="guarantee" className="rounded-[32px] bg-ink px-[clamp(20px,5vw,64px)] py-[clamp(36px,6vw,72px)] text-center text-white">
            <h2 id="guarantee" className="font-serif text-[clamp(28px,4vw,44px)] leading-tight">{GUARANTEE_STORY.heading}</h2>
            <p className="mx-auto mt-3 max-w-[24ch] font-serif text-[clamp(22px,3vw,32px)] leading-tight text-rust-light">{GUARANTEE_STORY.line}</p>
            <p className="mx-auto mt-4 max-w-[52ch] text-[16px] leading-[1.55] text-white/80">{GUARANTEE_STORY.how}</p>
          </section>

          {/* (7) Back into the problem box. */}
          <section aria-labelledby="cta" className="flex flex-wrap items-center justify-between gap-5 rounded-lg bg-cream p-[clamp(24px,4vw,48px)]">
            <h2 id="cta" className="m-0 max-w-[22ch] font-serif text-[clamp(24px,3vw,34px)] leading-[1.15]">{CTA.heading}</h2>
            <a href={CTA.href} className="inline-flex min-h-[48px] items-center rounded-full bg-rust px-7 text-base font-semibold text-white hover:bg-rust-600">
              {CTA.button} &uarr;
            </a>
          </section>

          {/* The Power Meter, at the bottom — what every business sees on its own page, every morning. */}
          <section aria-labelledby="power" className="grid items-center justify-items-center gap-5 text-center">
            <Kicker>The Virtual GM Power Meter</Kicker>
            <h2 id="power" className="max-w-[26ch] font-serif text-[clamp(24px,3.4vw,36px)] leading-tight">
              The whole business, one number, every morning.
            </h2>
            <div className="flex items-center gap-4 rounded-full bg-white py-2.5 pl-2.5 pr-6 shadow-sm">
              <Dial reading={EXAMPLE_READING} size={72} />
              <span className="grid gap-0.5 text-left">
                <span className="text-[11px] font-bold uppercase tracking-[0.05em] text-ink-light">Virtual GM Power Meter</span>
                <span className="font-serif text-[26px] leading-none">{EXAMPLE_READING.score}%</span>
                <span className="text-[11px] italic text-rust-700">HACC Your Power</span>
              </span>
            </div>
            <p className="max-w-[48ch] text-[15px] leading-[23px] text-ink-light">
              Example business. Yours reads from your own safety, people, earnings and compliance — and tells you what to pull next.
            </p>
          </section>

          <p className="text-[13px] text-ink-light">
            siteVIP is the trades edition of <Link href="/spec" className="text-rust-700 underline">SPEC</Link>.{' '}
            <Link href="/spec" className="text-rust-700 hover:underline">See SPEC, the full edition &rarr;</Link>
          </p>
        </div>
      </main>
      <div className="mx-auto max-w-[1100px] px-[clamp(16px,5vw,72px)] pb-12">
        <Footer />
      </div>
    </div>
  );
}

/** An example reading for the meter at the foot of the page. Labelled as an example where it is drawn. */
const EXAMPLE_SCORE = 78;
const EXAMPLE_READING: PowerReading = {
  score: EXAMPLE_SCORE,
  band: bandOf(EXAMPLE_SCORE),
  verdict: 'an example business',
  heavy: [],
  shared: [],
  measured: 0,
  total: 0,
  heavyMeasured: 0,
  sharedMet: 0,
  cause: null,
};

function Kicker({ children }: { children: React.ReactNode }) {
  return <p className="mb-3 text-[12.5px] font-semibold uppercase tracking-[0.06em] text-rust-700">{children}</p>;
}

/** "Live now" or "Arriving now", straight from the flag. Never a button. */
function Status({ feature }: { feature: FeatureKey }) {
  const live = isLive(feature);
  return (
    <p className={`mt-4 inline-flex items-center gap-2 rounded-full px-3 py-1 text-[13px] font-semibold ${live ? 'bg-light-green/10 text-sage-800' : 'bg-rust-100 text-rust-700'}`}>
      <span className={`h-2 w-2 rounded-full ${live ? 'bg-light-green' : 'bg-rust'}`} aria-hidden />
      {live ? 'Live now' : ARRIVING}
    </p>
  );
}

/** What stands in for an interactive example while its feature is still being built. */
function Pending({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-ink/20 bg-white p-[clamp(20px,3vw,28px)]">
      <p className="font-serif text-[20px] leading-snug text-ink-light">{children}</p>
      <p className="mt-3 text-[14px] text-ink-light">{ARRIVING} — this switches on here the day it works inside SPEC.</p>
    </div>
  );
}
