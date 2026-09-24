import Link from 'next/link';
import { redirect } from 'next/navigation';
import { OwnSystemLine } from '@/components/own-system-line';
import { ownSystemFor } from '@/lib/coverage-data';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { Shell } from '@/components/ui';
import { SubmitButton } from '@/components/submit-button';
import { SafetyReportBox } from '@/components/safety-report-box';
import { Refused } from '@/components/refused';
import { refusedReason } from '@/lib/refuse';
import { getCurrentUser, canManage } from '@/lib/auth';
import { rates, ratesLine, ENOUGH_HOURS } from '@/lib/trifr';
import { getScope } from '@/lib/scope';
import { LIGHT_COLOUR, pillTone } from '@/lib/today';
import { PILLAR_META } from '@/lib/pillars';
import {
  REPORT_KINDS, REGULATORS, SEVERITIES, CHECK_KINDS, FEEDS,
  kindLabel, isHarm, notifyPrompt, regulatorFor, clearance, clearanceNote,
  reportStanding, actionStanding, checkStanding, claimStanding, byPriority, daysWithoutHarm,
  type Tone, type Standing,
} from '@/lib/safety';
import { loadSafety, type ReportRow } from '@/lib/safety-data';
import {
  sendReport, setReportState, updateReport, closeReport, markRegulatorTold,
  addAction, completeAction, addCheck, updateCheck, addClaim, updateClaim, addTicket,
} from './actions';

export const dynamic = 'force-dynamic';

/**
 * Safety — zero harm, run from one place (design: SPEC Safety, 23 September).
 *
 * Five tabs, one register underneath. Today is the report box and what needs doing; the other four
 * are the register read four ways. Everything decided on this page — notifiable, overdue, clear to
 * work, who may see what, what ranks first — is decided in lib/safety.
 *
 * Colour is only ever the result: green done, amber open, red a date missed or a check failed, and
 * the warm grey for nothing recorded yet. Nothing waiting on somebody is ever red.
 */

const TABS = [
  { key: 'today', label: 'Today' },
  { key: 'incidents', label: 'Incidents' },
  { key: 'hazards', label: 'Hazards & wellbeing' },
  { key: 'site', label: 'On site' },
  { key: 'clear', label: 'Clear to Work' },
] as const;
type TabKey = typeof TABS[number]['key'];

interface Row {
  key: string;
  title: string;
  who: string;
  when: string;
  standing: Standing;
  /** Manager controls, folded away under the row. */
  controls?: React.ReactNode;
}

const dateOf = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : '');

