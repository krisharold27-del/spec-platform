import { PILLAR_META, Footer } from '@/components/ui';
import { PILLARS } from '@/lib/scoring';

const ASK: Record<string, string> = {
  safety: 'Do you have safety issues?',
  people: 'Do you have people issues?',
  earnings: 'Do you have earnings issues?',
  compliance: 'Do you have compliance issues?',
};

export default function Start() {
  return (
    <main className="min-h-screen bg-white">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <div className="text-sm font-semibold tracking-wide text-slate-500">SPEC BUSINESS SOLUTIONS</div>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight">Four questions. Answer honestly.</h1>
        <p className="mt-3 text-lg text-slate-600">Effort is never the problem — your business works hard. The gap is unsolved problems. Yes to any of these and you need this system. Then you learn why. We can help with that.</p>
        <form action="/signup" method="get" className="mt-10 space-y-4">
          {PILLARS.map(p => (
            <fieldset key={p} className="flex items-center justify-between rounded-lg border p-4" style={{ borderLeftColor: PILLAR_META[p].colour, borderLeftWidth: 6 }}>
              <legend className="sr-only">{ASK[p]}</legend>
              <div><div className="text-xs uppercase tracking-wide text-slate-500">{PILLAR_META[p].name}</div><div className="text-lg font-medium">{ASK[p]}</div></div>
              <div className="flex gap-4 text-sm">
                <label className="inline-flex items-center gap-1"><input type="radio" name={`q_${p}`} value="yes" required /> Yes</label>
                <label className="inline-flex items-center gap-1"><input type="radio" name={`q_${p}`} value="no" /> No</label>
              </div>
            </fieldset>
          ))}
          <button className="w-full rounded-lg bg-slate-900 px-5 py-3 text-white hover:bg-slate-700">See what this means for my business</button>
          <p className="text-center text-xs text-slate-500">Already using SPEC? <a href="/signin" className="underline">Sign in</a></p>
        </form>
        <Footer />
      </div>
    </main>
  );
}
