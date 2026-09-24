import Link from 'next/link';
import { redirect } from 'next/navigation';
import { readFileSync, readdirSync } from 'node:fs';
import { Shell } from '@/components/ui';
import { getCurrentUser } from '@/lib/auth';
import { isAdminEmail } from '@/lib/admin';
import { LIGHT_COLOUR, LIGHT_INK } from '@/lib/today';
import { totalsOf, coverageLine, BUILT_LABEL } from '@/lib/coverage';
import {
  claims, byStanding, standingLine, STANDING_LABEL, economics,
  DEMO, gapsToName, scaleEvidence, scaleGap, capabilityCount,
  type Standing,
} from '@/lib/investor';

export const dynamic = 'force-dynamic';

const TONE: Record<Standing, string> = {
  proven: LIGHT_COLOUR.green,
  read: LIGHT_COLOUR.amber,
  unverified: LIGHT_COLOUR.red,
};
const INK: Record<Standing, string> = {
  proven: LIGHT_INK.green,
  read: LIGHT_INK.amber,
  unverified: LIGHT_INK.red,
};

/**
 * Count what actually exists, rather than quoting a number somebody typed.
 *
 * The rest of this page derives everything from the product's own modules; these three come off the
 * filesystem for the same reason. A pitch figure that has to be remembered is a pitch figure that
 * is wrong by the following week.
 */
