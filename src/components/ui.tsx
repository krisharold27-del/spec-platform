import Link from 'next/link';
import type { Pillar } from '@/lib/scoring';

export const PILLAR_META: Record<Pillar, { name: string; letter: string; colour: string; question: string }> = {
  safety:     { name: 'Safety',     letter: 'S', colour: '#C1440E', question: 'Are we going well in Safety?' },
  people:     { name: 'People',     letter: 'P', colour: '#5B9E3F', question: 'Does everyone love coming to work?' },
  earnings:   { name: 'Earnings',   letter: 'E', colour: '#169BD5', question: 'Are we making money?' },
  compliance: { name: 'Compliance', letter: 'C', colour: '#8064A2', question: 'Are we clear to work?' },
};

export const pct = (n: number) => `${Math.round(n * 100)}%`;

export function Shell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-ink/10 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <Link href="/" className="font-serif text-lg font-bold tracking-tight text-ink">
            SPEC<span className="text-rust">.</span>
          </Link>
          <nav className="flex items-center gap-5 label-caps">
            <Link href="/journey" className="hover:text-rust">Journey</Link>
            <Link href="/" className="hover:text-rust">Executive summary</Link>
            <Link href="/org" className="hover:text-rust">Org chart</Link>
            <Link href="/team" className="hover:text-rust">Team rollup</Link>
            <Link href="/me" className="hover:text-rust">My scorecard</Link>
            <Link href="/signout" className="normal-case tracking-normal text-ink-light/70 hover:text-rust">Sign out</Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">
        <h1 className="font-serif text-2xl font-bold tracking-tight text-ink">{title}</h1>
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

/** Score tile. `scored=false` renders a baseline state instead of a misleading 0%. */
export function PillarTile({ pillar, score, scored, sub }: { pillar: Pillar; score: number; scored: boolean; sub?: string }) {
  const m = PILLAR_META[pillar];
  const status = !scored ? 'Not yet scored' : score >= 0.9 ? 'On target' : score >= 0.75 ? 'Attention' : 'Below target';
  return (
    <div className="card" style={{ borderTopColor: m.colour, borderTopWidth: 4 }}>
      <div className="flex items-center gap-2">
        <span className="badge-letter h-6 w-6 text-xs" style={{ borderColor: m.colour, color: m.colour, backgroundColor: `${m.colour}14` }}>{m.letter}</span>
        <div className="label-caps">{m.name}</div>
      </div>
      <div className="mt-2 font-serif text-3xl font-bold text-ink">{scored ? pct(score) : '—'}</div>
      <div className="mt-1 text-sm font-medium" style={{ color: scored && score >= 0.9 ? m.colour : undefined }}>{status}</div>
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
