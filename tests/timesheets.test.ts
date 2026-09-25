import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  ALLOWANCES, parseAllowances, paidMinutes, payWeek, reconcile, approvable, approveAdvice, approveTopic,
  destinationFor, maySend, sentLine, PAY_HEADER, payLines, runRows,
  type Entry, type Booking, type JobRef,
} from '../src/lib/timesheets';
import { cardState, fingerprint } from '../src/lib/recommends';
import { areaOf, didYouKnow, ownPath, switchAdvice, checksFor, SWITCH_AREAS, type BusinessCounts } from '../src/lib/switch';
import { ANGUS_SHIELD, ADMIN_DEPARTMENT } from '../src/lib/virtual-gm-overview';
import { WORKFLOWS, placesFor } from '../src/lib/workflows';

const JOBS: JobRef[] = [
  { id: 'j1', ref: 'J-101', site: '12 Smith St', stage: 'scheduled' },
  { id: 'j2', ref: 'J-102', site: '4 Beach Rd', stage: 'paid' },
];

let n = 0;
const entry = (over: Partial<Entry> = {}): Entry => ({
  id: `e${++n}`, personKey: 'staff:sam', personName: 'Sam', jobId: 'j1', day: '2026-09-21',
  startedAt: '07:00', finishedAt: '15:30', minutes: 480, breakMinutes: 30, travelMinutes: 0, allowances: '',
  approvedAt: null, ...over,
});
const booked = (over: Partial<Booking> = {}): Booking => ({ personKey: 'staff:sam', jobId: 'j1', day: '2026-09-21', ...over });

describe('the basics — who, which job, where, when', () => {
  it('works out paid time as start to finish less the break, and nothing else', () => {
    expect(paidMinutes('07:00', '15:30', 30)).toBe(480);
    expect(paidMinutes('07:00', '15:30')).toBe(510);
    expect(paidMinutes('15:30', '07:00')).toBeNull();
    expect(paidMinutes('07:00', '08:00', 90)).toBeNull();
    expect(paidMinutes('7am', '3pm')).toBeNull();
  });

  it('keeps allowance tags to the list, once each', () => {
    expect(ALLOWANCES.map(a => a.key)).toEqual(['site', 'overtime', 'meal']);
    expect(parseAllowances('overtime,site,bogus,site')).toEqual(['site', 'overtime']);
    expect(parseAllowances(null)).toEqual([]);
  });

  it('reads a pay week as Monday to Sunday, so Saturday is not left behind', () => {
    expect(payWeek('2026-09-24')).toEqual(['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26', '2026-09-27']);
    expect(payWeek('2026-09-27')[0]).toBe('2026-09-21');
  });
});

describe('reconcile — hours against jobs, gaps, clashes, anything unusual', () => {
  it('holds back time that never finished, and overlapping time', () => {
    const open = entry({ finishedAt: null, minutes: 0 });
    const a = entry({ startedAt: '07:00', finishedAt: '12:00', minutes: 300, breakMinutes: 0 });
    const b = entry({ startedAt: '11:00', finishedAt: '15:00', minutes: 240 });
    const flags = reconcile([open, a, b], [booked()], JOBS);
    expect(flags.filter(f => f.blocking).map(f => f.kind).sort()).toEqual(['clash', 'running']);
    expect(flags.find(f => f.kind === 'clash')!.entryIds.sort()).toEqual([a.id, b.id].sort());
    expect(approvable([open, a, b], flags)).toEqual([]);
  });

  it('flags a gap: booked on a job, no time on it', () => {
    const flags = reconcile([entry()], [booked(), booked({ day: '2026-09-22' })], JOBS);
    expect(flags.map(f => f.kind)).toEqual(['booked_no_time']);
    expect(flags[0].says).toBe('Booked on J-101 and no time recorded on it.');
  });

  it('highlights the unusual without holding it back', () => {
    const e = [
      entry({ jobId: 'j2' }),                                                            // not booked, job already paid
      entry({ day: '2026-09-26', minutes: 420, breakMinutes: 30 }),                        // Saturday, not tagged overtime
      entry({ day: '2026-09-23', startedAt: '05:00', finishedAt: '18:30', minutes: 810, breakMinutes: 0 }), // long day, no break
    ];
    const flags = reconcile(e, [booked({ day: '2026-09-26' }), booked({ day: '2026-09-23' })], JOBS);
    const kinds = flags.map(f => f.kind).sort();
    expect(kinds).toEqual(['closed_job', 'long_day', 'no_break', 'time_not_booked', 'weekend']);
    expect(flags.every(f => !f.blocking)).toBe(true);
    expect(approvable(e, flags)).toHaveLength(3);
  });

  it('tagging weekend time as overtime clears the weekend flag', () => {
    const sat = entry({ day: '2026-09-26', allowances: 'overtime' });
    expect(reconcile([sat], [booked({ day: '2026-09-26' })], JOBS)).toEqual([]);
  });

  it('flags a week over the ordinary 38 hours', () => {
    const week = ['21', '22', '23', '24', '25'].map(d => entry({ day: `2026-09-${d}`, minutes: 540, startedAt: '06:00', finishedAt: '15:30' }));
    const flags = reconcile(week, week.map(w => booked({ day: w.day })), JOBS);
    expect(flags.map(f => f.kind)).toContain('long_week');
  });

  it('never approves an entry twice or one a clash is holding', () => {
    const done = entry({ approvedAt: '2026-09-22' });
    const fresh = entry({ day: '2026-09-22' });
    expect(approvable([done, fresh], reconcile([done, fresh], [booked(), booked({ day: '2026-09-22' })], JOBS))).toEqual([fresh.id]);
  });
});

