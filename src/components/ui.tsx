import Link from 'next/link';
import type { Pillar } from '@/lib/scoring';

export const PILLAR_META: Record<Pillar, { name: string; colour: string; question: string }> = {
  safety:     { name: 'Safety',     colour: '#E67E22', question: 'Are we going well in Safety?' },
  people:     { name: 'People',     colour: '#5B9E3F', question: 'Does everyone love coming to work?' },
  earnings:   { name: 'Earnings',   colour: '#169BD5', question: 'Are we making money?' },
  compliance: { name: 'Compliance', colour: '#8064A2', question: 'Are we clear to work?' },
};

export const pct = (n: number) => `${Math.round(n * 100)}%`;

export function Shell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <Link href="/" className="font-semibold tracking-tight">SPEC</Link>
          <nav className="flex items-center gap-5 text-sm text-slate-600">
            <Link href="/journey" className="hover:text-slate-900">Journey</Link>
            <Link href="/" className="hover:text-slate-900">Executive summary</Link>
            <Link href="/org" className="hover:text-slate-900">Org chart</Link>
            <Link href="/team" className="hover:text-slate-900">Team rollup</Link>
            <Link href="/me" className="hover:text-slate-900">My scorecard</Link>
            <Link href="/signout" className="text-xs text-slate-400 hover:text-slate-900">Sign out</Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">
        <h1 className="text-2xl font-semibold">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
        <div className="mt-6">{children}</div>
      </main>
    </div>
  );
}

/** Score tile. `scored=false` renders a baseline state instead of a misleading 0%. */
export function PillarTile({ pillar, score, scored, sub }: { pillar: Pillar; score: number; scored: boolean; sub?: string }) {
  const m = PILLAR_META[pillar];
  const status = !scored ? 'Not yet scored' : score >= 0.9 ? 'On target' : score >= 0.75 ? 'Attention' : 'Below target';
  return (
    <div className="rounded-lg border bg-white p-4" style={{ borderTopColor: m.colour, borderTopWidth: 4 }}>
      <div className="text-xs uppercase tracking-wide text-slate-500">{m.name}</div>
      <div className="mt-1 text-3xl font-semibold">{scored ? pct(score) : '—'}</div>
      <div className="mt-1 text-sm" style={{ color: scored && score >= 0.9 ? m.colour : undefined }}>{status}</div>
      {sub && <div className="mt-2 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

export function GateBadge({ label, pass, value, reason }: { label: string; pass: boolean | null; value?: string; reason?: string | null }) {
  const cls = pass === null ? 'bg-slate-100 text-slate-600' : pass ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800';
  const text = pass === null ? 'Not reporting' : pass ? 'PASS' : 'FAIL';
  return (
    <div className={`rounded-lg p-4 ${cls}`}>
      <div className="flex items-baseline justify-between">
        <div className="font-medium">{label}</div>
        <div className="text-sm font-semibold">{text}</div>
      </div>
      {value && <div className="mt-1 text-sm">{value}</div>}
      <div className="mt-1 text-xs opacity-80">{reason ?? 'Nothing has been entered for this gate yet — this is a baseline state, not a result.'}</div>
    </div>
  );
}
