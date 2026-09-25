import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Shell } from '@/components/ui';
import { Dial, PowerBreakdown, monthWords } from '@/components/power-meter';
import { getCurrentUser } from '@/lib/auth';
import { getTenantById } from '@/lib/queries';
import { getToday } from '@/lib/today-data';
import { getScope, isTopOfChart } from '@/lib/scope';
import { registerFor } from '@/lib/register-data';
import { viewerPowerMeter } from '@/lib/power-meter-data';
import { scopeLabel } from '@/lib/power-meter';
import { LIGHT_COLOUR } from '@/lib/today';
import { levers, leversLine, coverageGrid, ledgerPanel, ANGUS_SHIELD } from '@/lib/virtual-gm-overview';
import { ledgerConnections } from '@/lib/virtual-gm-data';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Virtual GM' };

/**
 * The Virtual GM — the whole business on one screen.
 *
 * Reached as a door from My Page, beside the Power Meter. Not a tab on the bar: My Page is still
 * where the day starts, and this is where a leader goes from it to see the whole business at once.
 *
 * Four things, and every one of them is read rather than written:
 *
 *   The dial and breakdown are My Page's own — the same `viewerPowerMeter` call with the same inputs,
 *   drawn by the same components. The two screens cannot disagree.
 *
 *   The levers are what that reading marked not met, each naming the workflow that moves it and the
 *   screen that workflow starts on — see `levers` in lib/virtual-gm.
 *
 *   The grid is the seven workflow families from lib/workflows, counted.
 *
 *   The financial panel is the business's own accounting connection, and Angus Shield named as
 *   SPEC's own financial system that is not switchable yet.
 */
export default async function VirtualGm({
  searchParams,
}: {
  searchParams: Promise<{ power?: string }>;
}) {
  const arrival = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect('/signin');
  const data = await getToday(user);
  if (!data.myRole) redirect('/journey');

  const scope = await getScope(user);
  // The same population My Page gives the percentage to: somebody whose scope reaches past their own
  // role. Everybody else keeps their own four pillars on My Page, which are the things they can move.
  if (scope.visible.size <= 1) redirect('/my-page');

  const tenant = (await getTenantById(user.tenantId))!;
  const teamNames = data.team.map(m => m.holder).filter((n): n is string => !!n);
  const register = await registerFor(user.tenantId, user.name, teamNames);
  const [power, ledger] = await Promise.all([
    viewerPowerMeter({ tenantId: user.tenantId, visible: scope.visible, register }),
    ledgerConnections(user.tenantId).then(ledgerPanel),
  ]);
  const { reading, period, stale } = power;
  const top = isTopOfChart(scope);

  const toPull = levers(reading);
  const grid = coverageGrid();

  // The breakdown is always open here — it is what this screen is for. Close goes back through the door.
  const showing = arrival.power === 'all' ? 'all' : 'open';
  const hrefFor = (next: 'closed' | 'open' | 'all') =>
    (next === 'closed' ? '/my-page#power' : next === 'all' ? '/virtual-gm?power=all#breakdown' : '/virtual-gm#breakdown');
  const colour = reading.band === 'unknown' ? LIGHT_COLOUR.pending : LIGHT_COLOUR[reading.band];

  return (
    <Shell title="Virtual GM" headline={`${tenant.name}, all of it, on one screen.`}>
      <Link href="/my-page" className="text-sm text-rust-700 hover:underline">&larr; My Page</Link>

      {/* ── The dial ─────────────────────────────────────────────────────────────────────────── */}
      <section className="mt-4 flex flex-wrap items-center gap-6" aria-label="Virtual GM Power Meter" data-vgm-dial>
        <Dial reading={reading} size={128} />
        <div className="grid gap-1">
          <span className="label-caps">Virtual GM Power Meter · {scopeLabel(top)}</span>
          <span className="font-serif text-5xl leading-none text-ink" data-power-score>{reading.score}%</span>
          <span className="text-sm" style={{ color: colour }}>{reading.verdict}</span>
          {period && (
            <span className="text-xs text-ink-light">
              {monthWords(period)}{stale ? ' — the last month anybody marked' : ''}
            </span>
          )}
        </div>
      </section>

      <div id="breakdown" className="mt-6 scroll-mt-20">
        <PowerBreakdown
          reading={reading}
          canRead
          topOfChart={top}
          period={period}
          stale={stale}
          showing={showing}
          hrefFor={hrefFor}
        />
      </div>

      {/* ── Levers to pull this week ─────────────────────────────────────────────────────────── */}
      <section className="mt-10" data-vgm-levers>
        <h2 className="font-serif text-2xl text-ink">Levers to pull this week</h2>
        <p className="mt-1 text-sm text-ink-light">{leversLine(toPull, period)}</p>
        {toPull.length > 0 && (
          <ul className="mt-4 grid gap-3">
            {toPull.map(l => (
              <li key={l.slotId} className="card border-l-4" style={{ borderLeftColor: LIGHT_COLOUR.red }} data-vgm-lever={l.slotId}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-serif text-lg text-ink">{l.name}</span>
                  {l.weight === 'heavy' && <span className="text-xs font-semibold text-ink-light">Heavy hitter · 15 points</span>}
                </div>
                <p className="mt-1 text-sm" style={{ color: LIGHT_COLOUR.red }}>{l.cause}</p>
                <ul className="mt-3 grid gap-1.5">
                  {l.fixes.slice(0, 3).map(f => (
                    <li key={f.workflowId} className="text-sm">
                      <Link href={f.href} className="text-ink hover:text-rust">{f.name} &rarr;</Link>
                      <span className="ml-2 text-xs text-ink-light">{f.family}</span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Everything the business needs, one login ─────────────────────────────────────────── */}
      <section className="mt-10" data-vgm-coverage>
        <h2 className="font-serif text-2xl text-ink">Everything the business needs, one login</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {grid.map(t => (
            <Link key={t.key} href={t.href} className="card-inset grid gap-1 hover:bg-cream" data-vgm-family={t.key}>
              <span className="font-serif text-base text-ink">{t.label}</span>
              <span className="text-xs text-ink-light">{t.blurb}</span>
              <span className="mt-1 text-xs font-semibold text-ink">
                {t.whole} of {t.total} end to end in SPEC
              </span>
              {t.partial > 0 && (
                <span className="text-xs" style={{ color: LIGHT_COLOUR.amber }}>
                  {t.partial} with a step still to build
                </span>
              )}
            </Link>
          ))}
        </div>
        <Link href="/workflows" className="mt-3 inline-block text-sm text-rust-700 hover:underline">Every workflow, step by step &rarr;</Link>
      </section>

      {/* ── Your financial system ────────────────────────────────────────────────────────────── */}
      <section className="mt-10 card" data-vgm-ledger={ledger.state}>
        <h2 className="font-serif text-2xl text-ink">Your financial system</h2>
        <p className="mt-2 text-sm text-ink">{ledger.says}</p>
        <Link href={ledger.href} className="btn-secondary mt-3 inline-block px-3 py-1.5 text-xs">{ledger.action}</Link>
        <div className="mt-5 border-t border-rust-200 pt-4" data-vgm-angus>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="font-serif text-base text-ink">{ANGUS_SHIELD.name}</span>
            <span className="pill pill-pending">Not switchable yet</span>
          </div>
          <p className="mt-1 text-sm text-ink-light">{ANGUS_SHIELD.line}</p>
        </div>
      </section>
    </Shell>
  );
}
