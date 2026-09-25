import Link from 'next/link';
import { Footer } from '@/components/ui';
import { VIRTUAL_GM, GM_COMPARISON } from '@/lib/virtual-gm';
import { PublicNav } from '@/components/public-nav';
import { LabourCalculator } from '@/components/labour-calculator';
import { SEAT_PRICES, HOME_CURRENCY, type Currency, PACKAGES } from '@/lib/pricing';

import { LIGHT_COLOUR } from '@/lib/today';
import { EVERYTHING_IN_IT } from '@/lib/plan';

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
          <p className="mt-3 max-w-[58ch] text-base leading-relaxed text-ink-light">{VIRTUAL_GM.both}</p>
          {/* The comparison moved up here when the consulting price came off the card below. It is
              the argument for the whole ladder, not for one box, and it reads better before a price
              than beside one. */}
          <p className="mt-3 max-w-[58ch] text-sm leading-relaxed text-ink-light/80">{GM_COMPARISON}</p>
        </section>

        <h1 className="font-serif text-3xl tracking-tight text-ink sm:text-4xl">
          {home.symbol}{home.leadership} a leadership seat, {home.symbol}{home.team} a team seat, per month. The first one is free.
        </h1>
        <p className="mt-3 max-w-2xl text-base text-ink-light">
          <b>The first seat is free</b>, so a business of one pays nothing at all. No minimum. No tier
          that unlocks features. Drawing your whole business — every role, every reporting line, every
          KPI — is free and stays free however long it takes. Billing starts with the second person,
          because that is when SPEC starts doing work for more than one of you. A vacant or predicted
          role never carries a seat, however the structure moves.
        </p>

        {/*
          One product, and what is in it. One price per seat, not two.

          This was two cards and a six-row comparison table with Basic and Advanced columns, and
          then, briefly on 22 September, one price per seat with a second, dearer one for the
          assistant. Kris, having looked at that result: *"i also feel like i don't want to have 2
          different prices. either use the system or not - make it simple."* There was never a
          second product behind the second price — every subscribed business gets the assistant
          either way (see `aiActive` in lib/plan) — so there is one price again, and the choice this
          section used to describe no longer exists.
        */}
        <section className="mt-10 card">
          <h2 className="font-serif text-2xl text-ink">Everything is in it, from the first minute</h2>
          <p className="mt-2 max-w-2xl text-sm text-ink-light">
            There is one SPEC. Nothing is held back for a bigger plan, and there is no version of
            this where you pay more for the same thing. Connectors, the assistant and every screen
            are on from the first minute.
          </p>
          <ul className="mt-5 grid gap-2 text-sm sm:grid-cols-2">
            {EVERYTHING_IN_IT.map(line => (
              <li key={line} className="card-inset flex items-baseline gap-2">
                <span aria-hidden style={{ color: LIGHT_COLOUR.green }}>&#10003;</span>
                <span className="text-ink">{line}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-ink-light">
            AI usage is paid for through SPEC, so there is no second bill and no key of yours in it.
          </p>
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
          {/*
            ── Two columns, because there are two prices ────────────────────────────────────────

            This table briefly had four — a leadership and a team price, each with an "with AI"
            variant — for the one session the Advanced tier existed. Retired 22 September along
            with the tier: see the note above `SEAT_PRICES` in lib/pricing.
          */}
          <div className="mt-4 overflow-x-auto">
            <table className="table-clean min-w-[420px]">
              <thead>
                <tr>
                  <th>Region</th>
                  <th>Leadership seat</th>
                  <th>Team seat</th>
                </tr>
              </thead>
              <tbody>
                {ORDER.map(c => (
                  <tr key={c}>
                    <td className="text-ink">{REGION[c]}</td>
                    <td className="font-mono">{SEAT_PRICES[c].symbol}{SEAT_PRICES[c].leadership}</td>
                    <td className="font-mono">{SEAT_PRICES[c].symbol}{SEAT_PRICES[c].team}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/*
            Which of these include tax, because A$134 and US$134 are the same number and not the
            same price. Stripe's defaults for these currencies — see TAX_INCLUSIVE in lib/pricing.
          */}
          <p className="mt-3 text-xs text-ink-light">
            Australian, New Zealand, British and euro prices include tax &mdash; the Australian
            figures include GST. United States and Canadian prices are before tax, which is added
            at checkout.
          </p>
        </section>

        {/*
          The rest of the ladder, with real prices on it.

          The paragraph at the top promises a program; a page that promises one and then never names
          it is asking somebody to enquire before they know whether they can afford it. So both are
          published — with "someone will be in contact" rather than a checkout, because these are a
          share of one person's week and there are only so many Tuesdays.

          Training is published; consulting is not. That is not coyness about the second one — it
          has no price. Kris's Stripe handoff of 19 September archives the A$20,888 product and
          makes consulting quote-only, so there is no number to show and `packagePrice` says
          "Speak to us" instead of inventing one. See lib/pricing.
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
                  {pkg.publishPrice && pkg.aud !== null ? (
                    <>
                      <p className="mt-3 font-serif text-3xl text-ink">A${pkg.aud.toLocaleString('en-AU')}</p>
                      <p className="mt-1.5 text-sm text-ink-light">
                        a month, in Australian dollars · sign up now
                      </p>
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
            <LabourCalculator seatCostAnnual={home.leadership * 12} currencySymbol={home.symbol} />
          </div>
        </section>

        {/*
          The J curve argument lives in full on /how, because it is a question about the method
          rather than about the price. It used to need a paragraph here too, saying which half of
          this page's now-retired Basic/Advanced split it applied to — that split is gone (see the
          note above `SEAT_PRICES` in lib/pricing), so there is nothing left to carve the claim in
          half for.
        */}
        <section className="mt-12">
          <h2 className="font-serif text-2xl text-ink">How SPEC shortens the J curve</h2>
          <p className="mt-2 max-w-2xl text-base text-ink-light">
            Every transformation dips before it climbs, and the dip is deep because discovery is manual.
            SPEC collapses it by letting the systems you already run feed the KPIs, so the picture exists
            the day they connect.
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