export default async function Safety({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getCurrentUser();
  if (!user) redirect('/signin');
  const sp = await searchParams;
  const cannot = refusedReason(sp);
  const tab: TabKey = TABS.some(t => t.key === sp.tab) ? (sp.tab as TabKey) : 'today';
  const own = await ownSystemFor(user.tenantId, 'safety', tab);
  const initialKind = typeof sp.kind === 'string' ? sp.kind : 'hazard';
  const sentId = typeof sp.sent === 'string' ? sp.sent.slice(0, 64) : '';

  const scope = await getScope(user);
  const manage = canManage(user.access);
  const data = await loadSafety(user, scope);
  const now = new Date();
  const nameOf = (r: ReportRow) => (r.anonymous ? 'Anonymous' : data.nameOfUser(r.reportedBy) ?? 'Somebody');
  const whenOf = (r: ReportRow) => [dateOf(r.createdAt), r.jobRef].filter(Boolean).join(' · ');

  // The report just sent, if one was — read by id and by business, and only shown back to its sender.
  let sent: ReportRow | null = null;
  if (sentId) {
    const [row] = await db.select().from(schema.safetyReports)
      .where(and(eq(schema.safetyReports.id, sentId), eq(schema.safetyReports.tenantId, user.tenantId)));
    if (row && (row.reportedBy === user.id || row.anonymous)) sent = row;
  }

  // ── The register, as rows ───────────────────────────────────────────────────────────────────────

  const reportControls = (r: ReportRow) => manage ? (
    <div className="grid gap-2">
      <form action={updateReport} className="grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
        <input type="hidden" name="id" value={r.id} />
        <input className="input" name="owner" defaultValue={r.owner ?? ''} placeholder="Who has it" aria-label="Owner" />
        <input className="input" type="date" name="dueAt" defaultValue={r.dueAt ?? ''} aria-label="Fix by" />
        {r.kind === 'injury' ? (
          <select className="input" name="severity" defaultValue={r.severity ?? ''} aria-label="How serious">
            <option value="">How serious?</option>
            {SEVERITIES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        ) : <span />}
        <SubmitButton className="btn-secondary shrink-0" pending="Saving…">Save</SubmitButton>
      </form>
      <div className="flex flex-wrap gap-2">
        <form action={closeReport}>
          <input type="hidden" name="id" value={r.id} />
          {r.status === 'closed' && <input type="hidden" name="reopen" value="on" />}
          <SubmitButton className="btn-ghost" pending="Saving…">{r.status === 'closed' ? 'Reopen' : r.kind === 'injury' ? 'Close it' : 'Mark it fixed'}</SubmitButton>
        </form>
        {(r.kind === 'injury' || r.kind === 'near_miss') && !r.regulatorToldAt && (
          <form action={markRegulatorTold}>
            <input type="hidden" name="id" value={r.id} />
            <SubmitButton className="btn-ghost" pending="Saving…">Regulator told today</SubmitButton>
          </form>
        )}
      </div>
    </div>
  ) : undefined;

  const reportRow = (r: ReportRow): Row => ({
    key: r.id,
    title: r.text,
    who: r.kind === 'wellbeing' ? nameOf(r) : `Raised by ${nameOf(r)}`,
    when: whenOf(r),
    standing: reportStanding(r, now),
    controls: reportControls(r),
  });

  const newestFirst = (a: { createdAt: string }, b: { createdAt: string }) => b.createdAt.localeCompare(a.createdAt);
  const injuries = data.reports.filter(r => r.kind === 'injury').sort(newestFirst);
  const notifiable = data.reports.filter(r => r.notifiable).sort(newestFirst);
  const hazards = data.reports.filter(r => r.kind === 'hazard' || r.kind === 'near_miss').sort(newestFirst);
  const wellbeing = data.reports.filter(r => r.kind === 'wellbeing').sort(newestFirst);
  const yourRegulator = regulatorFor(data.likelyState);

  const injuryRows: Row[] = injuries.map(r => ({ ...reportRow(r), who: nameOf(r) }));
  const notifiableRows: Row[] = notifiable.length
    ? notifiable.map(r => ({
        key: r.id,
        title: r.text,
        who: `${kindLabel(r.kind)} · ${regulatorFor(r.state)?.name ?? 'State not recorded'}`,
        when: whenOf(r),
        standing: r.regulatorToldAt
          ? { tone: 'green' as Tone, label: `Regulator told ${dateOf(r.regulatorToldAt)}` }
          : { tone: 'amber' as Tone, label: 'Not yet recorded as told' },
        controls: manage && !r.regulatorToldAt ? (
          <form action={markRegulatorTold} className="flex flex-wrap gap-2">
            <input type="hidden" name="id" value={r.id} />
            <input className="input" type="date" name="toldAt" aria-label="Told on" />
            <SubmitButton className="btn-secondary" pending="Saving…">Record it</SubmitButton>
          </form>
        ) : undefined,
      }))
    : [{
        key: 'none', title: `Nothing notifiable in ${now.getFullYear()}`, who: 'Checked by SPEC on every report',
        when: 'Year to date', standing: { tone: data.reports.length ? 'green' : 'pending', label: data.reports.length ? 'Clear' : 'Nothing recorded yet' },
      }];

  const claimRows: Row[] = data.claims.map(c => ({
    key: c.id,
    title: c.worker,
    who: `Case owner: ${c.caseOwner ?? 'not named'}`,
    when: [c.lodgedAt ? `Claim lodged ${c.lodgedAt}` : null, c.insurerToldAt ? `insurer told ${c.insurerToldAt}` : 'insurer not yet recorded as told'].filter(Boolean).join(' · '),
    standing: claimStanding(c),
    controls: manage && c.status !== 'closed' ? (
      <form action={updateClaim} className="grid gap-2 sm:grid-cols-[auto_auto_auto_auto_auto]">
        <input type="hidden" name="id" value={c.id} />
        <input className="input w-24" type="number" min={1} name="dutiesWeek" defaultValue={c.dutiesWeek ?? ''} aria-label="Suitable duties, this week" placeholder="Week" />
        <input className="input w-24" type="number" min={1} name="dutiesWeeks" defaultValue={c.dutiesWeeks ?? ''} aria-label="Suitable duties, weeks planned" placeholder="Of" />
        <input className="input" type="date" name="insurerToldAt" aria-label="Insurer told on" />
        <label className="flex items-center gap-2 text-sm text-ink-light"><input type="checkbox" name="close" /> Back at full duties</label>
        <SubmitButton className="btn-secondary" pending="Saving…">Save</SubmitButton>
      </form>
    ) : undefined,
  }));

  const actionRows: Row[] = [...data.actions]
    .sort((a, b) => Number(Boolean(a.doneAt)) - Number(Boolean(b.doneAt)) || (a.dueAt ?? '9').localeCompare(b.dueAt ?? '9'))
    .map(a => ({
      key: a.id,
      title: a.text,
      who: `Owner: ${a.owner ?? 'not named yet'}`,
      when: a.doneAt ? `Done ${dateOf(a.doneAt)}` : a.dueAt ? `Due ${a.dueAt}` : 'No date yet',
      standing: actionStanding(a, now),
      controls: manage && !a.doneAt ? (
        <form action={completeAction}>
          <input type="hidden" name="id" value={a.id} />
          <SubmitButton className="btn-ghost" pending="Saving…">Mark it done</SubmitButton>
        </form>
      ) : undefined,
    }));

  const checkRows = (kind: string): Row[] => data.checks
    .filter(c => c.kind === kind)
    .sort((a, b) => (b.onDate ?? '').localeCompare(a.onDate ?? ''))
    .map(c => ({
      key: c.id,
      title: c.title,
      who: [c.place, c.person, c.expected ? `${c.signed ?? 0} of ${c.expected} signed` : null].filter(Boolean).join(' · ') || 'Not assigned',
      when: c.onDate ?? 'No date yet',
      standing: checkStanding(c, now),
      controls: manage ? (
        <form action={updateCheck} className="flex flex-wrap gap-2">
          <input type="hidden" name="id" value={c.id} />
          {kind === 'toolbox' || kind === 'swms' ? (
            <input className="input w-28" type="number" min={0} name="signed" defaultValue={c.signed ?? ''} aria-label="How many have signed" placeholder="Signed" />
          ) : (
            <select className="input" name="result" defaultValue="" aria-label="Result">
              <option value="">Result today…</option>
              <option value="passed">Passed</option>
              <option value="failed">Failed</option>
            </select>
          )}
          <SubmitButton className="btn-secondary" pending="Saving…">Save</SubmitButton>
        </form>
      ) : undefined,
    }));

  const ticketRows: Row[] = data.tickets
    .map(t => ({ t, c: clearance(t.expiresAt, now) }))
    .sort((a, b) => ({ not_clear: 0, expiring: 1, clear: 2 }[a.c.state] - { not_clear: 0, expiring: 1, clear: 2 }[b.c.state]) || (a.c.days ?? 1e6) - (b.c.days ?? 1e6))
    .map(({ t, c }) => ({
      key: t.id,
      title: t.what,
      who: t.who,
      when: clearanceNote(t.expiresAt, now),
      standing: { tone: c.tone, label: c.label },
    }));

  // ── What needs doing, harm first ────────────────────────────────────────────────────────────────

  const needs = byPriority([
    ...data.reports.filter(r => r.status !== 'closed').map(r => ({
      title: r.text, where: `${kindLabel(r.kind)} · ${nameOf(r)}`, tab: (r.kind === 'injury' ? 'incidents' : 'hazards') as TabKey,
      harm: isHarm(r.kind), notifiable: r.notifiable && !r.regulatorToldAt, ...reportStanding(r, now), since: r.createdAt,
    })),
    ...data.actions.filter(a => !a.doneAt).map(a => ({
      title: a.text, where: `Corrective action · ${a.owner ?? 'no owner yet'}`, tab: 'hazards' as TabKey,
      harm: false, ...actionStanding(a, now), since: a.dueAt ?? a.createdAt,
    })),
    ...data.checks.map(c => ({ c, s: checkStanding(c, now) })).filter(x => x.s.tone !== 'green').map(({ c, s }) => ({
      title: c.title, where: [CHECK_KINDS.find(k => k.key === c.kind)?.title ?? 'Check', c.person ?? c.place].filter(Boolean).join(' · '), tab: 'site' as TabKey,
      harm: false, ...s, since: c.onDate ?? c.createdAt,
    })),
    ...data.claims.filter(c => c.status !== 'closed').map(c => ({
      title: `${c.worker} — return to work`, where: ['Workers’ comp', c.caseOwner].filter(Boolean).join(' · '), tab: 'incidents' as TabKey,
      harm: true, ...claimStanding(c), since: c.createdAt,
    })),
    ...data.tickets.map(t => ({ t, c: clearance(t.expiresAt, now) })).filter(x => x.c.state !== 'clear').map(({ t, c }) => ({
      title: t.what, where: `Clear to Work · ${t.who}`, tab: 'clear' as TabKey,
      harm: false, tone: c.tone, label: c.label, since: t.expiresAt ?? '',
    })),
  ]);

  const countFor = (k: TabKey) => needs.filter(n => (k === 'today' ? true : n.tab === k)).length;

  // ── The four numbers ────────────────────────────────────────────────────────────────────────────

  const sinceHarm = daysWithoutHarm(data.injuryDates, now);
  const lastInjury = data.injuryDates.map(i => i.createdAt.slice(0, 10)).sort().at(-1);
  const openActions = data.actions.filter(a => !a.doneAt);
  const overdueActions = openActions.filter(a => actionStanding(a, now).tone === 'red');
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString().slice(0, 10);
  const thisWeek = data.checks.filter(c => c.onDate && c.onDate >= weekAgo && c.onDate <= now.toISOString().slice(0, 10));
  const weekGood = thisWeek.filter(c => checkStanding(c, now).tone === 'green');
  const weekBad = thisWeek.filter(c => checkStanding(c, now).tone === 'red');
  const notClear = data.tickets.filter(t => clearance(t.expiresAt, now).state === 'not_clear');

  const stats: { label: string; value: string; note: string; tone: Tone }[] = [
    sinceHarm === null
      ? { label: 'Days without harm', value: '—', note: 'No injury recorded yet', tone: 'pending' }
      : { label: 'Days without harm', value: String(sinceHarm), note: `Since the last injury on ${lastInjury}`, tone: sinceHarm < 30 ? 'amber' : 'green' },
    data.actions.length
      ? { label: 'Open actions', value: String(openActions.length), note: overdueActions.length ? `${overdueActions.length} overdue` : 'None overdue', tone: overdueActions.length ? 'red' : openActions.length ? 'amber' : 'green' }
      : { label: 'Open actions', value: '0', note: 'Nothing recorded yet', tone: 'pending' },
    thisWeek.length
      ? { label: 'Checks this week', value: `${weekGood.length} of ${thisWeek.length}`, note: weekBad.length ? `${weekBad[0].title} ${weekBad.length > 1 ? `and ${weekBad.length - 1} more ` : ''}not passed` : 'All done', tone: weekBad.length ? 'red' : weekGood.length === thisWeek.length ? 'green' : 'amber' }
      : { label: 'Checks this week', value: '0', note: 'Nothing recorded this week', tone: 'pending' },
    data.tickets.length
      ? { label: 'Not clear to work', value: String(notClear.length), note: notClear.length ? `${notClear[0].who} · ${notClear[0].what}` : 'Everybody is clear', tone: notClear.length ? 'red' : 'green' }
      : { label: 'Not clear to work', value: '—', note: 'No licences or tickets recorded yet', tone: 'pending' },
  ];

  /*
    ── TRIFR, from real hours ──────────────────────────────────────────────────────────────────

    Kris: "TRIFR figures easy as the system knows total hours". Most small businesses quote a rate
    they are not sure of, because the injuries are in one system and the hours are in another. SPEC
    holds both, so the denominator is a sum rather than headcount times an average week.

    Shown under the four lights rather than among them: it is the number a builder asks for before
    letting anybody on site, and it is a quarter's reading rather than today's.
  */
  const hoursWorked = (await db.select({ minutes: schema.timesheetEntries.minutes })
    .from(schema.timesheetEntries)
    .where(eq(schema.timesheetEntries.tenantId, user.tenantId)))
    .reduce((t, e) => t + (e.minutes ?? 0), 0) / 60;

  const safetyRates = rates(
    data.reports.filter(r => r.kind === 'injury')
      .map(r => ({ id: r.id, severity: r.severity, at: r.createdAt })),
    hoursWorked,
  );

  // ── The sent notice ─────────────────────────────────────────────────────────────────────────────

  const sentNotice = sent ? (() => {
    if (sent.notifiable) {
      const code = sent.state ?? data.likelyState;
      const prompt = notifyPrompt(code);
      return { tone: 'red' as Tone, ...prompt, notifiable: true, code };
    }
    if (sent.kind === 'wellbeing') {
      return sent.anonymous
        ? { tone: 'green' as Tone, title: 'Received. Nobody can see who sent this.', body: 'It has gone to the top of the business, with no name, no role and no job on it. Nothing is added to anybody’s record.', notifiable: false, code: null }
        : { tone: 'green' as Tone, title: 'Received. Only the GM will see who raised this.', body: 'The GM will be in touch within two working days. Nothing is added to your record.', notifiable: false, code: null };
    }
    return {
      tone: 'green' as Tone,
      title: sent.owner ? `Sent. ${sent.owner} has it.` : 'Sent. It is on the register.',
      body: `It is on the register${sent.jobRef ? ` against ${sent.jobRef}` : ''} with an owner, and a date to fix it by. You will see when it is fixed.`,
      notifiable: false, code: null,
    };
  })() : null;

  const heldBy = [
    ...data.people.map(p => ({ value: `user:${p.id}`, label: p.name })),
    ...data.staff.filter(s => !s.userId).map(s => ({ value: `staff:${s.id}`, label: s.name })),
  ];

  return (
    <Shell
      title="Safety"
      kicker="Safety"
      headline="Zero harm, run from one place."
      subtitle={data.jobSystemLinked
        ? 'Report it, fix it, prove it. Jobs, sites, crews and vehicles come straight from your job system, so nothing is typed twice.'
        : 'Report it, fix it, prove it. Every report, check and ticket in one register — connect your job system and jobs, sites, crews and vehicles fill themselves in.'}
    >
      <Refused reason={cannot} />

      <p className="mb-5">
        {data.jobSystemLinked ? (
          <span className="pill" style={pillTone('green')}>Your job system is linked · jobs, sites, crews and vehicles</span>
        ) : (
          <Link href="/connections" className="pill" style={pillTone('pending')}>Manual · no job system connected</Link>
        )}
      </p>

      <nav className="mb-6 flex flex-wrap gap-2" aria-label="Safety sections">
        {TABS.map(t => {
          const on = t.key === tab;
          const n = t.key === 'today' ? 0 : countFor(t.key);
          return (
            <Link
              key={t.key}
              href={t.key === 'today' ? '/safety' : `/safety?tab=${t.key}`}
              aria-current={on ? 'page' : undefined}
              className={`inline-flex items-center rounded-full px-5 py-2.5 text-sm ${on ? 'bg-rust text-cream' : 'bg-surface text-ink shadow-sm hover:bg-cream'}`}
            >
              {t.label}
              {n > 0 && (
                <span className={`ml-2 inline-grid min-w-5 place-content-center rounded-full px-1.5 text-[11.5px] ${on ? 'bg-cream text-rust-700' : ''}`} style={on ? undefined : pillTone('amber')}>{n}</span>
              )}
            </Link>
          );
        })}
      </nav>

      <OwnSystemLine line={own.line} connected={own.connected} />

      {tab === 'today' && (
        <div className="grid gap-6">
          <section id="report" className="card p-6 sm:p-8">
            <h2 className="font-serif text-2xl text-ink">Something not right? Tell SPEC.</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-light">
              One line is enough. It reaches your supervisor straight away. A report is never held against you.
            </p>
            <SafetyReportBox
              kinds={REPORT_KINDS}
              initialKind={initialKind}
              jobRef={data.lastJobRef}
              jobFromSystem={data.jobSystemLinked}
              action={sendReport}
            />
            {sentNotice && (
              <div
                className="mt-4 rounded-2xl px-5 py-4"
                style={{ borderLeft: `5px solid ${LIGHT_COLOUR[sentNotice.tone]}`, background: `color-mix(in srgb, ${LIGHT_COLOUR[sentNotice.tone]} 10%, transparent)` }}
                role={sentNotice.notifiable ? 'alert' : 'status'}
              >
                <p className="font-serif text-lg text-ink">{sentNotice.title}</p>
                <p className="mt-1 text-sm leading-relaxed text-ink">{sentNotice.body}</p>
                {sentNotice.notifiable && sent && (
                  <>
                    {!regulatorFor(sentNotice.code) && (
                      <ul className="mt-3 grid gap-1 text-sm sm:grid-cols-2">
                        {REGULATORS.map(r => (
                          <li key={r.code}><strong>{r.code}</strong> · {r.name} · <a className="text-rust-700 hover:underline" href={`tel:${r.phone.replace(/\s/g, '')}`}>{r.phone}</a></li>
                        ))}
                      </ul>
                    )}
                    <form action={setReportState} className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                      <input type="hidden" name="id" value={sent.id} />
                      <label className="text-ink-light" htmlFor="site-state">
                        {regulatorFor(sentNotice.code) ? 'Site not in ' + regulatorFor(sentNotice.code)!.place + '?' : 'Which state is the site in?'}
                      </label>
                      <select id="site-state" className="input w-auto py-1.5" name="state" defaultValue={sent.state ?? ''}>
                        <option value="">Pick one</option>
                        {REGULATORS.map(r => <option key={r.code} value={r.code}>{r.place}</option>)}
                      </select>
                      <SubmitButton className="btn-secondary" pending="Saving…">Save</SubmitButton>
                    </form>
                  </>
                )}
              </div>
            )}
          </section>

          <section aria-label="Zero harm status" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {stats.map(s => (
              <div key={s.label} className="card">
                <div className="flex items-center justify-between gap-2">
                  <span className="label-caps">{s.label}</span>
                  <Dot tone={s.tone} />
                </div>
                <p className="mt-3 font-serif text-4xl leading-none text-ink">{s.value}</p>
                <p className="mt-2 text-sm text-ink-light">{s.note}</p>
              </div>
            ))}
          </section>

          {/*
            The rate a builder asks for before anybody goes on site — from real hours, with the
            hours printed beside it. A TRIFR quoted without its hours is a number nobody can check,
            and for a small business it swings a long way on one event.
          */}
          <p className="rounded-2xl bg-cream px-4 py-3 text-sm text-ink">
            <b>Injury frequency.</b> {ratesLine(safetyRates)}
            {safetyRates.trifr !== null && ' First aid is not counted \u2014 that is the standard definition, so this compares with anybody else\u2019s.'}
          </p>

          <section className="card p-6 sm:p-8">
            <h2 className="font-serif text-xl text-ink">Needs doing</h2>
            {needs.length ? (
              <div className="mt-4 grid gap-2">
                {needs.slice(0, 12).map((n, i) => (
                  <Link key={i} href={`/safety?tab=${n.tab}`} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-cream px-4 py-3 hover:bg-ink/5">
                    <span className="flex min-w-0 items-start gap-3">
                      <Dot tone={n.tone} />
                      <span className="grid min-w-0 gap-0.5">
                        <span className="text-[15px] font-semibold text-ink">{n.title}</span>
                        <span className="text-sm text-ink-light">{n.where}</span>
                      </span>
                    </span>
                    <Chip tone={n.tone} label={n.label} />
                  </Link>
                ))}
                {needs.length > 12 && <p className="text-sm text-ink-light">And {needs.length - 12} more, in the tabs above.</p>}
              </div>
            ) : (
              <p className="mt-3 text-sm text-ink-light">Nothing open. Every report is dealt with, every check is done and everybody is clear to work.</p>
            )}
          </section>
        </div>
      )}

      {tab === 'incidents' && (
        <div className="grid gap-6">
          <Group
            title="Incidents & injuries"
            blurb="Every injury from first aid up, with the job it happened on, who was there and what changed after."
            action={<Link href="/safety?kind=injury#report" className="btn-secondary">Log an incident</Link>}
            feeds={FEEDS.incidents}
            source="Job, site and crew from your job system when one is connected"
            rows={injuryRows}
            empty="No injuries recorded."
          />
          <Group
            title="Notifiable events"
            blurb="A death, a serious injury or illness, or a dangerous incident must be reported to the work health and safety regulator for the state the site is in, straight away, and the site left as it is. SPEC flags a report that looks notifiable the moment it is sent."
            action={
              <details className="relative">
                <summary className="btn-secondary cursor-pointer list-none">What counts?</summary>
                <div className="card absolute right-0 z-10 mt-2 w-[min(90vw,26rem)] text-sm text-ink-light">
                  <p><strong className="text-ink">A death.</strong> <strong className="text-ink">A serious injury or illness</strong> — admitted to hospital, an amputation, a serious head, eye or spinal injury, a serious burn or cut, loss of a bodily function. <strong className="text-ink">A dangerous incident</strong> — an electric shock, a fall from height, a collapse, a fire or explosion, an uncontrolled escape of gas or a chemical — even when nobody was hurt.</p>
                  <p className="mt-2">If in doubt, call. The regulator would rather hear about one that did not need reporting.</p>
                </div>
              </details>
            }
            feeds={FEEDS.notifiable}
            source={yourRegulator ? `${yourRegulator.name} · ${yourRegulator.phone}` : 'The regulator for the state the site is in'}
            rows={notifiableRows}
          >
            <details className="mt-4 text-sm">
              <summary className="cursor-pointer text-rust-700 hover:underline">Every state&rsquo;s regulator</summary>
              <ul className="mt-2 grid gap-1 sm:grid-cols-2">
                {REGULATORS.map(r => (
                  <li key={r.code} className="text-ink-light"><strong className="text-ink">{r.place}</strong> · {r.name} · {r.phone}</li>
                ))}
              </ul>
            </details>
          </Group>
          <Group
            title="Workers’ comp & return to work"
            blurb="Tell the insurer as soon as you know — your state's scheme sets the deadline. Suitable duties are planned with the worker, the doctor and the supervisor, week by week."
            action={manage ? (
              <AddForm label="Start a claim">
                <form action={addClaim} className="grid gap-2">
                  <input className="input" name="worker" required placeholder="Worker" aria-label="Worker" />
                  <select className="input" name="reportId" defaultValue="" aria-label="The injury it follows">
                    <option value="">Which injury?</option>
                    {injuries.map(r => <option key={r.id} value={r.id}>{dateOf(r.createdAt)} · {r.text.slice(0, 60)}</option>)}
                  </select>
                  <input className="input" name="caseOwner" placeholder={`Case owner (${user.name})`} aria-label="Case owner" />
                  <label className="text-xs text-ink-light">Lodged <input className="input mt-1" type="date" name="lodgedAt" /></label>
                  <label className="text-xs text-ink-light">Insurer told <input className="input mt-1" type="date" name="insurerToldAt" /></label>
                  <div className="flex gap-2">
                    <input className="input" type="number" min={1} name="dutiesWeek" placeholder="Week" aria-label="Suitable duties, this week" />
                    <input className="input" type="number" min={1} name="dutiesWeeks" placeholder="Of" aria-label="Suitable duties, weeks planned" />
                  </div>
                  <SubmitButton className="btn-primary" pending="Starting…">Start the claim</SubmitButton>
                </form>
              </AddForm>
            ) : undefined}
            feeds={FEEDS.claims}
            source="Suitable duties booked as jobs in your job system when one is connected"
            rows={claimRows}
            empty="No claims open."
          />
        </div>
      )}

      {tab === 'hazards' && (
        <div className="grid gap-6">
          <Group
            title="Hazards & near misses"
            blurb="More reports is a good sign. Each one gets an owner and a date to fix it by."
            action={<Link href="/safety?kind=hazard#report" className="btn-secondary">Report a hazard</Link>}
            feeds={FEEDS.hazards}
            source="Tagged to the job and site"
            rows={hazards.map(reportRow)}
            empty="No hazards or near misses recorded yet."
          />
          <Group
            title="Wellbeing & psychosocial"
            blurb="Pressure, workload, conflict or behaviour. Anonymous if you want — then nobody can see who raised it. Named, only the GM sees who raised it."
            action={<Link href="/safety?kind=wellbeing#report" className="btn-secondary">Raise it privately</Link>}
            feeds={FEEDS.wellbeing}
            source="Seen by the top of the business only"
            rows={wellbeing.map(reportRow)}
            empty={data.viewer.isTop ? 'Nothing raised.' : 'Anything raised here goes to the top of the business, not to this list.'}
          />
          <Group
            title="Corrective actions"
            blurb="What will stop it happening again, who owns it and by when. Overdue actions go to the weekly meeting."
            action={manage ? (
              <AddForm label="Add an action">
                <form action={addAction} className="grid gap-2">
                  <input className="input" name="text" required placeholder="What will stop it happening again" aria-label="The action" />
                  <select className="input" name="reportId" defaultValue="" aria-label="The report it answers">
                    <option value="">Which report? (optional)</option>
                    {data.reports.filter(r => r.status !== 'closed').map(r => <option key={r.id} value={r.id}>{kindLabel(r.kind)} · {r.text.slice(0, 60)}</option>)}
                  </select>
                  <input className="input" name="owner" placeholder="Owner" aria-label="Owner" list="safety-people" />
                  <label className="text-xs text-ink-light">Due <input className="input mt-1" type="date" name="dueAt" /></label>
                  <SubmitButton className="btn-primary" pending="Adding…">Add the action</SubmitButton>
                </form>
              </AddForm>
            ) : undefined}
            feeds={FEEDS.actions}
            source="Owner from the org chart"
            rows={actionRows}
            empty="No corrective actions yet."
          />
        </div>
      )}

      {tab === 'site' && (
        <div className="grid gap-6">
          {CHECK_KINDS.map(k => (
            <Group
              key={k.key}
              title={k.title}
              blurb={{
                toolbox: 'Crew signs on for each talk. Who should be there comes from the schedule, so missing names show up on their own.',
                swms: 'High-risk work needs a signed SWMS before it starts. SPEC checks every crew member on the job has signed.',
                inspection: 'Every active site inspected each month. Findings become corrective actions.',
                vehicle: 'Every ute, trailer and bit of plant checked weekly. A vehicle that fails is pulled from the schedule until it is fixed.',
              }[k.key]}
              action={manage ? (
                <AddForm label={k.action}>
                  <form action={addCheck} className="grid gap-2">
                    <input type="hidden" name="kind" value={k.key} />
                    <input className="input" name="title" required aria-label="What it is" placeholder={{
                      toolbox: 'Working at heights', swms: 'Energised electrical work', inspection: 'The site', vehicle: 'Ute — weekly check',
                    }[k.key]} />
                    <input className="input" name="place" aria-label="Job, site or asset" placeholder={k.key === 'vehicle' ? 'Vehicle or plant' : 'Job or site'} />
                    <input className="input" name="person" aria-label="Who" placeholder={k.key === 'vehicle' ? 'Driver' : 'Who runs it'} list="safety-people" />
                    <label className="text-xs text-ink-light">{k.key === 'inspection' ? 'Done on, or due by' : 'Date'} <input className="input mt-1" type="date" name="onDate" /></label>
                    {k.key === 'toolbox' || k.key === 'swms' ? (
                      <div className="flex gap-2">
                        <input className="input" type="number" min={0} name="signed" placeholder="Signed" aria-label="How many have signed" />
                        <input className="input" type="number" min={0} name="expected" placeholder="Of" aria-label="How many should sign" />
                      </div>
                    ) : (
                      <select className="input" name="result" defaultValue="due" aria-label="Result">
                        <option value="due">Not done yet</option>
                        <option value="passed">Passed</option>
                        <option value="failed">Failed</option>
                      </select>
                    )}
                    <SubmitButton className="btn-primary" pending="Adding…">Add it</SubmitButton>
                  </form>
                </AddForm>
              ) : undefined}
              feeds={FEEDS[k.key]}
              source={{
                toolbox: 'Crew list from the day’s schedule in your job system when one is connected',
                swms: 'Attached to the job',
                inspection: 'Sites listed from active jobs',
                vehicle: 'Vehicles and plant from your job system’s assets when one is connected',
              }[k.key]}
              rows={checkRows(k.key)}
              empty="Nothing recorded yet."
            />
          ))}
        </div>
      )}

      {tab === 'clear' && (
        <div className="grid gap-6">
          <Group
            title="Licences & tickets"
            blurb="Everyone's licences, tickets and inductions in one place. SPEC warns 60 days before anything expires, and someone who is not clear to work cannot be booked on a job."
            action={manage ? (
              <AddForm label="Add a ticket">
                <form action={addTicket} className="grid gap-2">
                  <input className="input" name="what" required maxLength={120} placeholder="White card" aria-label="What it is" />
                  <select className="input" name="holder" defaultValue="" aria-label="Whose it is" required>
                    <option value="">Whose is it?</option>
                    {heldBy.map(h => <option key={h.value} value={h.value}>{h.label}</option>)}
                  </select>
                  <label className="text-xs text-ink-light">Expires (leave empty if it does not) <input className="input mt-1" type="date" name="expiresAt" /></label>
                  <input className="input" name="evidence" placeholder="Where the paper lives" aria-label="Where the paper lives" />
                  <SubmitButton className="btn-primary" pending="Adding…">Add it</SubmitButton>
                </form>
              </AddForm>
            ) : undefined}
            feeds={FEEDS.clear}
            source="Not clear = cannot be scheduled, in SPEC or in your job system"
            rows={ticketRows}
            empty="No licences or tickets recorded yet. The same list is kept on People."
          />
        </div>
      )}

      <datalist id="safety-people">
        {heldBy.map(h => <option key={h.value} value={h.label} />)}
      </datalist>
    </Shell>
  );
}

// ── Pieces ─────────────────────────────────────────────────────────────────────────────────────────

function Dot({ tone }: { tone: Tone }) {
  return <span aria-hidden className="mt-1 block h-3 w-3 flex-none rounded-full" style={{ background: LIGHT_COLOUR[tone] }} />;
}

function Chip({ tone, label }: { tone: Tone; label: string }) {
  return <span className="pill whitespace-nowrap" style={pillTone(tone)}>{label}</span>;
}

/** An add form, folded away behind the design's action button until somebody wants it. */
function AddForm({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <details className="group relative">
      <summary className="btn-secondary cursor-pointer list-none">{label}</summary>
      <div className="card absolute right-0 z-10 mt-2 w-[min(90vw,24rem)]">{children}</div>
    </details>
  );
}

function Group({ title, blurb, action, feeds, source, rows, empty, children }: {
  title: string;
  blurb: string;
  action?: React.ReactNode;
  feeds: { pillar: keyof typeof PILLAR_META; measure: string };
  source: string;
  rows: Row[];
  empty?: string;
  children?: React.ReactNode;
}) {
  return (
    <section className="card p-6 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-[62ch]">
          <h2 className="font-serif text-xl text-ink">{title}</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-light">{blurb}</p>
        </div>
        {action && <div className="flex-none">{action}</div>}
      </div>
      <div className="mt-5 grid gap-2">
        {rows.length ? rows.map(r => (
          <div key={r.key} className="rounded-2xl bg-cream px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="flex min-w-0 flex-[1_1_280px] items-start gap-3">
                <Dot tone={r.standing.tone} />
                <span className="grid min-w-0 gap-0.5">
                  <span className="break-words text-[14.5px] font-semibold text-ink">{r.title}</span>
                  <span className="text-sm text-ink-light">{[r.who, r.when].filter(Boolean).join(' · ')}</span>
                </span>
              </span>
              <Chip tone={r.standing.tone} label={r.standing.label} />
            </div>
            {r.controls && (
              <details className="mt-2">
                <summary className="cursor-pointer text-xs text-rust-700 hover:underline">Update</summary>
                <div className="mt-2">{r.controls}</div>
              </details>
            )}
          </div>
        )) : (
          <p className="text-sm text-ink-light">{empty ?? 'Nothing recorded yet.'}</p>
        )}
      </div>
      {children}
      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-ink-light">
        <span>Feeds <strong className="text-ink">{PILLAR_META[feeds.pillar].name} · {feeds.measure}</strong></span>
        <span>{source}</span>
      </div>
    </section>
  );
}
