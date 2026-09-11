import { BRAND_COLOUR } from '@/lib/pillars';
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
    <main className="min-h-screen bg-surface">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <div className="label-caps">SPEC Business Solutions</div>
        <h1 className="mt-2 font-serif text-4xl tracking-tight text-ink">Four questions. Answer honestly.</h1>
        <p className="mt-3 text-lg text-ink-light">Effort is never the problem — your business works hard. The gap is unsolved problems. Yes to any of these and you need this system. Then you learn why. We can help with that.</p>
        <form action="/signup" method="get" className="mt-10 space-y-4">
          {PILLARS.map(p => (
            <fieldset key={p} className="flex items-center justify-between rounded-lg border border-ink/10 p-4" style={{ borderLeftColor: BRAND_COLOUR[p], borderLeftWidth: 6 }}>
              <legend className="sr-only">{ASK[p]}</legend>
              <div><div className="label-caps">{PILLAR_META[p].name}</div><div className="text-lg font-medium text-ink">{ASK[p]}</div></div>
              <div className="flex gap-4 text-sm">
                <label className="inline-flex items-center gap-1"><input type="radio" name={`q_${p}`} value="yes" required /> Yes</label>
                <label className="inline-flex items-center gap-1"><input type="radio" name={`q_${p}`} value="no" /> No</label>
              </div>
            </fieldset>
          ))}
          <button className="btn-primary w-full py-3 text-base">See what this means for my business</button>
          <p className="text-center text-xs text-ink-light">Already using SPEC? <a href="/signin" className="underline">Sign in</a></p>
        </form>
        <Footer />
      </div>
    </main>
  );
}
