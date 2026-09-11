import Link from 'next/link';
import { Footer } from '@/components/ui';
import { PublicNav } from '@/components/public-nav';
import { SECTORS, sectorByKey, QUESTIONS } from '@/lib/sectors';
import { PILLARS } from '@/lib/scoring';
import { PILLAR_META, BRAND_COLOUR } from '@/lib/pillars';
import { CHARTER } from '@/lib/charter';

export const metadata = { title: 'SPEC — by sector' };

/**
 * What the four questions look like in different industries.
 *
 * The point of the page is what does NOT change. Every business wants to make money, do it safely,
 * have people who are good at their jobs and love them, and stay clear to work. Only what each one
 * is measured by varies — and a sector page that showed four different frameworks would be arguing
 * against the product.
 */
export default async function Sectors({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  const { s } = await searchParams;
  const sector = sectorByKey(s);

  return (
    <div className="min-h-screen">
      <PublicNav current="/sectors" />

      <main className="mx-auto max-w-6xl px-6 py-10">
        <h1 className="font-serif text-3xl tracking-tight text-ink sm:text-4xl">
          The same four questions, whatever you do.
        </h1>
        <p className="mt-3 max-w-2xl text-base text-ink-light">
          Every business wants to make money, do it safely, have people who are good at their jobs and
          love them, and stay clear to work. What changes between industries is not the questions — it is
          what each one is measured by.
        </p>

        <div className="mt-8 flex flex-wrap gap-2">
          {SECTORS.map(x => (
            <Link
              key={x.key}
              href={`/sectors?s=${x.key}`}
              className={`rounded-full px-4 py-2 text-sm transition-colors ${
                x.key === sector.key ? 'bg-rust text-cream' : 'bg-surface text-ink hover:bg-cream'
              }`}
            >
              {x.name}
            </Link>
          ))}
        </div>

        <section className="card mt-6">
          <h2 className="font-serif text-2xl text-ink">{sector.name}</h2>
          <p className="mt-2 text-base text-ink-light">{sector.line}</p>
          <p className="mt-3 text-sm text-ink-light">
            <span className="label-caps">What differs</span>
            <span className="mt-1 block">{sector.shape}</span>
          </p>
        </section>

        <section className="mt-6 grid gap-4 sm:grid-cols-2">
          {PILLARS.map(p => (
            <div key={p} className="card" style={{ borderTopColor: BRAND_COLOUR[p], borderTopWidth: 4 }}>
              <div className="label-caps">{PILLAR_META[p].name}</div>
              <h3 className="mt-1 font-serif text-lg text-ink">{QUESTIONS[p]}</h3>
              <ul className="mt-3 grid gap-1.5 text-sm text-ink-light">
                {sector.measures[p].map(m => <li key={m}>· {m}</li>)}
              </ul>
            </div>
          ))}
        </section>

        <section className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="card">
            <h3 className="font-serif text-lg text-ink">Roles that usually carry a scorecard</h3>
            <p className="mt-1 text-xs text-ink-light">
              Roles, never people. A role is defined by what the business needs and can exist with nobody
              in it — that is what lets you draw the business you need rather than the one you have.
            </p>
            <ul className="mt-3 grid gap-1.5 text-sm text-ink-light">
              {sector.roles.map(r => <li key={r}>· {r}</li>)}
            </ul>
          </div>
          <div className="card">
            <h3 className="font-serif text-lg text-ink">Where the numbers usually come from</h3>
            <p className="mt-1 text-xs text-ink-light">
              By category, never by product. SPEC reasons about the kind of number a system produces, so
              there is no vendor list for your stack to be absent from — and anything with no system is
              confirmed by a named person, which is a complete way to run it.
            </p>
            <ul className="mt-3 grid gap-1.5 text-sm text-ink-light">
              {sector.systems.map(x => <li key={x}>· {x}</li>)}
            </ul>
          </div>
        </section>

        {/*
          The charter belongs on this page more than anywhere else on the site. The whole argument
          here is that the four questions do not change and only the measures do — and the charter is
          the sharpest form of that: four commitments that are word-for-word identical in a workshop,
          a clinic and a construction firm. Rendered from lib/charter rather than restated, so the
          claim on the site is literally the rule in the product.
        */}
        <section className="mt-10">
          <h2 className="font-serif text-2xl text-ink">What does not vary at all</h2>
          <p className="mt-2 max-w-2xl text-sm text-ink-light">
            The measures above are a starting point and you will change them. Underneath them sit four
            commitments that are identical in every business on SPEC, whatever it does — carried by
            pass-or-fail gates reported beside the score and never averaged into it.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {CHARTER.map(c => (
              <div key={c.pillar} className="card-inset">
                <span className="label-caps" style={{ color: BRAND_COLOUR[c.pillar] }}>
                  {PILLAR_META[c.pillar].name}
                </span>
                <span className="mt-1 block text-ink">{c.says}</span>
                <span className="mt-2 block text-xs text-ink-light">
                  {c.basis === 'absolute' ? 'The figure is nought, and it is not negotiated.' : 'The one figure SPEC cannot supply — it is read from your own record.'}
                </span>
              </div>
            ))}
          </div>
          <Link href="/how" className="mt-4 inline-block text-sm text-rust-700 hover:underline">
            Why three of them are absolute and one is earned →
          </Link>
        </section>

        <div className="mt-10">
          <Link href="/signup" className="btn-primary inline-block">Start with your own roles</Link>
          <p className="mt-2 text-xs text-ink-light">
            SPEC proposes the roles and the measures; you edit them. Nobody is handed a blank form to
            invent an answer for.
          </p>
        </div>

        <Footer />
      </main>
    </div>
  );
}