describe('approve — the Claude recommends step', () => {
  const monday = '2026-09-21';

  it('recommends approving what can be, and says what needs a look first', () => {
    const e = [entry(), entry({ day: '2026-09-22' })];
    const flags = reconcile(e, [booked()], JOBS);
    const rec = approveAdvice(monday, e, flags);
    expect(rec.kind).toBe('recommend');
    if (rec.kind !== 'recommend') return;
    expect(rec.topic).toBe(approveTopic(monday));
    expect(rec.headline).toBe('Approve 2 entries for the week of 21 Sept — 1 thing needs a look first.');
    expect(rec.reason).toContain('time on a job not booked');
    expect(rec.action).toEqual({ type: 'approve_timesheets', week: monday });
    expect(rec.facts.find(f => f.label === 'Paid hours')!.value).toBe('16');
  });

  it('says nothing unusual when nothing is', () => {
    const e = [entry()];
    const rec = approveAdvice(monday, e, reconcile(e, [booked()], JOBS));
    expect(rec.headline).toContain('nothing unusual');
  });

  it('says exactly what is missing when nothing can be approved, and when there is no time at all', () => {
    const open = entry({ finishedAt: null });
    const blocked = approveAdvice(monday, [open], reconcile([open], [booked()], JOBS));
    expect(blocked.kind).toBe('missing');
    expect(blocked.kind === 'missing' && blocked.missing[0].what).toContain('never finished');
    const none = approveAdvice(monday, [], []);
    expect(none.kind).toBe('missing');
    expect(none.headline).toContain('No time recorded');
  });

  it('is done once everything is approved, and keeps its fingerprint while the week stands', () => {
    const approved = [entry({ approvedAt: '2026-09-28' })];
    expect(cardState(approveAdvice(monday, approved, []), null)).toBe('hold');
    const a = approveAdvice(monday, [entry()], []);
    const b = approveAdvice(monday, [entry(), entry({ day: '2026-09-23' })], []);
    expect(fingerprint(a)).toBe(fingerprint(b));
  });
});

describe('send — to the business’s own payroll system, or Angus Shield', () => {
  it('waits until every entry in the week is approved, and never sends twice', () => {
    expect(maySend([], null)).toEqual({ ok: false, why: 'Nothing approved yet.' });
    expect(maySend([entry({ approvedAt: 'x' }), entry()], null).why).toBe('1 entry is still waiting for approval.');
    expect(maySend([entry({ approvedAt: 'x' })], null).ok).toBe(true);
    expect(maySend([entry({ approvedAt: 'x' })], '2026-09-29T00:00:00Z').ok).toBe(false);
  });

  it('goes to Angus Shield only once payroll is switched to it — otherwise the export, which always works', () => {
    expect(destinationFor(false)).toBe('export');
    expect(destinationFor(true)).toBe('angus_shield');
    expect(sentLine('export', '2026-09-29T00:00:00Z')).toBe('Sent to your payroll system 2026-09-29.');
    expect(sentLine('angus_shield', '2026-09-29T00:00:00Z')).toBe('In Angus Shield’s pay run since 2026-09-29.');
  });

  it('sends hours only — never a rate, tax, super or a payslip', () => {
    expect(PAY_HEADER.join(' ')).not.toMatch(/rate|tax|super|gross|net|payslip|\$/i);
    const lines = payLines([entry({ approvedAt: 'x', allowances: 'site,overtime', travelMinutes: 20 }), entry()], JOBS);
    expect(lines).toEqual([['Sam', '2026-09-21', 'J-101', '12 Smith St', '07:00', '15:30', 30, 20, 8, 'Site allowance; Overtime']]);
    expect(runRows([entry({ approvedAt: 'x' }), entry()])).toEqual([{ who: 'Sam', minutes: 480, jobs: 1 }]);
  });

  it('no file or screen in SiteVIP’s payroll path works out tax, super or payslips', () => {
    for (const f of ['src/lib/timesheets.ts', 'src/lib/timesheets-data.ts', 'src/app/jobs/timesheet-export/route.ts']) {
      const code = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*(\/\/|\*).*$/gm, '');
      expect(code, f).not.toMatch(/superannuation|payg|withholding|taxRate|super_rate|payslip\(/i);
    }
  });

  it('the send is one tap, from the same site, and a lapsed or look-around business cannot write', () => {
    const route = readFileSync('src/app/jobs/timesheet-export/route.ts', 'utf8');
    expect(route).toContain("request.headers.get('origin')");
    expect(route).toContain('await assertWritable(user.tenantId)');
    expect(route).toContain('export const GET');
    expect(route).toContain('export const POST');
    const page = readFileSync('src/app/jobs/page.tsx', 'utf8');
    expect(page).toContain('action="/jobs/timesheet-export" method="post"');
  });
});

