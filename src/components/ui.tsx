import Link from 'next/link';
import { Suspense } from 'react';
import { SpecLockup } from './spec-mark';
import { band, type Pillar, type Score } from '@/lib/scoring';
import { myBusinesses, getCurrentUser } from '@/lib/auth';
import { isAdminEmail } from '@/lib/admin';
import { currentLook } from '@/lib/look';
import { isLapsed } from '@/lib/plan';
import { LookBar } from './look-bar';
import { navDoors } from '@/lib/doors';
import { ReadOnlyNotice } from './read-only-notice';
import { PILLAR_META, SCORE_COLOUR, SCORE_INK, scoreColour, scoreInk, pct } from '@/lib/pillars';

// Re-exported so existing pages keep importing them from here; they live in lib/pillars because a
// client component must be able to reach them without pulling the server's request context in too.
export { PILLAR_META, SCORE_COLOUR, SCORE_INK, scoreColour, scoreInk, pct };


export async function Shell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
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

  // One source with the directory on My Page, so a renamed route cannot leave the bar pointing at
  // nothing while the grouped list quietly stays right.
  const nav = me ? navDoors({ businesses: businesses.length, runsSpec }) : [];

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
          {!looking && nav.length > 0 && (
            <nav aria-label="SPEC" className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              {nav.map(d => (
                <Link
                  key={d.href}
                  href={d.href}
                  title={d.note}
                  /* A floor, not a size: these stay quiet text and stop being 16px tall on a phone. */
                  className="inline-flex min-h-[28px] items-center text-ink-light hover:text-rust"
                >
                  {d.label}
                </Link>
              ))}
            </nav>
          )}
          {/*
            The switcher, only for somebody who really has more than one business.

            `myBusinesses()` was already being fetched on every page in the product and the result
            thrown away — a query per page load for nothing. It has a use now.
          */}
          {!looking && businesses.length > 1 && (
            <Link href="/businesses" className="inline-flex min-h-[28px] items-center text-sm text-ink-light hover:text-rust">
              {businesses.find(b => b.tenantId === me?.tenantId)?.name ?? 'Switch business'} ▾
            </Link>
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
        <h1 className="font-serif text-2xl tracking-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-light">{subtitle}</p>}
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
      <div className="mt-2 font-serif text-3xl text-ink">{scored ? pct(score) : '—'}</div>
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
