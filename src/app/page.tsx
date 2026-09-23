import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Footer } from '@/components/ui';
import { getCurrentUser } from '@/lib/auth';
import { DEFAULT_AFTER_SIGN_IN } from '@/lib/auth-redirect';
import { SiteVipMark } from '@/components/sitevip-mark';
import { StartBox, SystemsChoice } from '@/components/sitevip-landing';
import { SITEVIP_FLOW, SITEVIP_USERS, startHref } from '@/lib/sitevip';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'siteVIP — run the whole trade business from one screen',
  description:
    'siteVIP is the trades edition of SPEC. Quote it, win it, book the crew, do the job, invoice it, get paid — with your people, safety and KPIs on the same screen.',
  alternates: { canonical: '/' },
};

/**
 * The front door at www.sitevipapp.com — siteVIP, the trades edition of SPEC.
 *
 * Built to designs/siteVIP Landing.dc.html (23 September 2026). SPEC's own front door — the problem
 * box, the reading, the proof and the pricing — moved to /spec that day, whole, and is linked from
 * the "siteVIP is the trades edition of SPEC" line at the foot of this page.
 *
 * One ask, twice: the business name. Enter (or Start) goes to the same sign-up the SPEC front door
 * hands over to, carrying the name in `?business=` so it is already filled in there and never asked
 * for a second time. See `startHref` in lib/sitevip.
 *
 * Vendor names in the design's "keep what you have" list are written as categories — see the note
 * at the top of lib/sitevip.
 */
export default async function SiteVipLanding() {
  /*
    Somebody already signed in does not need the shopfront; they need their day. Guarded, exactly as
    the SPEC front door is: this page must render with NO database and NO sign-in service configured,
    so a failure to ask is read as "not signed in", which is both the safe answer and the true one.
  */
  if (await getCurrentUser().catch(() => null)) redirect(DEFAULT_AFTER_SIGN_IN);

  return (
    <div className="min-h-screen bg-white font-sans text-ink">
      <nav className="mx-auto flex max-w-[1200px] items-center justify-between gap-4 px-[clamp(20px,5vw,72px)] py-[22px]">
        <Link href="/" aria-label="siteVIP home" className="inline-flex min-h-[44px] items-center">
          <SiteVipMark powered />
        </Link>
        <Link href="/signin" className="inline-flex min-h-[44px] items-center text-sm text-rust-700 hover:underline">Sign in</Link>
      </nav>

      <main className="mx-auto max-w-[1200px] px-[clamp(20px,5vw,72px)] pb-20">
        <section className="max-w-[820px] pb-[clamp(40px,5vw,64px)] pt-[clamp(40px,7vw,96px)]">
          <span className="inline-flex items-center gap-2 rounded-full bg-light-green/10 px-3.5 py-[7px] text-[13px] text-sage-800">
            <span className="h-2 w-2 rounded-full bg-light-green" aria-hidden />
            The trades edition of SPEC
          </span>
          <h1 className="mt-[22px] font-serif text-[clamp(40px,6.4vw,80px)] leading-[1.02]">
            Run the whole trade business from one screen.
          </h1>
          <p className="mt-[22px] max-w-[56ch] text-[clamp(17px,1.6vw,20px)] leading-[1.55] text-ink-light">
            Quote it, win it, book the crew, do the job, invoice it, get paid. Your people, safety and
            KPIs are on the same screen. Use siteVIP for everything, or connect the systems you already
            run. As many or as few as you like.
          </p>
          <StartBox id="business-top" />
        </section>

        <section aria-label="The job, start to finish" className="pb-[clamp(48px,6vw,80px)]">
          <p className="mb-[18px] text-[12.5px] font-semibold uppercase tracking-[0.06em] text-ink-light">
            One job, start to finish, in one place
          </p>
          <ol className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,150px),1fr))] gap-3">
            {SITEVIP_FLOW.map((f, i) => (
              <li key={f.label} className="grid content-start gap-2.5 rounded-[20px] bg-cream px-[18px] pb-5 pt-[18px]">
                <span className="grid h-8 w-8 place-content-center rounded-full bg-white text-[13px] font-bold text-sage-800">{i + 1}</span>
                <span className="font-serif text-[17px] leading-tight">{f.label}</span>
                <span className="text-[13px] leading-[19px] text-ink-light">{f.line}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,320px),1fr))] items-start gap-[clamp(20px,3vw,32px)] pb-[clamp(48px,6vw,80px)]">
          <div className="rounded-lg bg-cream p-[clamp(24px,3vw,36px)]">
            <p className="mb-2 text-[12.5px] font-semibold uppercase tracking-[0.06em] text-ink-light">Your choice, system by system</p>
            <h2 className="mb-[18px] font-serif text-[22px] leading-tight">Use siteVIP, or keep what you have.</h2>
            <SystemsChoice />
          </div>

          <div className="grid gap-4">
            <div className="rounded-lg bg-white p-[clamp(24px,3vw,32px)] shadow-sm">
              <h2 className="font-serif text-[22px] leading-tight">Everyone gets their own screen.</h2>
              <ul className="mt-4 grid gap-3">
                {SITEVIP_USERS.map(u => (
                  <li key={u.who} className="flex items-start gap-3">
                    <span className="mt-[7px] h-2.5 w-2.5 flex-none rounded-full bg-light-green" aria-hidden />
                    <span className="text-[14.5px] leading-[22px]"><strong>{u.who}</strong> {u.what}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-lg bg-sage-100 p-[clamp(24px,3vw,32px)]">
              <h2 className="font-serif text-[22px] leading-tight">Before you pay for an expensive GM, start with SPEC.</h2>
              <p className="mt-2.5 text-[14.5px] leading-[23px] text-ink-light">
                Every job feeds the KPI boards. Every KPI rolls up to the Virtual GM Power Meter. You see
                the whole business at a glance, every morning.
              </p>
            </div>
          </div>
        </section>

        <section className="flex flex-wrap items-center justify-between gap-5 rounded-lg bg-cream p-[clamp(28px,4vw,48px)]">
          <p className="m-0 max-w-[22ch] font-serif text-[clamp(24px,3vw,34px)] leading-[1.15]">One screen. The whole trade business.</p>
          {/* The second Start. Nothing typed down here, so it goes in without a name; sign-up asks. */}
          <Link href={startHref(null)} className="rounded-full bg-rust px-7 py-4 text-base font-semibold text-white hover:bg-rust-600">
            Start &rarr;
          </Link>
        </section>

        <p className="mt-7 text-[13px] text-ink-light">
          siteVIP is the trades edition of <Link href="/spec" className="text-rust-700 underline">SPEC</Link>, at
          sitevipapp.com. More editions, built on the same engine, are coming.{' '}
          <Link href="/spec" className="text-rust-700 hover:underline">See SPEC, the full edition &rarr;</Link>
        </p>

        <Footer />
      </main>
    </div>
  );
}
