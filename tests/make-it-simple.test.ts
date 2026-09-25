import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  FRICTIONS, NO_SIGNALS, frictionAdvice, topFrictions, buildReport, parseReport, meetingDateFor, isDue,
  scheduleLine, isMeetingDay, isMeetingTime, simpleTopic, type Signals, type ReportInput,
} from '../src/lib/make-it-simple';
import { fingerprint } from '../src/lib/recommends';

const routeExists = (href: string) =>
  existsSync(join('src/app', href.split('?')[0].split('#')[0].replace(/^\//, ''), 'page.tsx'));

const BUSY: Signals = {
  timesheetsWaiting: 18, oldestTimesheetDays: 9, overdueInvoices: 3, overdueCents: 1_240_000, carriedActions: 2,
  openCallbacks: 4, callbackCostCents: 86_000, unsentWeeks: 0, staleEnquiries: 5, oldestEnquiryDays: 6,
};

const input = (over: Partial<ReportInput> = {}): ReportInput => ({
  meetingDate: '2026-09-30', now: new Date('2026-09-29T08:00:00Z'), schedule: 'Wednesday at 07:30',
  signals: BUSY, previous: null, done: [], tracked: [], ready: [], friction: [], ...over,
});

describe('Make it simple — the top three still complicated', () => {
  it('only lists friction with something real behind it, money first, three at most', () => {
    expect(topFrictions(BUSY).map(f => f.key)).toEqual(['invoices', 'callbacks', 'enquiries']);
    expect(topFrictions(NO_SIGNALS)).toEqual([]);
    expect(topFrictions({ ...NO_SIGNALS, carriedActions: 1 }).map(f => f.key)).toEqual(['carried']);
  });

  it('files every friction under one of the five kinds Kris named', () => {
    const kinds = ['Repeated manual steps', 'Double handling', 'Admin nobody likes', 'Delays', 'Errors'];
    for (const f of FRICTIONS) {
      expect(kinds, f.key).toContain(f.kind);
      expect(routeExists(f.href), f.href).toBe(true);
    }
  });

  it('each one is a Claude recommends card with the numbers behind it, and yes makes it an action', () => {
    const rec = frictionAdvice('invoices', BUSY)!;
    expect(rec.kind).toBe('recommend');
    if (rec.kind !== 'recommend') return;
    expect(rec.topic).toBe(simpleTopic('invoices'));
    expect(rec.headline).toBe('3 invoices are more than 30 days overdue — $12,400 outstanding.');
    expect(rec.reason).toContain('Claude recommends: ring each customer');
    expect(rec.action).toEqual({ type: 'meeting_action', key: 'invoices', text: 'Ring each customer with an invoice over 30 days and agree a date to pay' });
    expect(rec.facts.map(f => f.value)).toEqual(['3', '$12,400', 'Delays']);
    expect(rec.yes).toBe('Yes — make it an action');
  });

  it('keeps its fingerprint while the problem stands, so a Not yet is not re-asked every day', () => {
    const today = frictionAdvice('timesheets', BUSY)!;
    const tomorrow = frictionAdvice('timesheets', { ...BUSY, timesheetsWaiting: 21, oldestTimesheetDays: 10 })!;
    expect(fingerprint(tomorrow)).toBe(fingerprint(today));
  });

  it('reads as sorted once the thing behind it has gone — never a card with nothing to do', () => {
    const rec = frictionAdvice('invoices', { ...BUSY, overdueInvoices: 0, overdueCents: 0 })!;
    expect(rec.kind).toBe('hold');
    expect(rec.headline).toContain('Sorted');
    expect(frictionAdvice('no-such-thing', BUSY)).toBeNull();
  });

  it('says one of each, and several of many', () => {
    const one = frictionAdvice('callbacks', { ...BUSY, openCallbacks: 1 })!;
    expect(one.headline).toMatch(/^1 callback is still open/);
    expect(frictionAdvice('enquiries', { ...BUSY, staleEnquiries: 1 })!.headline).toMatch(/^1 enquiry has waited/);
  });
});

describe('Make it simple — the report', () => {
  it('has the four parts, in plain words', () => {
    const r = buildReport(input({
      ready: [{ area: 'people', line: 'Ready: You’re ready to switch your HR to SPEC.', href: '/switch?area=people' }],
      friction: [{ kind: 'too_many_steps', note: 'Had to re-enter the pay rates', month: '2026-09' }],
    }));
    expect(r.simpler).toEqual(['Nothing SPEC can see got simpler this week.']);
    expect(r.frictions.map(f => f.key)).toEqual(['invoices', 'callbacks', 'enquiries']);
    expect(r.ready[0].href).toBe('/switch?area=people');
    expect(r.guarantee.lines).toEqual(['It took too many steps — “Had to re-enter the pay rates”']);
    expect(r.guarantee.months).toEqual(['2026-09']);
    expect(r.schedule).toBe('Wednesday at 07:30');
  });

  it('says what got simpler: decisions carried out, last week’s fixes done, and numbers that fell', () => {
    const previous = buildReport(input({ signals: { ...BUSY, timesheetsWaiting: 30 } }));
    const r = buildReport(input({
      previous,
      done: [{ headline: 'Set your Standard labour rate at $125/hr.' }],
      tracked: [
        { text: 'Approve timesheets as they land', owner: 'Sam', done: true },
        { text: 'Close out the open callbacks', owner: 'Alex', done: false },
      ],
    }));
    expect(r.simpler).toEqual([
      'Done: Set your Standard labour rate at $125/hr.',
      'Approve timesheets as they land — done (Sam).',
      'Waiting for approval: 30 → 18.',
    ]);
    // Accepted fixes are tracked to done, finished or not.
    expect(r.tracked).toHaveLength(2);
  });

  it('reads back what it wrote, and treats a bad row as no report', () => {
    const r = buildReport(input());
    expect(parseReport(JSON.stringify(r))).toEqual(r);
    expect(parseReport('not json')).toBeNull();
    expect(parseReport('{"x":1}')).toBeNull();
  });
});

describe('Make it simple — before each meeting', () => {
  it('is for the next meeting day, or this week’s Monday when none is set', () => {
    const wed = new Date('2026-09-30T10:00:00Z');       // a Wednesday
    expect(meetingDateFor(wed, 3)).toBe('2026-09-30');   // meeting today
    expect(meetingDateFor(wed, 5)).toBe('2026-10-02');   // Friday
    expect(meetingDateFor(wed, 1)).toBe('2026-10-05');   // next Monday
    expect(meetingDateFor(wed, null)).toBe('2026-09-28');
  });

  it('is written from the day before the meeting, never a week early', () => {
    expect(isDue(new Date('2026-09-29T08:00:00Z'), '2026-09-30', 3)).toBe(true);
    expect(isDue(new Date('2026-09-30T08:00:00Z'), '2026-09-30', 3)).toBe(true);
    expect(isDue(new Date('2026-09-27T08:00:00Z'), '2026-09-30', 3)).toBe(false);
    // With no day set it runs weekly, any day of the week.
    expect(isDue(new Date('2026-09-27T08:00:00Z'), '2026-09-21', null)).toBe(true);
  });

  it('takes only a real day and a real time', () => {
    expect(isMeetingDay(3)).toBe(true);
    expect(isMeetingDay(0)).toBe(false);
    expect(isMeetingDay(8)).toBe(false);
    expect(isMeetingTime('07:30')).toBe(true);
    expect(isMeetingTime('7:30')).toBe(false);
    expect(isMeetingTime('25:00')).toBe(false);
    expect(scheduleLine(3, '07:30')).toBe('Wednesday at 07:30');
    expect(scheduleLine(null, '07:30')).toBeNull();
  });
});

describe('Make it simple — in the meeting', () => {
  const page = readFileSync('src/app/meeting/page.tsx', 'utf8');
  const component = readFileSync('src/components/make-it-simple.tsx', 'utf8');
  const data = readFileSync('src/lib/make-it-simple-data.ts', 'utf8');

  it('is the first item on the meeting page', () => {
    const shell = page.indexOf('headline="Twenty minutes, three items, written down."');
    expect(page.indexOf('<MakeItSimple', shell)).toBeGreaterThan(shell);
    expect(page.indexOf('<MakeItSimple', shell)).toBeLessThan(page.indexOf('This week&rsquo;s three', shell));
  });

  it('accepting a fix needs an owner, and becomes an action raised by Make it simple', () => {
    const decide = readFileSync('src/app/recommends/actions.ts', 'utf8');
    expect(decide).toContain("action.type === 'meeting_action' && !owner");
    expect(data).toContain('source }');
    expect(data).toMatch(/a\.source\?\.startsWith\('simple:'\)/);
    expect(component).toContain('owners={owners}');
  });

  it('asks for the meeting time once, only while it is not set', () => {
    expect(component).toContain('{!schedule.day && (');
    expect(component).toContain('The report runs every Monday until you say.');
  });

  it('writes the report from inside the business — never by walking every business', () => {
    expect(data).not.toMatch(/from\(schema\.tenants\)\s*;/);
    expect(data).toContain('eq(schema.tenants.id, tenantId)');
    expect(readFileSync('vercel.json', 'utf8')).not.toContain('make-it-simple');
    expect(readFileSync('src/app/my-page/page.tsx', 'utf8')).toContain('after(() => ensureReport(user.tenantId)');
  });

  it('keeps the person-or-process review off the shared report', () => {
    expect(data).not.toContain('automationReview');
    expect(component).toContain('mayReadAutomation &&');
  });
});
