import Link from 'next/link';
import { LIGHT_COLOUR, LIGHT_INK, pillTone, type Light } from '@/lib/today';
import type { Beat } from '@/lib/rhythm';

/**
 * Where you sit.
 *
 * Your role, who you report to, and who reports to you — the three facts that decide everything
 * else on the page, including what you are allowed to see.
 *
 * The visibility rule is stated rather than left to be discovered. "They can see your card. You
 * cannot see theirs" is the sentence a person would otherwise work out by poking at the product
 * and drawing the wrong conclusion about why something is missing.
 */
export function WhereYouSit({
  role,
  reportsTo,
  score,
  scored,
}: {
  role: string;
  reportsTo: string | null;
  score: string;
  scored: boolean;
}) {
  return (
    <section className="card">
      <h2 className="font-serif text-xl text-ink">Where you sit</h2>
      <div className="mt-4 grid gap-px overflow-hidden rounded-lg border border-ink/10 bg-ink/10 sm:grid-cols-2">
        <div className="bg-surface p-4">
          <div className="label-caps">Your role</div>
          <div className="mt-1 font-medium text-ink">{role}</div>
          <p className="mt-1 text-sm text-ink-light">
            {scored ? `Your own score this month — ${score}` : 'This role is not individually scored.'}
          </p>
        </div>
        <div className="bg-surface p-4">
          <div className="label-caps">You report to</div>
          <div className="mt-1 font-medium text-ink">{reportsTo ?? 'Nobody — you are the top of the chart'}</div>
          <p className="mt-1 text-sm text-ink-light">
            {reportsTo
              ? 'They can see your card. You cannot see theirs.'
              : 'Everything below you rolls up into your card.'}
          </p>
        </div>
      </div>
      {/* A standalone link is aimed at, not read past — so it gets a target, not just a line of
          text. 20px was under the 24px floor the usability journey holds pressable things to. */}
      <Link href="/org" className="mt-3 link-go">
        See the whole chart →
      </Link>
    </section>
  );
}

/**
 * Nobody reports to you.
 *
 * Written as the rule working rather than as an empty state, because it is. A person who sees an
 * apologetic blank here concludes a permission is missing and asks somebody to fix it.
 */
export function NobodyBelow() {
  return (
    <p className="mt-3 text-sm text-ink-light">
      Nobody reports to you, so you see your own card and nothing else. That is the visibility rule
      working, not a permission missing.
    </p>
  );
}

/**
 * My week — the rhythm, and whether it is being held.
 *
 * Never a calendar. SPEC does not own anybody's diary; this is the handful of beats the business
 * actually runs on, each with somewhere to go and one line on where it stands.
 */