describe('one place, and the choice stays the business’s', () => {
  it('timesheet, reconcile, approve and send are all on Jobs › Time', () => {
    const page = readFileSync('src/app/jobs/page.tsx', 'utf8');
    for (const marker of ['data-timesheet', 'data-reconcile', 'data-approve', 'data-send']) expect(page).toContain(marker);
    for (const id of ['timesheet', 'payroll-run']) {
      const w = WORKFLOWS.find(x => x.id === id)!;
      expect(placesFor(w, 'office')).toEqual(['/jobs']);
    }
    expect(ADMIN_DEPARTMENT.find(j => j.key === 'payroll')!.href).toBe('/jobs?tab=time');
  });

  it('the old pay-run actions that ran on unapproved hours are gone', () => {
    const actions = readFileSync('src/app/people/actions.ts', 'utf8');
    expect(actions).not.toContain('runPayCheck');
    expect(actions).not.toContain('exportPayRun');
  });

  it('the payroll card points to Angus Shield for the processing side', () => {
    const payroll = areaOf('payroll')!;
    expect(payroll.home).toBe('/jobs?tab=time');
    expect(didYouKnow(payroll)).toContain(`${ANGUS_SHIELD.name}, SPEC’s own, is being built to process your pay — tax, super and payslips`);
    expect(didYouKnow(payroll)).toContain('no export step');
  });

  it('every card keeps the business’s own system as a full path, said beside the offer', () => {
    for (const a of SWITCH_AREAS) expect(ownPath(a), a.key).toMatch(/works just as well/);
    expect(ownPath(areaOf('payroll')!)).toContain('export in one tap');
    expect(readFileSync('src/components/recommends.tsx', 'utf8')).toContain('data-own-path');
  });

  it('Not yet on an offer is respected until something changes — it never comes back on a timer', () => {
    const counts: BusinessCounts = {
      staff: 3, staffWithStart: 3, staffWithContact: 3, staffInducted: 3, customers: 1, catalogue: 1, jobs: 1,
      timesheets30: 5, timesheetsApproved30: 5, payRunsSent: 1, ledgerLinked: false,
    };
    const rec = switchAdvice(areaOf('payroll')!, null, checksFor(areaOf('payroll')!, counts));
    const saidNotYet = { answer: 'not_yet' as const, fingerprint: fingerprint(rec), decidedAt: '2025-01-01T00:00:00Z', outcome: null };
    expect(cardState(rec, saidNotYet, new Date('2026-09-25'))).toBe('waiting');
    const card = readFileSync('src/components/recommends.tsx', 'utf8');
    // The offer itself carries a Not yet, beside "I want this".
    expect(card).toMatch(/rec\.interest\.yes\} primary \/>\s*<Answer answer="not_yet"/);
  });
});

describe('the Angus Shield contract (docs/ANGUS_SHIELD_SITEVIP_CONTRACT.md)', () => {
  const data = readFileSync('src/lib/timesheets-data.ts', 'utf8');
  const page = readFileSync('src/app/jobs/page.tsx', 'utf8');

  it('the seamless path turns on only with a live Angus Shield connection — never a toggle here', () => {
    expect(data).toContain("eq(schema.connectionCredentials.provider, 'angus_shield')");
    expect(data).toContain("r.status === 'live'");
    expect(data).not.toContain('systemSwitches');
  });

  it('only approved hours ever leave SiteVIP, and never before approval (contract §2, §8)', () => {
    expect(payLines([entry(), entry({ finishedAt: null })], JOBS)).toEqual([]);
    expect(runRows([entry()])).toEqual([]);
  });

  it('there is no send button to Angus Shield — connected, hours go on approval with no export step', () => {
    expect(page).not.toContain('Send to Angus');
    expect(page).toContain("send.ok && to === 'export'");
    expect(page).toContain('No export step.');
  });

  it('never red: held back is amber, worth a look asks "Is this correct?"', () => {
    const block = page.slice(page.indexOf('data-reconcile'), page.indexOf('data-approve'));
    expect(block).not.toMatch(/light=\{[^}]*'red'/);
    expect(block).toContain('Is this correct?');
  });
});

