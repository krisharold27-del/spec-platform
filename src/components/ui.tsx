import Link from 'next/link';
import { SpecLockup } from './spec-mark';
import { band, type Pillar, type Score } from '@/lib/scoring';
import { myBusinesses, getCurrentUser } from '@/lib/auth';
import { isAdminEmail } from '@/lib/admin';
import { currentLook } from '@/lib/look';
import { LookBar } from './look-bar';
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
  return (
    <div className="min-h-screen">
      {looking && <LookBar />}
      <header className="border-b border-ink/10 bg-surface">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          {/* Inside the product the mark is a wayfinder, not a brand statement, so it carries no
              supporting line. */}
          <Link href="/today" aria-label="SPEC home — My page">
            <SpecLockup />
          </Link>
          {/*
            No navigation, on purpose.

            The shape of the product is: a landing page for arriving, then My Page, and everything
            inside the system branches from there. A toolbar of five links and a dropdown of
            fourteen had quietly made SPEC two things — a page you work on, and a menu you hunt in —
            and a leader opening it at seven in the morning should see their day, not scan a
            toolbar deciding which of nineteen places they meant.

            So the mark goes home and nothing else navigates. The doors live at the bottom of My
            Page, grouped the way somebody actually thinks about them; see lib/doors.
          */}
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
        <div className="mt-6">{children}</div>
        <Footer />
      </main>
    </div>
  );
}

/** Terms / Privacy / Get help — the same three links everywhere, signed in or not. */
export function Footer() {
  return (
    <footer className="mt-16 flex flex-wrap gap-4 border-t border-ink/10 pt-4 text-xs text-ink-light/70">
      <Link href="/terms" className="hover:text-rust">Terms</Link>
      <Link href="/privacy" className="hover:text-rust">Privacy</Link>
      <a href="mailto:manager@specbizhq.com?subject=SPEC%20help" className="hover:text-rust">Get help</a>
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