export function MyWeek({ beats, line }: { beats: Beat[]; line: string }) {
  return (
    <section className="card">
      <h2 className="font-serif text-xl text-ink">My week</h2>
      <p className="mt-1 text-sm text-ink-light">{line}</p>
      {beats.length > 0 && (
        <ul className="mt-4 grid gap-2">
          {beats.map(beat => (
            <li
              key={beat.id}
              className="card-inset"
              style={{ borderLeft: `4px solid ${LIGHT_COLOUR[beat.state]}` }}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <Link href={beat.href} className="font-medium text-ink hover:text-rust">
                  {beat.title}
                </Link>
                <span className="pill" style={pillTone(beat.state)}>{beat.standing}</span>
              </div>
              <p className="mt-1 text-sm text-ink-light">{beat.detail}</p>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-ink-light">
        The four or five things that are the operating system — not your diary. SPEC only has an
        opinion about whether they are being held.
      </p>
    </section>
  );
}

/**
 * The ask bar, across the top of the page.
 *
 * This is what retires the separate chat screen. Two screens both claiming to be where you start is
 * the most reliable way a product gets called confusing, and it is a decision that cannot be unmade
 * cheaply once people have learned one of them. So the conversation lives on the page: the page is
 * the dashboard, the ask bar is how you work it.
 */
/*
  `available` is kept and is always true from the product's side. It used to be the Basic/Advanced
  gate, and the branch behind it showed a strip reading "On Advanced you can ask this page a
  question" — an upsell on the screen a new business opens first. There is one SPEC now (see
  ONE_PRODUCT in lib/plan), so the strip is gone. The prop stays because there is one honest reason
  left to hide the bar: a look-around, where nothing anybody types is kept.
*/
export function AskBar({ available, href }: { available: boolean; href: string }) {
  if (!available) return null;
  return (
    <Link
      href={href}
      className="mt-6 flex flex-wrap items-center gap-3 rounded-full border border-ink/10 bg-surface px-5 py-3 transition-colors hover:border-rust/40"
    >
      <span className="label-caps" style={{ color: LIGHT_INK.amber }}>Ask SPEC</span>
      <span className="text-sm text-ink-light">
        Why is my People light amber? · What do I take to the weekly meeting?
      </span>
    </Link>
  );
}


/**
 * Who this is, and what day it is — the design's header, which the product did not have.
 *
 * Kris, 18 September, with a close-up of his own prototype: *"should look like this"*. The product
 * opened with "Good morning, Kris." and a grey line of context. The design opens with an initials
 * disc, the person's name beside the role they hold, and the date in rust caps calling the page what
 * it is: YOUR SPEC SHEET FOR THE DAY.
 *
 * It is not decoration. This page is opened by everybody in the business, and the first question it
 * has to answer is *which of my roles am I looking at* — the name beside the role answers it in one
 * line, where the old subtitle buried it in a sentence.
 */
export function WhoAndWhen({ name, role, businessName, date }: {
  name: string; role: string; businessName: string; date: string;
}) {
  // Two letters from the name as given. A single-word name gives one, which is correct rather than
  // padded — an avatar reading "K" is honest and an avatar reading "KK" is invented.
  const initials = name.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('');
  return (
    <div className="mb-6 flex items-center gap-4">
      <span
        aria-hidden
        className="grid h-14 w-14 shrink-0 place-content-center rounded-full bg-rust font-serif text-lg text-cream"
      >
        {initials}
      </span>
      <div className="min-w-0">
        <h1 className="font-serif text-2xl leading-tight tracking-tight text-ink sm:text-3xl">
          {name} <span className="text-ink-light">&middot;</span> {role}
        </h1>
        <p className="label-caps mt-1 text-rust-700">
          {date} &middot; your SPEC sheet for the day
        </p>
        <p className="mt-1 text-sm text-ink-light">{businessName}</p>
      </div>
    </div>
  );
}

/**
 * The Snap Score, as a band across the page rather than a chip inside another card.
 *
 * It was a pill in the corner of the improvement register reading "Snap Score — too early to read".
 * The design gives it the width of the page, a ring, the sentence that says what it is NOT, and the
 * one button on the screen that starts something.
 *
 * The size is the argument. This is the read of whether the business actually closes things out —
 * "not a count of problems, a read of the engine" — and it was smaller than the word beside it.
 */
export function SnapBand({ pct, early, children }: {
  pct: number | null; early: boolean; children?: React.ReactNode;
}) {
  const tone = early ? LIGHT_COLOUR.pending : pct! >= 75 ? LIGHT_COLOUR.green : pct! >= 45 ? LIGHT_COLOUR.amber : LIGHT_COLOUR.red;
  return (
    <section
      aria-label="Snap Score"
      className="mb-8 flex flex-wrap items-center gap-5 rounded-lg border-l-4 bg-surface p-5"
      style={{ borderLeftColor: tone }}
    >
      {/*
        The ring, drawn with a conic gradient rather than an SVG: one element, no library, and it
        reads as a dial at a glance. Hollow while the register is too young to say anything, because
        a full ring with no number behind it would be a picture of a score that does not exist.
      */}
      <span
        aria-hidden
        className="grid h-20 w-20 shrink-0 place-content-center rounded-full"
        style={{
          background: early
            ? `conic-gradient(${LIGHT_COLOUR.pending}22 0turn, ${LIGHT_COLOUR.pending}22 1turn)`
            : `conic-gradient(${tone} ${pct! / 100}turn, ${tone}1f ${pct! / 100}turn)`,
        }}
      >
        <span className="grid h-[58px] w-[58px] place-content-center rounded-full bg-surface font-serif text-base text-ink">
          {early ? '0' : `${pct}`}
        </span>
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="font-serif text-xl text-ink">
          Snap Score {early ? '— too early to read' : `— ${pct}%`}
        </h2>
        <p className="label-caps mt-0.5 text-rust-700">Snap it in line</p>
        <p className="mt-1 max-w-xl text-sm text-ink-light">
          Not a count of problems &mdash; a read of the engine. A business with twenty logged and
          nineteen closed is working; one with three logged and three reopened is not.
        </p>
      </div>
      {children}
    </section>
  );
}
