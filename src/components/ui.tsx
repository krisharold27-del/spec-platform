import Link from 'next/link';
import { band, type Pillar, type Score } from '@/lib/scoring';
import { myBusinesses } from '@/lib/auth';
import { PILLAR_META, pct } from '@/lib/pillars';

// Re-exported so existing pages keep importing them from here; they live in lib/pillars because a
// client component must be able to reach them without pulling the server's request context in too.
export { PILLAR_META, pct };


export async function Shell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  // Only someone with more than one business ever sees a way to switch.
  const businesses = await myBusinesses().catch(() => []);
  return (
    <div className="min-h-screen">
      <header className="border-b border-ink/10 bg-surface">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <Link href="/" className="font-serif text-lg tracking-tight text-ink">
            SPEC<span className="text-rust">.</span>
          </Link>
          {/*
            Five links, then everything else behind one word.
            The five are the rhythm — the day, the week, the month, what is waiting, and the chart
            every score rolls up. Putting fourteen across the top would mean a leader scanning a
            menu to find the thing they open every morning.
            `<details>` rather than a scripted dropdown: it works with the keyboard, it works before
            hydration, and it needs nothing shipped to the browser.
          */}
          <nav className="flex items-center gap-5 label-caps">
            <Link href="/today" className="hover:text-rust">Today</Link>
            <Link href="/meeting" className="hidden hover:text-rust sm:inline">This week</Link>
            <Link href="/scoring" className="hidden hover:text-rust sm:inline">The month</Link>
            <Link href="/inbox" className="hover:text-rust">Approvals</Link>
            <Link href="/org" className="hidden hover:text-rust sm:inline">Org chart</Link>

            <details className="relative">
              <summary className="cursor-pointer list-none hover:text-rust">Everything else</summary>
              <div className="absolute right-0 z-10 mt-2 grid w-56 gap-1 rounded-lg border border-ink/10 bg-surface p-2 shadow-md">
                {[
                  { href: '/', label: 'Executive summary' },
                  { href: '/charter', label: 'Board Charter' },
                  { href: '/me', label: 'My scorecard' },
                  { href: '/team', label: 'Team roll-up' },
                  { href: '/people', label: 'People' },
                  { href: '/boards', label: 'Conversation boards' },
                  { href: '/curve', label: 'Your J curve' },
                  { href: '/training', label: 'Training' },
                  { href: '/connections', label: 'Connections' },
                  { href: '/setup', label: 'Setting up' },
                  { href: '/journey', label: 'Journey' },
                  { href: '/settings', label: 'Administration' },
                  ...(businesses.length > 1
                    ? [{ href: '/group', label: 'Group' }, { href: '/businesses', label: 'Switch business' }]
                    : []),
                ].map(l => (
                  <Link key={l.href} href={l.href} className="rounded-full px-3 py-1.5 hover:bg-cream hover:text-rust">
                    {l.label}
                  </Link>
                ))}
              </div>
            </details>

            <Link href="/signout" className="normal-case tracking-normal text-ink-light/70 hover:text-rust">Sign out</Link>
          </nav>
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

/** Section letter badge — the coloured S / P / E / C square used next to a pillar's section heading. */
export function Badge({ pillar }: { pillar: Pillar }) {
  const m = PILLAR_META[pillar];
  return (
    <span className="badge-letter" style={{ borderColor: m.colour, color: m.colour, backgroundColor: `${m.colour}14` }}>
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
  return (
    <div className="card" style={{ borderTopColor: m.colour, borderTopWidth: 4 }}>
      <div className="flex items-center gap-2">
        <span className="badge-letter h-6 w-6 text-xs" style={{ borderColor: m.colour, color: m.colour, backgroundColor: `${m.colour}14` }}>{m.letter}</span>
        <div className="label-caps">{m.name}</div>
      </div>
      <div className="mt-2 font-serif text-3xl text-ink">{scored ? pct(score) : '—'}</div>
      <div className="mt-1 text-sm font-medium" style={{ color: band(score) === 'on_track' ? m.colour : undefined }}>{status}</div>
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
