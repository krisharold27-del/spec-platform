import Link from 'next/link';
import { Footer } from '@/components/ui';
import { VIRTUAL_GM, GM_COMPARISON } from '@/lib/virtual-gm';
import { PublicNav } from '@/components/public-nav';
import { LabourCalculator } from '@/components/labour-calculator';
import { SEAT_PRICES, HOME_CURRENCY, type Currency, PACKAGES } from '@/lib/pricing';
import { TIER, TIER_COMPARISON } from '@/lib/plan';
import { LIGHT_COLOUR } from '@/lib/today';

export const metadata = { title: 'SPEC — pricing' };

const ORDER: Currency[] = ['aud', 'nzd', 'gbp', 'eur', 'usd', 'cad'];
const REGION: Record<Currency, string> = {
  aud: 'Australia', nzd: 'New Zealand', gbp: 'United Kingdom',
  eur: 'Euro area', usd: 'United States', cad: 'Canada',
};

/**
 * Pricing.
 *
 * One price per seat per month, decided per region rather than converted — a price never moves
 * because an exchange rate did. No minimum, no tier that unlocks features, and the two things that
 * cost nothing said as plainly as the thing that costs something: people on the chart without a
 * seat are free, and so are board roles.
 */
export default function Pricing() {
  const home = SEAT_PRICES[HOME_CURRENCY];

  return (
    <div className="min-h-screen">
      <PublicNav current="/pricing" />

      <main className="mx-auto max-w-6xl px-6 py-10">
        {/*
          The ladder, stated before the price — design export 9.

          It is the only place the whole offer is said in one breath: try it, add training, and if
          neither gets you there, the program does. "No ongoing GM" is the line that matters; every
          other sentence on this page is about what you buy and that one is about what you stop
          buying.
        */}
        {/* A section, not a <header> — tests/public-site holds that every public page wears the
            one shared PublicNav and never grows a header of its own. */}
        <section className="mb-8">
          <span className="label-caps text-rust-700">{VIRTUAL_GM.kicker}</span>
          <p className="mt-3 max-w-[26ch] font-serif text-2xl leading-tight text-ink sm:text-3xl">
            {VIRTUAL_GM.headline}
          </p>
          <p className="mt-3 max-w-[58ch] text-base leading-relaxed text-ink-light">
            {VIRTUAL_GM.ladder}
          </p>
          {/* The comparison moved up here when the consulting price came off the card below. It is
              the argument for the whole ladder, not for one box, and it reads better before a price
              than beside one. */}
          <p className="mt-3 max-w-[58ch] text-sm leading-relaxed text-ink-light/80">{GM_COMPARISON}</p>
        </section>

        <h1 className="font-serif text-3xl tracking-tight text-ink sm:text-4xl">
          {home.symbol}{home.seat} per seat per month. The first one is free.
        </h1>
        <p className="mt-3 max-w-2xl text-base text-ink-light">
          <b>The first seat is free</b>, so a business of one pays nothing at all. No minimum. No tier
          that unlocks features. Drawing your whole business — every role, every reporting line, every
          KPI — is free and stays free however long it takes. Billing starts with the second person,
          because that is when SPEC starts doing work for more than one of you. A vacant or predicted
          role never carries a seat, however the structure moves.
        </p>

        {/*
          The difference itself, rather than two descriptions to hold side by side.

          Both tiers are the same price, so "what is Advanced" is not the question anybody is
          actually asking — "what do I get that I do not get now" is. Six rows, and the first two
          are deliberately ticked on both: a comparison that only lists what the cheaper one lacks
          reads as a downgrade, and Basic is not one.
        */}
        <section className="mt-10 card overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink/10 bg-cream/50 text-left">
                <th className="p-3 font-normal text-ink-light">What you get</th>
                <th className="w-24 p-3 font-normal text-ink-light">Basic</th>
                <th className="w-28 p-3 font-normal text-ink-light">Advanced</th>
              </tr>
            </thead>
            <tbody>
              {TIER_COMPARISON.map(row => (
                <tr key={row.label} className="border-t border-ink/10">
                  <td className="p-3 text-ink">{row.label}</td>
                  {[row.basic, row.advanced].map((has, i) => (
                    <td key={i} className="p-3">
                      <span
                        aria-label={has ? 'Included' : 'Not included'}
                        style={{ color: has ? LIGHT_COLOUR.green : undefined }}
                        className={has ? '' : 'text-ink-light/50'}
                      >
                        {has ? 'Yes' : 'No'}
                      </span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="mt-10 grid gap-4 sm:grid-cols-2">
          {(['advanced', 'basic'] as const).map(t => (
            <div
              key={t}
              className="card"
              style={{ borderTopColor: t === 'advanced' ? LIGHT_COLOUR.green : LIGHT_COLOUR.pending, borderTopWidth: 4 }}
            >
              <div className="label-caps">{t === 'advanced' ? 'With the power of AI' : 'Without it'}</div>
              <h2 className="mt-1 font-serif text-2xl text-ink">{TIER[t].label}</h2>
              <p className="mt-2 text-sm text-ink-light">{TIER[t].blurb}</p>
              <p className="mt-2 text-sm text-ink-light">{TIER[t].consequence}</p>
              <div className="mt-4 font-serif text-2xl text-ink">{home.symbol}{home.seat}<span className="text-sm text-ink-light"> / seat / month, first seat free</span></div>
              {t === 'basic' && (
                <p className="mt-2 text-xs text-ink-light">
                  The same price, because it is the same system. Basic is not a cheaper SPEC — it is SPEC
                  with the numbers entered by hand, which for a number no system produces is the only
                  honest way to get it.
                </p>
              )}
              {t === 'advanced' && (
                <p className="mt-2 text-xs text-ink-light">
                  AI usage is paid for through SPEC, so there is no second bill and no key of yours in it.
                </p>
              )}
            </div>
          ))}
        </section>

        <section className="mt-10">
          <h2 className="font-serif text-2xl text-ink">What is free</h2>
          <ul className="mt-3 grid gap-2 text-sm text-ink-light sm:grid-cols-3">
            <li className="card-inset">
              <span className="block text-ink">Roles with nobody in them</span>
              A vacancy is information, and charging for it would make businesses hide them.
            </li>
            <li className="card-inset">
              <span className="block text-ink">People on the chart, uninvited</span>
              A name is just a name until you choose to send an invite. Nothing is emailed and nothing bills.
            </li>
            <li className="card-inset">
              <span className="block text-ink">Board seats</span>
              The board reads the pack inside SPEC. Charging a director to read their own business would be absurd.
            </li>
          </ul>
        </section>

        <section className="mt-10">
          <h2 className="font-serif text-2xl text-ink">By region</h2>
          <p className="mt-1 text-sm text-ink-light">
            Decided rather than converted. A price never moves because an exchange rate did, and you are
            billed in your own currency.
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="table-clean min-w-[480px]">
              <thead>
                <tr><th>Region</th><th>Per seat, per month</th><th>Frontline leader, with training (not open yet)</th></tr>
              </thead>
              <tbody>
                {ORDER.map(c => (
                  <tr key={c}>
                    <td className="text-ink">{REGION[c]}</td>
                    <td className="font-mono">{SEAT_PRICES[c].symbol}{SEAT_PRICES[c].seat}</td>
                    <td className="font-mono">{SEAT_PRICES[c].symbol}{SEAT_PRICES[c].withTraining}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/*
          The rest of the ladder, with real prices on it.

          The paragraph at the top promises a program; a page that promises one and then never names
          it is asking somebody to enquire before they know whether they can afford it. So both are
          published — with "someone will be in contact" rather than a checkout, because these are a
          share of one person's week and there are only so many Tuesdays.

          The prices are SPEC's, not the mock-up's: the design draws A$1,000 and A$20,000, and every
          published price in this product reduces to 8 by digit sum. A$1,007 does and A$1,000 does
          not. See lib/pricing.
        */}
        <section className="mt-12">
          <h2 className="font-serif text-2xl text-ink">Beyond software — how much support you want running it</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {(['sessions', 'full_control'] as const).map(key => {
              const pkg = PACKAGES[key];
              return (
                <div key={key} className="card border-t-4 border-t-rust">
                  <p className="label-caps">{pkg.label}</p>
                  {/*
                    The price is shown only where the product says it may be — see `publishPrice`.
                    Consulting is the one that is quoted in a conversation instead: a five-figure
                    monthly number read before anybody has explained what a full day a week buys
                    ends the conversation rather than starting it.
                  */}
                  {pkg.publishPrice ? (
                    <>
                      <p className="mt-3 font-serif text-3xl text-ink">A${pkg.aud.toLocaleString('en-AU')}</p>
                      <p className="mt-1.5 text-sm text-ink-light">a month · sign up now</p>
                    </>
                  ) : (
                    <>
                      <p className="mt-3 font-serif text-3xl text-ink">Let&apos;s talk</p>
                      <p className="mt-1.5 text-sm text-ink-light">
                        Priced once we both know what it needs to do.
                      </p>
                    </>
                  )}
                  <p className="mt-4 text-sm leading-relaxed text-ink">{pkg.what}</p>
                  {!pkg.publishPrice && (
                    <p className="mt-4">
                      <a
                        href="mailto:manager@specbizhq.com?subject=SPEC%20-%20let%27s%20talk"
                        className="btn-secondary inline-flex text-sm"
                      >
                        Start the conversation
                      </a>
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        <section className="mt-12">
          <h2 className="font-serif text-2xl text-ink">What it is worth, at your numbers</h2>
          <p className="mt-1 max-w-2xl text-sm text-ink-light">
            The claim is about the labour component, not revenue: labour is the part a business controls
            month to month. Move the sliders to your own figures, and switch off any line you disagree with.
          </p>
          <div className="mt-6">
            <LabourCalculator seatCostAnnual={home.seat * 12} currencySymbol={home.symbol} />
          </div>
        </section>

        {/*
          The J curve argument lives in full on /how, because it is a question about the method
          rather than about the price. What stays here is the part that genuinely IS a pricing fact:
          which half of this page the collapse applies to. Stating it beside the two prices is the
          whole point — a claim that quietly spreads across the entire price list is the overclaim
          that would make every other number here worth less.
        */}
        <section className="mt-12">
          <h2 className="font-serif text-2xl text-ink">Which half of this page the J curve applies to</h2>
          <p className="mt-2 max-w-2xl text-base text-ink-light">
            Every transformation dips before it climbs, and the dip is deep because discovery is manual.
            SPEC collapses it by letting the systems you already run feed the KPIs, so the picture exists
            the day they connect.
          </p>
          <p className="mt-4 max-w-2xl text-base text-ink-light">
            <b className="text-ink">The collapse is caused by connectors, so it happens on Advanced and
            not on Basic.</b>{' '}
            Basic is a complete way to run the whole system — every number entered and confirmed by a
            named person — and it is not a shallow J curve. Saying otherwise would make every other
            number on this page worth less.
          </p>
          <Link href="/how" className="mt-4 link-go">
            How the curve is measured, and what else holds one open →
          </Link>
        </section>

        <section className="card mt-12">
          <h2 className="font-serif text-xl text-ink">If you stop paying</h2>
          <p className="mt-2 text-sm text-ink-light">
            It goes read-only. Nothing is deleted, every month you closed stays exactly as you closed it,
            and export always works. A business that has stopped paying still owns its own record.
          </p>
        </section>

        <div className="mt-10">
          <Link href="/signup" className="btn-primary inline-block">Start drawing your business</Link>
          <p className="mt-2 text-xs text-ink-light">No card. Nothing bills until you invite somebody in.</p>
        </div>

        <Footer />
      </main>
    </div>
  );
}