function measured() {
  const files = readdirSync('tests').filter(f => f.endsWith('.test.ts'));
  const tests = files.reduce((n, f) => {
    const src = readFileSync(`tests/${f}`, 'utf8');
    return n + (src.match(/^\s*it\(/gm)?.length ?? 0);
  }, 0);
  const journeys = readdirSync('scripts').filter(f => f.endsWith('-journey.mjs') || f.endsWith('-journey.mts')).length;
  const rls = (readFileSync('drizzle/0001_rls.sql', 'utf8').match(/'[a-z_]+'/g) ?? []).length;
  return { tests, files: files.length, journeys, rls };
}

/**
 * The investor pack — private, like the cockpit.
 *
 * Kris, a week out from pitching: *"how do i know everything is done right and safe if you dont
 * even know"*. The answer is not a document saying it is safe. It is this: every claim worth making
 * in a room, with the thing that backs it, and the weak ones named first rather than buried.
 */
export default async function InvestorPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/signin');
  if (!isAdminEmail(user.email)) redirect('/my-page');

  const m = measured();
  const all = claims(m.tests, m.files, m.journeys, m.rls);
  const t = totalsOf({});
  const money = economics('aud');
  const gap = scaleGap();

  return (
    <Shell
      title="Investor pack"
      kicker="Private · not client facing"
      headline="What is proven, what is claimed, and the difference."
      subtitle="Everything on this page is read from the product itself. No figure here was typed in, because a typed figure is wrong by the following week."
    >
      <p className="-mt-3 mb-6 max-w-3xl text-base text-ink">{standingLine(all)}</p>

      {/* ── The weak ones first ──────────────────────────────────────────────────────────────── */}
      {(['unverified', 'read', 'proven'] as Standing[]).map(standing => {
        const rows = byStanding(all, standing);
        if (rows.length === 0) return null;
        return (
          <section key={standing} className="card mt-6">
            <h2 className="flex flex-wrap items-center gap-2 font-serif text-xl text-ink">
              <span className="h-3 w-3 rounded-full" style={{ background: TONE[standing] }} />
              {STANDING_LABEL[standing]}
            </h2>
            <ul className="mt-3 grid gap-3">
              {rows.map(c => (
                <li key={c.says} className="rounded-2xl bg-cream px-4 py-3">
                  <p className="font-semibold text-ink">{c.says}</p>
                  <p className="mt-1 text-sm text-ink-light">{c.backing}</p>
                </li>
              ))}
            </ul>
            {standing === 'unverified' && (
              <p className="mt-3 text-sm font-semibold" style={{ color: INK.unverified }}>
                Do not say this in a room until somebody has loaded the live site.
              </p>
            )}
          </section>
        );
      })}

      {/* ── What is actually built ───────────────────────────────────────────────────────────── */}
      <section className="card mt-6">
        <h2 className="font-serif text-xl text-ink">What is built</h2>
        <p className="mt-1 text-sm text-ink-light">{coverageLine(t)}</p>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {[
            { label: 'Built and working', value: t.builtHere, tone: LIGHT_COLOUR.green },
            { label: 'Partly there', value: t.partlyHere, tone: LIGHT_COLOUR.amber },
            { label: 'Not written yet', value: t.inSpec - t.builtHere - t.partlyHere, tone: LIGHT_COLOUR.pending },
          ].map(x => (
            <div key={x.label} className="rounded-2xl bg-cream px-4 py-3">
              <span className="flex items-center gap-2 text-sm text-ink-light">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: x.tone }} />
                {x.label}
              </span>
              <p className="font-serif text-3xl text-ink">{x.value}</p>
            </div>
          ))}
        </div>

        <h3 className="mt-5 font-semibold text-ink">Name these before they are found</h3>
        <ul className="mt-2 grid gap-1.5 text-sm">
          {gapsToName().map(c => (
            <li key={c.key} className="text-ink-light">
              <span className="font-semibold text-ink">{c.name}</span>
              {' — '}<span style={{ color: INK.read }}>{BUILT_LABEL[c.built]}</span>
              {c.evidence ? `. ${c.evidence}` : ''}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-ink-light">
          All {capabilityCount()} are on <Link href="/coverage" className="text-rust-700 hover:underline">Coverage</Link>,
          each saying its own state.
        </p>
      </section>

      {/* ── Scale ────────────────────────────────────────────────────────────────────────────── */}
      <section className="card mt-6">
        <h2 className="font-serif text-xl text-ink">Does it hold at {money.targetSeats.toLocaleString('en-AU')} seats</h2>
        {gap && (
          <p className="mt-2 rounded-2xl px-4 py-3 text-sm" style={{ background: `color-mix(in srgb, ${LIGHT_COLOUR.amber} 12%, transparent)`, color: INK.read }}>
            <b>The one that is not done:</b> {gap.label}. {gap.evidence}
          </p>
        )}
        <ul className="mt-3 grid gap-2">
          {scaleEvidence().filter(c => c.done).map(c => (
            <li key={c.label} className="rounded-2xl bg-cream px-4 py-3">
              <p className="font-semibold text-ink">{c.label}</p>
              <p className="mt-1 text-sm text-ink-light">{c.evidence}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* ── The money ────────────────────────────────────────────────────────────────────────── */}
      <section className="card mt-6">
        <h2 className="font-serif text-xl text-ink">The money</h2>
        <p className="mt-1 text-sm text-ink-light">
          Read from the prices Stripe actually charges, so this moves the day a price does.
        </p>
        <dl className="mt-4 grid gap-3 sm:grid-cols-3">
          {[
            { k: 'Leadership seat', v: `${money.symbol}${money.leadership} a month` },
            { k: 'Team seat', v: `${money.symbol}${money.team} a month` },
            { k: 'A JBI-shaped business', v: `${money.symbol}${money.exampleMonthly.toLocaleString('en-AU')} a month` },
          ].map(x => (
            <div key={x.k} className="rounded-2xl bg-cream px-4 py-3">
              <dt className="text-sm text-ink-light">{x.k}</dt>
              <dd className="font-serif text-2xl text-ink">{x.v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-sm text-ink-light">
          Nine leadership seats and twenty-nine team seats, which is what JBI Electrical looks like.
          The target is {money.targetSeats.toLocaleString('en-AU')} seats at {money.targetArr}.
        </p>
      </section>

      {/* ── The demo ─────────────────────────────────────────────────────────────────────────── */}
      <section className="card mt-6">
        <h2 className="font-serif text-xl text-ink">The demo</h2>
        <p className="mt-1 max-w-3xl text-sm text-ink-light">
          Every step is a path a browser journey walks in <code>npm run check</code>. Nothing partly
          built is on this list however good it looks — a demo that dies is worth less than a demo
          that is short.
        </p>
        <ol className="mt-4 grid gap-2">
          {DEMO.map((s, i) => (
            <li key={s.what} className="flex flex-wrap items-baseline gap-x-3 rounded-2xl bg-cream px-4 py-3">
              <span className="font-serif text-lg text-ink">{i + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="font-semibold text-ink">{s.what}</span>
                <span className="block text-sm text-ink-light">{s.where} · proven by {s.provenBy}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section className="card mt-6">
        <h2 className="font-serif text-xl text-ink">Before you walk in</h2>
        <ol className="mt-2 grid gap-1.5 text-sm text-ink-light">
          <li>1. Run <code className="text-ink">npm run check</code> on a machine that can reach the live site. A skip is never a pass — read what it skipped.</li>
          <li>2. Open the live site yourself. It is the oldest unverified claim on this page.</li>
          <li>3. Demo on JBI’s real data, never a fresh sign-up. Empty states are honest and they look like nothing.</li>
          <li>4. Say the {t.inSpec - t.builtHere - t.partlyHere} that are not written before anybody asks. Being caught on the small thing is what makes the big things sound invented.</li>
        </ol>
      </section>
    </Shell>
  );
}
