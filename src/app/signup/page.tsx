import Script from 'next/script';
import { Footer } from '@/components/ui';
import { formSecret, issueFormToken, turnstileSiteKey } from '@/lib/bot-check';
import { signUp } from './actions';

export const dynamic = 'force-dynamic';

const NAMES: Record<string, string> = { safety: 'Safety', people: 'People', earnings: 'Earnings', compliance: 'Compliance' };

const ERRORS: Record<string, string> = {
  missing: 'Business name, your name and a work email are all needed.',
  too_fast: 'That went through quicker than a person can type. Check the details and press Create again.',
  expired: 'This page was open a long while. Check the details and press Create again.',
  check: "The check that you're a person didn't finish. Press Create again.",
  busy: 'Several businesses were just created from this network. Try again in an hour, or email manager@specbizhq.com.',
};

export default async function SignUp({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const answered = ['safety', 'people', 'earnings', 'compliance'].filter(p => sp[`q_${p}`]);
  const yes = answered.filter(p => sp[`q_${p}`] === 'yes');
  const error = sp.error ? ERRORS[sp.error] ?? ERRORS.expired : null;
  const siteKey = turnstileSiteKey();
  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <div className="label-caps">SPEC</div>
      {answered.length === 4 ? (
        yes.length ? (
          <>
            <h1 className="mt-1 font-serif text-2xl font-bold text-ink">You said yes to {yes.map(p => NAMES[p]).join(', ')}.</h1>
            <p className="mt-2 text-sm text-ink-light">Then you need this system. SPEC isolates the pillar that's hurting, drills to the specific cause, and prescribes the fix for that pillar — not a generic overhaul. Next you learn <b>why</b>: that's what the journey is for, and we can help with it.</p>
          </>
        ) : (
          <>
            <h1 className="mt-1 font-serif text-2xl font-bold text-ink">Four noes. That's rare.</h1>
            <p className="mt-2 text-sm text-ink-light">If it's true, SPEC keeps it true: the 90% rule means you can prove it month after month rather than assume it. If it's the polite answer, the journey will find out — set up the business and see.</p>
          </>
        )
      ) : (
        <>
          <h1 className="mt-1 font-serif text-2xl font-bold text-ink">Start with your business</h1>
          <p className="mt-2 text-sm text-ink-light">Haven't answered the <a className="underline" href="/start">four questions</a> yet? Start there.</p>
        </>
      )}
      {error && <p className="mt-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-900">{error}</p>}
      <form action={signUp} className="relative mt-8 space-y-4">
        {answered.map(p => <input key={p} type="hidden" name={`q_${p}`} value={sp[`q_${p}`]} />)}
        <input type="hidden" name="form_token" value={issueFormToken(formSecret())} />
        {/* Left empty by people, who never see it; filled in by bots, which fill in everything. */}
        <div aria-hidden="true" className="absolute -left-[9999px] top-0 h-px w-px overflow-hidden">
          <label>Website<input name="website" tabIndex={-1} autoComplete="off" defaultValue="" /></label>
        </div>
        <label className="block text-sm">Business name<input name="business" required maxLength={200} className="mt-1 w-full rounded border px-3 py-2" placeholder="e.g. Northside Electrical" /></label>
        <label className="block text-sm">Sector<input name="sector" maxLength={200} className="mt-1 w-full rounded border px-3 py-2" placeholder="Electrical services, logistics, plumbing…" /></label>
        <label className="block text-sm">Your name<input name="name" required maxLength={200} className="mt-1 w-full rounded border px-3 py-2" /></label>
        <label className="block text-sm">Work email<input name="email" type="email" required maxLength={320} className="mt-1 w-full rounded border px-3 py-2" /></label>
        <fieldset className="text-sm">
          <legend>Your role at the top of the business</legend>
          <label className="mt-1 mr-4 inline-flex items-center gap-1"><input type="radio" name="topRole" value="gm" defaultChecked /> General Manager</label>
          <label className="inline-flex items-center gap-1"><input type="radio" name="topRole" value="owner" /> Owner / Managing Director</label>
        </fieldset>
        {siteKey && <div className="cf-turnstile" data-sitekey={siteKey} data-appearance="interaction-only" />}
        <button className="btn-primary w-full py-2.5">Create my business</button>
        <p className="text-center text-xs text-ink-light">Already set up? <a href="/signin" className="underline">Sign in</a></p>
      </form>
      {siteKey && <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="afterInteractive" />}
      <Footer />
    </main>
  );
}
