import { Footer } from '@/components/ui';
import { signUp } from './actions';

const NAMES: Record<string, string> = { safety: 'Safety', people: 'People', earnings: 'Earnings', compliance: 'Compliance' };

export default async function SignUp({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const answered = ['safety', 'people', 'earnings', 'compliance'].filter(p => sp[`q_${p}`]);
  const yes = answered.filter(p => sp[`q_${p}`] === 'yes');
  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <div className="text-sm font-semibold tracking-wide text-slate-500">SPEC</div>
      {answered.length === 4 ? (
        yes.length ? (
          <>
            <h1 className="mt-1 text-2xl font-semibold">You said yes to {yes.map(p => NAMES[p]).join(', ')}.</h1>
            <p className="mt-2 text-sm text-slate-600">Then you need this system. SPEC isolates the pillar that's hurting, drills to the specific cause, and prescribes the fix for that pillar — not a generic overhaul. Next you learn <b>why</b>: that's what the journey is for, and we can help with it.</p>
          </>
        ) : (
          <>
            <h1 className="mt-1 text-2xl font-semibold">Four noes. That's rare.</h1>
            <p className="mt-2 text-sm text-slate-600">If it's true, SPEC keeps it true: the 90% rule means you can prove it month after month rather than assume it. If it's the polite answer, the journey will find out — set up the business and see.</p>
          </>
        )
      ) : (
        <>
          <h1 className="mt-1 text-2xl font-semibold">Start with your business</h1>
          <p className="mt-2 text-sm text-slate-600">Haven't answered the <a className="underline" href="/start">four questions</a> yet? Start there.</p>
        </>
      )}
      <form action={signUp} className="mt-8 space-y-4">
        {answered.map(p => <input key={p} type="hidden" name={`q_${p}`} value={sp[`q_${p}`]} />)}
        <label className="block text-sm">Business name<input name="business" required className="mt-1 w-full rounded border px-3 py-2" placeholder="e.g. Northside Electrical" /></label>
        <label className="block text-sm">Sector<input name="sector" className="mt-1 w-full rounded border px-3 py-2" placeholder="Electrical services, logistics, plumbing…" /></label>
        <label className="block text-sm">Your name<input name="name" required className="mt-1 w-full rounded border px-3 py-2" /></label>
        <label className="block text-sm">Work email<input name="email" type="email" required className="mt-1 w-full rounded border px-3 py-2" /></label>
        <fieldset className="text-sm">
          <legend>Your role at the top of the business</legend>
          <label className="mt-1 mr-4 inline-flex items-center gap-1"><input type="radio" name="topRole" value="gm" defaultChecked /> General Manager</label>
          <label className="inline-flex items-center gap-1"><input type="radio" name="topRole" value="owner" /> Owner / Managing Director</label>
        </fieldset>
        <button className="w-full rounded-lg bg-slate-900 px-5 py-2.5 text-white hover:bg-slate-700">Create my business</button>
        <p className="text-center text-xs text-slate-500">Already set up? <a href="/signin" className="underline">Sign in</a></p>
      </form>
      <Footer />
    </main>
  );
}
