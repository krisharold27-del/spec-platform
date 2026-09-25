import Link from 'next/link';
import { OrgChartDoor } from '@/components/org-chart-door';
import { after } from 'next/server';
import { ensureReport } from '@/lib/make-it-simple-data';
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
import { levers, leversLine, coverageGrid, ledgerPanel, ANGUS_SHIELD, ADMIN_DEPARTMENT } from '@/lib/virtual-gm-overview';
import { FinancialSystemPanel } from '@/components/financial-system';
import { VIRTUAL_GM } from '@/lib/virtual-gm';
import { Recommends, SwitchCards } from '@/components/recommends';
import { Refused } from '@/components/refused';
import { refusedReason } from '@/lib/refuse';
import { ledgerConnections } from '@/lib/virtual-gm-data';
import { gmHomeFor } from '@/lib/gm-data';
import { GM_QUESTIONS, gmLine, leversLine as pointsLine, ONLY_INJURY_REACHES_YOU } from '@/lib/gm-home';
import { pointsFor } from '@/lib/power-meter';
import { NOTHING_NEEDS_YOU } from '@/lib/adoption';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Virtual GM + Virtual Admin' };

/**
 * Virtual GM + Virtual Admin — the whole business on one screen, both halves of it.
 *
 * Kris, 25 September: *"SPEC runs BOTH the GM and the Admin Department virtually."* So the page has
 * two sides. The GM side is below first: the dial, the levers, the whole business. The admin side is
 * the paperwork — payroll, invoicing, bills, compliance, HR admin, reporting — each named with the
 * screen that does it, and the Claude recommends and Switch when ready cards where Angus Shield or a
 * decision is in play.
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
  searchParams: Promise<Record<string, string | string[] | undefined>>;
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
  // Make it simple: written after the page has gone, the day before the meeting. Nobody waits on it.
  after(() => ensureReport(user.tenantId).catch(() => {}));
  const { reading, period, stale } = power;
  const top = isTopOfChart(scope);

  const toPull = levers(reading);
  const grid = coverageGrid();
  // Design 19's GM home: the movement, the four questions, the nine areas and the away switch.
  const gm = await gmHomeFor(user);

  // The breakdown is always open here — it is what this screen is for. Close goes back through the door.
  const showing = arrival.power === 'all' ? 'all' : 'open';
  const hrefFor = (next: 'closed' | 'open' | 'all') =>
    (next === 'closed' ? '/my-page#power' : next === 'all' ? '/virtual-gm?power=all#breakdown' : '/virtual-gm#breakdown');
  const colour = reading.band === 'unknown' ? LIGHT_COLOUR.pending : LIGHT_COLOUR[reading.band];

  return (
    <Shell title="Virtual GM + Virtual Admin" headline={`${tenant.name}: the GM and the admin department, run virtually.`}>
      <div className="flex flex-wrap justify-between gap-2 text-sm">
        <Link href="/my-page" className="text-rust-700 hover:underline">&larr; My Page</Link>
        <Link href="/financials" className="text-rust-700 hover:underline" data-door-financials-top>Financials &rarr;</Link>
      </div>
      <Refused reason={refusedReason(arrival)} />
      <OrgChartDoor className="mt-3" />
      <p className="mt-2 max-w-3xl text-sm text-ink-light" data-vgm-both>{VIRTUAL_GM.both}</p>

      <h2 className="mt-8 font-serif text-3xl text-ink" data-vgm-side="gm">Virtual GM</h2>

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

      {/* ── The one question ─────────────────────────────────────────────────────────────────── */}
      <section className="mt-6 rounded-xl border border-sand-300 bg-sand-50 p-5" data-gm-movement>
        <span className="label-caps">Has the power meter got better?</span>
        <p className="mt-1 font-serif text-2xl text-ink">{gm.movement.says}</p>
      </section>

      {/* ── The GM's four questions ──────────────────────────────────────────────────────────── */}
      <section className="mt-8" data-gm-questions>
        <h2 className="font-serif text-2xl text-ink">The four questions a GM gets asked</h2>
        <p className="mt-1 max-w-3xl text-sm text-ink-light">{gmLine(gm.questions)}</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {gm.questions.map(a => (
            <article key={a.q.key} className="card grid content-start gap-1" data-gm-question={a.q.key}>
              <div className="flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: a.answer === 'clear' ? LIGHT_COLOUR.green : a.answer === 'problem' ? LIGHT_COLOUR.red : a.answer === 'watch' ? LIGHT_COLOUR.amber : LIGHT_COLOUR.pending }}
                  aria-hidden
                />
                <span className="font-serif text-lg text-ink">{a.q.question}</span>
              </div>
              <p className="text-sm text-ink">{a.read}</p>
              <p className="text-xs text-ink-light">{a.q.why}</p>
              {a.to && <Link href={a.to} className="mt-1 text-sm text-rust-700 hover:underline">Go and see &rarr;</Link>}
            </article>
          ))}
        </div>
      </section>

      <div id="breakdown" className="mt-10 scroll-mt-20">
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
        <p className="mt-1 text-sm text-ink-light" data-gm-levers-worth>{pointsLine(gm.levers, reading)}</p>
        {toPull.length > 0 && (
          <ul className="mt-4 grid gap-3">
            {toPull.map(l => (
              <li key={l.slotId} className="card border-l-4" style={{ borderLeftColor: LIGHT_COLOUR.red }} data-vgm-lever={l.slotId}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-serif text-lg text-ink">{l.name}</span>
                  <span className="text-xs font-semibold text-ink-light">
                    {l.weight === 'heavy' ? 'Heavy hitter · ' : ''}worth {pointsFor(l.weight)} {pointsFor(l.weight) === 1 ? 'point' : 'points'}
                  </span>
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
      {/*
        Design 19's nine tiles, which replaced the seven workflow families that used to sit here.

        The rule the design is built on: the owner only opens a tile when it says something needs
        them. So each carries exactly ONE line — a thing to do, or the words "Nothing needs you" —
        and never a summary of the area. A tile that always has something to report is a tile that
        gets skimmed, and the second time somebody skims past one is the time it mattered.

        An area running in another system is GREY. Not green, which would be an assurance siteVIP
        has not earned, and not red, which would be a criticism of a business for using Simpro. What
        is worth saying about it is only whether it is connected, and therefore whether that part of
        the Power Meter is real or missing.
      */}
      <section className="mt-10" data-gm-tiles>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-serif text-2xl text-ink">Everything the business needs. One login.</h2>
          <span className="label-caps" data-gm-adoption-count>{gm.adoption.running} of {gm.adoption.of} running in siteVIP</span>
        </div>
        <p className="mt-1 max-w-3xl text-sm text-ink-light">{gm.adoption.line}</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {gm.tiles.map(t => (
            <Link
              key={t.area.key}
              href={t.to}
              className={`grid content-start gap-1 rounded-xl border p-4 ${t.runningHere ? 'border-sand-300 bg-white hover:bg-cream' : 'border-sand-300 bg-sand-100 hover:bg-sand-200'}`}
              data-gm-tile={t.area.key}
            >
              <div className="flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: t.dot === 'grey' ? LIGHT_COLOUR.pending : LIGHT_COLOUR[t.dot] }}
                  aria-hidden
                />
                <span className="font-serif text-base text-ink">{t.area.label}</span>
              </div>
              <span className="text-xs text-ink-light">{t.area.covers}</span>
              <span className={`mt-1 text-sm ${t.line === NOTHING_NEEDS_YOU ? 'text-ink-light' : 'font-semibold text-ink'}`}>
                {t.line}
              </span>
              <span className="mt-1 text-xs font-semibold text-rust-700">{t.action}</span>
            </Link>
          ))}
        </div>
        <Link href="/workflows" className="mt-3 inline-block text-sm text-rust-700 hover:underline">
          Every workflow, step by step &rarr;
        </Link>
      </section>

      {/* ── The owner's own life ─────────────────────────────────────────────────────────────── */}
      <section className="mt-10 grid gap-2" data-gm-away>
        <h2 className="font-serif text-2xl text-ink">When you are away</h2>
        <p className="max-w-3xl text-sm text-ink">{gm.away.says}</p>
        <p className="max-w-3xl text-sm text-ink-light">{ONLY_INJURY_REACHES_YOU}</p>
        <p className="max-w-3xl text-sm text-ink-light" data-gm-saved>{gm.saved.says}</p>
      </section>

      {/* ── Claude recommends, on the GM side ────────────────────────────────────────────────── */}
      <section className="mt-10 grid gap-3" data-vgm-recommends>
        <h2 className="font-serif text-2xl text-ink">Claude recommends</h2>
        <Recommends topic="labour_rate" back="/virtual-gm" />
      </section>

      {/* ══ The Virtual Admin Department ════════════════════════════════════════════════════════ */}
      <h2 className="mt-14 font-serif text-3xl text-ink" data-vgm-side="admin">Virtual Admin Department</h2>
      <p className="mt-1 max-w-3xl text-sm text-ink-light">
        The paperwork, run by SPEC and Angus Shield. Everything keeps running as it does today; each
        part switches over only when you say so.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-vgm-admin>
        {ADMIN_DEPARTMENT.map(j => (
          <Link key={j.key} href={j.href} className="card-inset grid content-start gap-1 hover:bg-cream" data-vgm-admin-job={j.key}>
            <span className="font-serif text-base text-ink">{j.label}</span>
            <span className="text-xs text-ink-light">{j.does}</span>
            {j.switchArea && <span className="mt-1 text-xs text-rust-700">{ANGUS_SHIELD.name} can take over the rest when you switch</span>}
          </Link>
        ))}
      </div>

      <section className="mt-6 grid gap-3" data-vgm-payroll>
        <SwitchCards areas={['payroll']} back="/virtual-gm" />
      </section>

      {/* ── Your financial system — the same panel /financials draws ──────────────────────────── */}
      <div className="mt-10">
        <FinancialSystemPanel ledger={ledger} back="/virtual-gm" />
        <Link href="/financials" className="mt-3 inline-block text-sm text-rust-700 hover:underline" data-door-financials>
          See the money: Financials &rarr;
        </Link>
      </div>

      {/* ── Switch when ready: the other areas this business runs somewhere else ─────────────── */}
      <section className="mt-10 grid gap-3" data-vgm-switch>
        <SwitchCards areas={['jobs', 'crm', 'people', 'safety']} back="/virtual-gm" />
      </section>
    </Shell>
  );
}
