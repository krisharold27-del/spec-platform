import Link from 'next/link';
import { Suspense } from 'react';
import { SpecLockup } from './spec-mark';
import { band, type Pillar, type Score } from '@/lib/scoring';
import { myBusinesses, getCurrentUser } from '@/lib/auth';
import { isAdminEmail } from '@/lib/admin';
import { currentLook } from '@/lib/look';
import { isLapsed, planStateFor } from '@/lib/plan';
import { moneyLabel } from '@/lib/pricing';
import { LookBar } from './look-bar';
import { navDoors } from '@/lib/doors';
import { ReadOnlyNotice } from './read-only-notice';
import { PILLAR_META, SCORE_COLOUR, SCORE_INK, scoreColour, scoreInk, pct } from '@/lib/pillars';
import { NavBar } from './nav-bar';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { currentPeriod } from '@/lib/period';
import { getScope, isTopOfChart } from '@/lib/scope';
import { requestCurrency } from '@/lib/request-currency';

// Re-exported so existing pages keep importing them from here; they live in lib/pillars because a
// client component must be able to reach them without pulling the server's request context in too.
export { PILLAR_META, SCORE_COLOUR, SCORE_INK, scoreColour, scoreInk, pct };


export async function Shell({ title, kicker, headline, subtitle, children }: {
  title: string;
  /** Small rust capitals above the statement. Defaults to `title`, which is what it usually is. */
  kicker?: string;
  /** The design's opener: one or two lines of serif saying what the screen is FOR. */
  headline?: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  // Only someone with more than one business ever sees a way to switch.
  const businesses = await myBusinesses().catch(() => []);
  /*
    Ask lib/look directly rather than inferring it from the viewer.

    A visitor is deliberately sat in the top role's real seat so every page has something to show
    them, which means their user looks exactly like a customer's — there is nothing about the
    viewer to test. The only thing that distinguishes a look-around is the token in the browser, so
    that is what gets asked.
  */
  const looking = Boolean(await currentLook().catch(() => null));

  /*
    The cockpit, offered only to whoever it belongs to.

    Kris went looking for it by typing the address, was silently sent to My Page because the check
    is on the server, and had no way to tell whether he had got the address wrong or the page had
    refused him. A link he can see removes the guessing — and its ABSENCE is itself the answer for
    everybody else, which is better than a refusal that admits the page exists.
  */
  const me = await getCurrentUser().catch(() => null);
  const runsSpec = Boolean(me && isAdminEmail(me.email));

  /*
    A business that has gone read-only says so at the top of every page, before anybody types.

    It lives in the Shell rather than on the pages because the pages are where it was missed: a
    lapsed business could open Setup, see live text fields and Add buttons with nothing anywhere
    saying otherwise, type a name, click Add — and be shown the generic "something went wrong"
    screen. The refusal was right; everything the customer could see about it was wrong.

    Put here, no page has to remember, and no page built later can forget. Only the `plan` column is
    read, which is a single row and the same query the page was going to make anyway.
  */
  const lapsed = me ? await isLapsed(me.tenantId) : false;

  /*
    ── A billing tab, at the top of every page, crystal clear ───────────────────────────────────

    Kris, 20 September: *"the company has to know clearly when they start paying and how much"* —
    and then, when the first answer was a line of text folded into the page: *"no it needs a
    cleaer tab at the top of the page so it is crystl clear"*.

    The number itself already existed — `costLabel` on `/journey` names both, in the business's
    own currency, first seat free — it just lived on a page nothing links to once a business is
    past its first morning (My Page is the only address the nav sends anybody to; see `navDoors`).
    A leader could invite somebody, start the meter, and have no way to see that had happened short
    of typing `/journey` in by hand.

    So it sits here instead, in the header every page shares, beside the business name — the one
    row that is genuinely on every screen. Paying for the business is administration
    (`/api/stripe/checkout` gates the same way, on `isTopOfChart` or `access === 'administrator'`),
    so this is read only for whoever that is; nobody else gets a bill they cannot act on pinned to
    their screen. The lapsed banner below already covers the "something has gone wrong" case, so
    this tab says nothing while `lapsed` — one clear message at a time, not two disagreeing ones.
  */
  let billingTab: { text: string; tone: 'quiet' | 'due' } | null = null;
  if (me && !looking && !lapsed) {
    const scope = await getScope(me);
    if (me.access === 'administrator' || isTopOfChart(scope)) {
      const plan = await planStateFor(me.tenantId, await requestCurrency());
      const people = `${plan.seats} ${plan.seats === 1 ? 'person' : 'people'}`;
      if (plan.program) {
        billingTab = null; // The consulting engagement, not a self-serve bill — nothing to show here.
      } else if (plan.seats === 0) {
        billingTab = null; // Nobody in the business yet — nothing to say about money until there is.
      } else if (plan.beta) {
        billingTab = { text: `Beta — free · ${people}`, tone: 'quiet' };
      } else if (plan.needsCheckout) {
        billingTab = { text: `Start paying · ${moneyLabel(plan.currency, plan.monthlyCost)}/mo · ${people}`, tone: 'due' };
      } else if (plan.billing) {
        billingTab = { text: `${moneyLabel(plan.currency, plan.monthlyCost)}/mo · ${people}`, tone: 'quiet' };
      } else {
        // Free and billing has not started — the first seat is free, and so far that is all there is.
        billingTab = { text: 'Free so far — first seat free', tone: 'quiet' };
      }
    }
  }

  // One source with the directory on My Page, so a renamed route cannot leave the bar pointing at
  // nothing while the grouped list quietly stays right.
  const nav = me ? navDoors({ businesses: businesses.length, runsSpec }) : [];

  /*
    Whether the bell has a dot on it.

    Two cheap reads, and only two: an approval filed against this business that nobody has decided,
    and a month handed up for sign-off. Everything else the Inbox shows is DERIVED — it walks this
    person's scope for vacancies, finished training paths and changed targets — and doing that on
    every page load would put the slowest query in the product in the header of every screen.

    So the dot under-reports, on purpose and never the other way round: it is never on when nothing
    is waiting, and it carries no number. See the comment on the bell itself.
  */
  let waiting = false;
  if (me && !looking) {
    const [pending, period] = await Promise.all([
      db.select({ id: schema.approvals.id }).from(schema.approvals)
        .where(and(eq(schema.approvals.tenantId, me.tenantId), eq(schema.approvals.state, 'waiting')))
        .limit(1)
        .catch(() => []),
      currentPeriod(me.tenantId).catch(() => null),
    ]);
    waiting = pending.length > 0 || period?.status === 'submitted';
  }

  return (
    <div className="min-h-screen">
      {looking && <LookBar />}
      <header className="border-b border-ink/10 bg-surface">
        {/* Wraps rather than scrolls: six links and a business name do not fit one line on a phone,
            and a bar that slides sideways is the half of the navigation nobody finds. */}
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-6 py-3">
          {/* Inside the product the mark is a wayfinder, not a brand statement, so it carries no
              supporting line. */}
          {/*
            The mark goes home, and it is still the most-pressed thing in the product even now the
            bar is back. It measured 35px on a phone — the one control everybody needs was the one
            too small to hit with a thumb. `inline-flex` plus a floor gives it a 44px target without
            changing how it looks.
          */}
          <Link href="/my-page" aria-label="SPEC home — My page" className="inline-flex min-h-[44px] items-center">
            <SpecLockup />
          </Link>
          {/*
            The navigation bar, which SPEC deliberately did not have until 18 September.

            The old reasoning was good and is kept in lib/doors: a toolbar of five links plus a
            dropdown of fourteen had made SPEC two things — a page you work on and a menu you hunt in.
            Every design screen has carried a bar throughout, and Kris, looking at the two side by
            side: *"keep the nav bar"*. Six items, not nineteen; the complete list is still the
            grouped directory at the bottom of My Page.

            Hidden during a look-around. A visitor is sat in the top role's seat to have something to
            see, and handing them a bar into Scoring and Connections offers writes that will be
            refused — see the guard in lib/guard.
          */}
          {!looking && nav.length > 0 && <NavBar doors={nav} />}

          {!looking && me && (
            <div className="ml-auto flex items-center gap-4">
              {/*
                The billing tab — a pill, not a sentence buried in the page, so it reads at a
                glance and matches the bell and the business name beside it for how loud it is.
                Rust and filled when money is waiting on a decision ("Start paying"); quiet ink
                once that decision is made, same as everything else in the header that is simply
                stating a fact rather than asking for one.
              */}
              {billingTab && (
                <Link
                  href="/journey"
                  className={
                    billingTab.tone === 'due'
                      ? 'inline-flex min-h-[28px] items-center whitespace-nowrap rounded-full bg-rust-800 px-3 py-1 text-[13px] font-medium text-cream hover:bg-rust-900'
                      : 'inline-flex min-h-[28px] items-center whitespace-nowrap rounded-full border border-ink/15 px-3 py-1 text-[13px] text-ink-light hover:text-rust'
                  }
                >
                  {billingTab.text}
                </Link>
              )}

              {/*
                The bell, which Kris drew on the header with a dot on it.

                What the dot means is exactly this: **something is waiting that SPEC already knows
                about without doing any work** — an approval filed against this business, or a month
                handed up and not yet signed. Two queries, both of which the header can afford.

                It deliberately does NOT try to be the Inbox's count. The Inbox works out vacancies,
                finished training paths and changed targets by walking this person's whole scope,
                which is far too much to do on every page load — so the dot can be absent while the
                Inbox has items in it. The bell is a way IN, not a tally, which is why it carries no
                number: a number that is quietly wrong is worse than no number. The Inbox is the
                truth and is one press away.
              */}
              <Link
                href="/inbox"
                aria-label={waiting ? 'Approvals — something is waiting on you' : 'Approvals'}
                title={waiting ? 'Something is waiting on you' : 'Approvals'}
                className="relative inline-flex min-h-[28px] items-center text-lg leading-none hover:opacity-80"
              >
                <span aria-hidden>🔔</span>
                {waiting && (
                  <span
                    aria-hidden
                    className="absolute -right-0.5 -top-0.5 block h-2.5 w-2.5 rounded-full border border-surface"
                    style={{ background: '#a63b26' }}
                  />
                )}
              </Link>

              {/*
                The business name, top right, on every screen — the design's own placement and the
                thing that answers "which company am I looking at" before anybody reads a number.

                It used to appear only for somebody with more than one business, which meant the one
                place the name belongs was empty for every single customer SPEC has.
              */}
              <Link
                href="/businesses"
                className="inline-flex min-h-[28px] items-center text-sm text-ink hover:text-rust"
              >
                {businesses.find(b => b.tenantId === me.tenantId)?.name ?? 'Your business'}
                <span aria-hidden className="ml-1 text-ink-light">▾</span>
              </Link>
            </div>
          )}
          {looking && (
            /* A visitor never signed in, so offering to sign them out is nonsense. They get the way
               out of the look-around instead. */
            <Link href="/look/decide" className="label-caps normal-case tracking-normal text-ink-light/70 hover:text-rust">
              Finish looking
            </Link>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">
        {/*
          No title, no heading — rather than an EMPTY one.

          My Page now carries the design's own header inside its children (name, role, the date), so
          it passes no title. The Shell went on rendering `<h1></h1>` anyway, which put a blank
          heading above the real one: `scripts/usability-journey.mjs` checks that every page says
          where you are by reading the first h1 or h2, and it found the empty one. A screen reader
          would have hit the same thing and announced nothing.
        */}
        {/*
          The opener, which is the single biggest reason Kris called the product *boring*.

          Every design screen starts the same way: small rust capitals naming the screen, then a
          two-line serif statement of what it is FOR, then one sentence of plain text. Every built
          screen started with a 24px title and a grey subtitle — the design ANNOUNCES the screen,
          the product LABELLED it. Doing it here rather than per page is the point: sixteen screens
          were wrong in the same way, so there is one place to be right.

          A page that passes no headline keeps the old small title, so nothing is left half-converted
          while the rest are done.
        */}
        {headline ? (
          <header className="pb-2">
            {(kicker ?? title) && (
              <span className="label-caps block text-rust-700">{kicker ?? title}</span>
            )}
            <h1 className="mt-3 max-w-[20ch] font-serif text-[clamp(30px,4.2vw,50px)] leading-[1.08] tracking-tight text-ink">
              {headline}
            </h1>
            {subtitle && <p className="mt-5 max-w-[58ch] text-[17px] leading-7 text-ink">{subtitle}</p>}
          </header>
        ) : (
          <>
            {title && <h1 className="font-serif text-2xl tracking-tight text-ink">{title}</h1>}
            {subtitle && <p className="mt-1 text-sm text-ink-light">{subtitle}</p>}
          </>
        )}
        <div className="mt-6">
          {lapsed && (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rust-300 bg-rust-100 p-4 text-sm text-rust-800">
              <p>
                <b>Read-only until the payment is sorted.</b> You can see everything and change
                nothing. Nothing has been deleted, and it all comes back the moment the payment goes
                through.
              </p>
              <Link href="/journey" className="shrink-0 rounded-md bg-rust px-3 py-1.5 text-sm font-semibold text-cream hover:bg-rust-600">
                Fix payment
              </Link>
            </div>
          )}
          {/* Reading the address needs the client, and the client needs a boundary. Nothing to show
              while it arrives, so the fallback is nothing. */}
          <Suspense fallback={null}><ReadOnlyNotice /></Suspense>
          {children}
        </div>
        <Footer />
      </main>
    </div>
  );
}

/**
 * Terms / Privacy / Get help — the same three links everywhere, signed in or not.
 *
 * "Get help" used to open an email, which made Kris the help desk: bearable at one business, a
 * full-time job at two hundred, and silence at seven in the evening. It now opens a page that
 * answers the questions people actually ask, with the email offered at the bottom of it for the
 * ones it does not.
 */
export function Footer() {
  return (
    // `inline-flex` with a floor: the text stays as quiet as it was, and the thing you press stops
    // being 16px tall. On a phone these three were the smallest targets in the whole product — and
    // one of them is the way to get help.
    <footer className="mt-16 flex flex-wrap gap-4 border-t border-ink/10 pt-4 text-xs text-ink-light/70">
      <Link href="/terms" className="inline-flex min-h-[28px] items-center hover:text-rust">Terms</Link>
      <Link href="/privacy" className="inline-flex min-h-[28px] items-center hover:text-rust">Privacy</Link>
      <Link href="/help" className="inline-flex min-h-[28px] items-center hover:text-rust">Get help</Link>
    </footer>
  );
}

/** Status pill — Confirmed / Pending / Pass / Fail / neutral, matching the JBI scorecard's badge style. */
export function StatusPill({ tone, children }: { tone: 'confirmed' | 'pending' | 'pass' | 'fail' | 'neutral'; children: React.ReactNode }) {
  const cls = tone === 'confirmed' || tone === 'pass' ? 'pill-confirmed' : tone === 'pending' ? 'pill-pending' : tone === 'fail' ? 'pill-fail' : 'pill-neutral';
  return <span className={`pill ${cls}`}>{children}</span>;
}

/**
 * The S / P / E / C letter badge.
 *
 * Coloured by the SCORE, never by the pillar — see the note in lib/pillars. Given no score it is
 * ink on sand: during setup there is nothing to be going well or badly yet, and colouring it then
 * would be colour with no meaning behind it, which is the habit Option D exists to break.
 */
export function Badge({ pillar, score = null, scored = false }: { pillar: Pillar; score?: Score; scored?: boolean }) {
  const m = PILLAR_META[pillar];
  // The edge and the wash carry the signal; the letter has to be legible, so it takes the ink.
  const tone = scored ? scoreColour(score) : null;
  return (
    <span
      className="badge-letter"
      title={m.name}
      style={tone ? { borderColor: tone, color: scoreInk(score), backgroundColor: `${tone}14` } : undefined}
    >
      {m.letter}
    </span>
  );
}

/** Cream, rust-accented callout — "next step", "monthly incentive", any single highlighted note. */
export function Callout({ eyebrow, children }: { eyebrow?: string; children: React.ReactNode }) {
  return (
    <div className="callout">
      {eyebrow && <div className="label-caps">{eyebrow}</div>}
      <div className="mt-1">{children}</div>
    </div>
  );
}

const BAND_LABEL = { on_track: 'On track', watch: 'Watch', behind: 'Behind', pending: 'Pending' } as const;

/** Score tile. No score renders as Pending — grey, never a misleading 0% and never red. */
export function PillarTile({ pillar, score: raw, scored: anyScored, sub }: { pillar: Pillar; score: Score; scored: boolean; sub?: string }) {
  const m = PILLAR_META[pillar];
  const score = anyScored ? raw : null;
  const scored = score !== null;
  const status = BAND_LABEL[band(score)];
  // One colour on the card, and it is the score. The letter says which pillar.
  // Two weights of that one colour: the bright one for the edge, the dark one for anything read.
  const tone = scoreColour(score);
  const ink = scoreInk(score);
  return (
    <div className="card" style={{ borderTopColor: tone, borderTopWidth: 4 }}>
      <div className="flex items-center gap-2">
        <span
          className="badge-letter h-6 w-6 text-xs"
          style={{ borderColor: tone, color: ink, backgroundColor: `${tone}14` }}
        >{m.letter}</span>
        <div className="label-caps">{m.name}</div>
      </div>
      {/* Nought rather than a dash on an unmarked pillar — Kris, 18 September. The status line
          under it still says the month has not been marked, so nought is never read as a failure. */}
      <div className="mt-2 font-serif text-3xl text-ink">{scored ? pct(score) : '0%'}</div>
      <div className="mt-1 text-sm font-medium" style={{ color: ink }}>{status}</div>
      {sub && <div className="mt-2 text-xs text-ink-light">{sub}</div>}
    </div>
  );
}

export function GateBadge({ label, pass, value, reason }: { label: string; pass: boolean | null; value?: string; reason?: string | null }) {
  const tone = pass === null ? 'neutral' : pass ? 'pass' : 'fail';
  return (
    <div className="card">
      <div className="flex items-baseline justify-between">
        <div className="font-medium text-ink">{label}</div>
        <StatusPill tone={tone}>{pass === null ? 'Not reporting' : pass ? 'PASS' : 'FAIL'}</StatusPill>
      </div>
      {value && <div className="mt-1 text-sm text-ink-light">{value}</div>}
      <div className="mt-1 text-xs text-ink-light/80">{reason ?? 'Nothing has been entered for this gate yet — this is a baseline state, not a result.'}</div>
    </div>
  );
}
