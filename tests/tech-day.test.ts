import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  STEPS, EMPTY_DAY, apply, canDo, canFinish, nextStep, isDone, timesheet, hoursLabel, clock, doneLine,
  primaryLabel, primaryNote, summary, revive, storageKey, cleanMaterials, minutesBetween,
  bookedOn, validClock, dayNear, daysAround, officeMinutes, hhmm,
  type TechDayState, type TechDayAction,
} from '../src/lib/tech-day';

const T = (hhmm: string) => `2026-09-23T${hhmm}:00.000Z`;
const JOB = { title: 'Rough-in, units 301–304', site: 'Level 3' };

const run = (...actions: TechDayAction[]): TechDayState => actions.reduce(apply, EMPTY_DAY);
const opened = () => run({ type: 'open', job: JOB });
const started = () => run(
  { type: 'open', job: JOB },
  { type: 'swms', by: 'Sam', at: T('07:14') },
  { type: 'start', at: T('07:15') },
);
const ready = () => [
  { type: 'photos', count: 6 },
  { type: 'materials', items: [{ name: 'TPS 2.5mm', qty: 2 }, { name: 'GPO', qty: 4 }, { name: 'Clips', qty: 1 }] },
  { type: 'sign', by: 'Site manager', at: T('13:20') },
].reduce((s, a) => apply(s, a as TechDayAction), started());

describe('the steps, as the design names them', () => {
  it('is the five steps, in the order a day goes', () => {
    expect(STEPS.map(s => s.label)).toEqual(['Sign the SWMS', 'Start the job', 'Add photos', 'Materials used', 'Client sign-off']);
  });

  it('has nothing to do before a job is open', () => {
    expect(nextStep(EMPTY_DAY)).toBeNull();
    for (const s of STEPS) expect(canDo(EMPTY_DAY, s.key)).toBe(false);
    expect(primaryLabel(EMPTY_DAY)).toBe('');
  });

  it('refuses a job with no name', () => {
    expect(apply(EMPTY_DAY, { type: 'open', job: { title: '   ', site: '' } })).toBe(EMPTY_DAY);
  });
});

describe('safety first, in the order that matters', () => {
  it('WILL NOT START A JOB BEFORE THE SWMS IS SIGNED', () => {
    const s = opened();
    expect(canDo(s, 'start')).toBe(false);
    expect(apply(s, { type: 'start', at: T('07:00') }).startedAt).toBeNull();
    expect(nextStep(s)).toBe('swms');
    expect(primaryLabel(s)).toBe('Sign the SWMS');
  });

  it('needs a name on the SWMS signature', () => {
    expect(apply(opened(), { type: 'swms', by: '  ', at: T('07:14') }).swmsSignedAt).toBeNull();
  });

  it('holds photos, materials and sign-off until the job has started', () => {
    const s = apply(opened(), { type: 'swms', by: 'Sam', at: T('07:14') });
    for (const key of ['photos', 'materials', 'sign'] as const) expect(canDo(s, key), key).toBe(false);
    expect(apply(s, { type: 'photos', count: 3 }).photos).toBe(0);
    expect(apply(s, { type: 'sign', by: 'Client', at: T('08:00') }).signedAt).toBeNull();
  });

  it('then takes the three on-job steps in any order', () => {
    const s = started();
    expect(canDo(s, 'sign')).toBe(true);
    const signedFirst = apply(s, { type: 'sign', by: 'Client', at: T('09:00') });
    expect(isDone(signedFirst, 'sign')).toBe(true);
    expect(nextStep(signedFirst)).toBe('photos');
  });

  it('keeps taking photos after the first', () => {
    const s = apply(apply(started(), { type: 'photos', count: 2 }), { type: 'photos', count: 4 });
    expect(s.photos).toBe(6);
    expect(canDo(s, 'photos')).toBe(true);
  });

  it('counts "nothing used" as an answer, and cleans what was typed', () => {
    const none = apply(started(), { type: 'materials', items: [] });
    expect(isDone(none, 'materials')).toBe(true);
    expect(doneLine(none, 'materials')).toBe('Nothing used');
    expect(cleanMaterials([{ name: '  Cable ', qty: 0 }, { name: ' ', qty: 3 }, { name: 'GPO', qty: 2.7 }]))
      .toEqual([{ name: 'Cable', qty: 1 }, { name: 'GPO', qty: 2 }]);
  });
});

describe('finish, and the timesheet builds itself', () => {
  it('offers Finish only when all five are done', () => {
    expect(canFinish(started())).toBe(false);
    expect(apply(started(), { type: 'finish', at: T('13:30') }).finishedAt).toBeNull();
    const s = ready();
    expect(nextStep(s)).toBe('finish');
    expect(primaryLabel(s)).toBe('Finish the job');
    expect(primaryNote(s)).toMatch(/Stops your hours/);
  });

  it('clocks from Start to Finish with nobody typing hours', () => {
    const s = apply(ready(), { type: 'finish', at: T('13:45') });
    const t = timesheet(s, T('18:00'));
    expect(t).toEqual({ start: T('07:15'), finish: T('13:45'), minutes: 390, running: false });
    expect(hoursLabel(t.minutes)).toBe('6.5 h');
    expect(summary(s, T('18:00'))).toEqual({ hours: '6.5 h', materials: '3 items', photos: '6' });
    expect(nextStep(s)).toBeNull();
  });

  it('counts up while the job is running', () => {
    const t = timesheet(started(), T('08:45'));
    expect(t.running).toBe(true);
    expect(t.minutes).toBe(90);
    expect(timesheet(EMPTY_DAY, T('08:00')).minutes).toBe(0);
  });

  it('never makes negative hours out of a clock that went backwards', () => {
    const s = apply(ready(), { type: 'finish', at: T('06:00') });
    expect(timesheet(s, T('18:00')).minutes).toBe(0);
    expect(minutesBetween(T('10:00'), T('09:00'))).toBe(0);
    expect(minutesBetween('nonsense', T('09:00'))).toBe(0);
  });

  it('will not let a new job overwrite one with hours running on it', () => {
    const s = started();
    expect(apply(s, { type: 'open', job: { title: 'Fault find', site: '' } })).toBe(s);
    const done = apply(ready(), { type: 'finish', at: T('13:45') });
    expect(apply(done, { type: 'open', job: { title: 'Fault find', site: '' } }).job?.title).toBe('Fault find');
  });

  it('closes everything once finished', () => {
    const s = apply(ready(), { type: 'finish', at: T('13:45') });
    for (const step of STEPS) expect(canDo(s, step.key), step.key).toBe(false);
  });
});

describe('what the phone says', () => {
  it('says when each step was done, on the phone’s own clock', () => {
    const s = ready();
    expect(clock(T('07:14'), 'UTC')).toBe('7:14');
    expect(doneLine(s, 'swms', 'UTC')).toBe('Signed 7:14');
    expect(doneLine(s, 'start', 'UTC')).toBe('Started 7:15 · clocking');
    expect(doneLine(s, 'photos')).toBe('6 photos added');
    expect(doneLine(s, 'materials')).toBe('3 items · for the job costing');
    expect(doneLine(s, 'sign')).toBe('Signed by Site manager');
  });

  it('keeps one day per person per phone, and survives a reload', () => {
    expect(storageKey('u1', '2026-09-23')).not.toBe(storageKey('u2', '2026-09-23'));
    expect(storageKey('u1', '2026-09-23')).not.toBe(storageKey('u1', '2026-09-24'));
    const s = ready();
    expect(revive(JSON.stringify(s))).toEqual(s);
  });

  it('reads anything it did not write as an empty day, never a crash', () => {
    for (const bad of [null, '', 'not json', '42', 'null', '{"photos":-3,"job":{"title":7}}']) {
      const s = revive(bad);
      expect(s.photos).toBeGreaterThanOrEqual(0);
      expect(s.job).toBeNull();
    }
  });
});

describe('the page', () => {
  const page = readFileSync('src/app/tech-day/page.tsx', 'utf8');
  const phone = readFileSync('src/components/tech-day-phone.tsx', 'utf8');

  it('is for somebody signed in', () => {
    expect(page).toContain("redirect('/signin");
  });

  it('runs every tap through the tested rules rather than its own', () => {
    expect(phone).toContain("from '@/lib/tech-day'");
    expect(phone).toContain('apply(');
    expect(phone).not.toMatch(/startedAt:\s*new Date/);
  });

  /*
    Since 23 September Start and Finish reach the office's timesheets. Photos, materials and the
    sign-off still have no store, and the page has to say so — and say so again whenever the office
    did not get the hours — rather than let a tech believe the office has what it has not.
  */
  it('says plainly what stays on this phone, and when the office did not get the hours', () => {
    expect(phone).toMatch(/stay on this phone/i);
    expect(phone).toMatch(/kept on this phone/i);
    expect(phone).toMatch(/office did not get/i);
    expect(phone).not.toMatch(/has the invoice ready/);
  });

  it('takes its jobs from the office’s schedule, and writes Start and Finish to the timesheets', () => {
    expect(page).toContain('schema.scheduleBookings');
    expect(phone).toContain('clockOn(');
    expect(phone).toContain('clockOff(');
  });
});

describe('Start and Finish at the office', () => {
  const actions = readFileSync('src/app/tech-day/actions.ts', 'utf8');

  it('writes only the signed-in person’s own time — never a person the phone names', () => {
    expect(actions).toContain('`user:${user.id}`');
    expect(actions).not.toMatch(/input\.(personKey|person|userId)/);
  });

  it('puts a job on the entry only when the office booked this person on it', () => {
    expect(actions).toContain('schema.scheduleBookings');
    expect(actions).toContain('inArray(schema.scheduleBookings.personKey, keys)');
  });

  it('counts minutes from the server’s own clock, not the phone’s', () => {
    expect(actions).toContain('officeMinutes(entry.createdAt, new Date())');
  });
});

describe('the office’s side, pure', () => {
  const at = (iso: string) => new Date(iso);

  it('takes the office’s entry only while a job is running, and only once', () => {
    const running = run({ type: 'open', job: JOB }, { type: 'swms', by: 'Sam', at: T('07:00') }, { type: 'start', at: T('07:10') });
    const saved = apply(running, { type: 'saved', entryId: 'e1' });
    expect(saved.entryId).toBe('e1');
    expect(apply(saved, { type: 'saved', entryId: 'e2' }).entryId).toBe('e1');
    expect(apply(opened(), { type: 'saved', entryId: 'e1' }).entryId).toBeNull();
  });

  it('keeps the scheduled job and the entry across a reload', () => {
    const s = apply(
      run({ type: 'open', job: { title: 'Rough-in', site: 'Unit 3', jobId: 'j1', ref: 'J-1004' } }, { type: 'swms', by: 'Sam', at: T('07:00') }, { type: 'start', at: T('07:10') }),
      { type: 'saved', entryId: 'e1' },
    );
    const back = revive(JSON.stringify(s));
    expect(back.entryId).toBe('e1');
    expect(back.job).toEqual({ title: 'Rough-in', site: 'Unit 3', jobId: 'j1', ref: 'J-1004' });
    expect(revive(JSON.stringify({ job: { title: 'Typed' } })).job).toEqual({ title: 'Typed', site: '', jobId: null, ref: null });
  });

  it('shows the phone’s own day of bookings, once each, in J-number order', () => {
    const b = (jobId: string, ref: string, day: string) => ({ jobId, ref, title: ref, site: '', client: 'C', day });
    const list = [b('a', 'J-1010', '2026-09-23'), b('b', 'J-1002', '2026-09-23'), b('a', 'J-1010', '2026-09-23'), b('c', 'J-1001', '2026-09-24')];
    expect(bookedOn(list, '2026-09-23').map(x => x.ref)).toEqual(['J-1002', 'J-1010']);
    expect(bookedOn(list, '2026-09-22')).toEqual([]);
  });

  it('accepts a clock time and a day only in their proper shape, and the day only near the server’s', () => {
    expect(validClock('07:14')).toBe('07:14');
    for (const bad of ['7:14', '24:00', '07:60', '', null, 714]) expect(validClock(bad)).toBeNull();
    const now = at('2026-09-23T22:00:00Z');
    expect(dayNear('2026-09-24', now)).toBe('2026-09-24'); // a phone east of the server
    expect(dayNear('2026-09-22', now)).toBe('2026-09-22');
    expect(dayNear('2026-09-26', now)).toBeNull();
    expect(dayNear('2026-13-40', now)).toBeNull();
    expect(daysAround(now)).toEqual(['2026-09-22', '2026-09-23', '2026-09-24']);
  });

  it('labels with the phone’s clock and caps a forgotten Finish at a day', () => {
    expect(hhmm(new Date(2026, 8, 23, 7, 4))).toBe('07:04');
    expect(officeMinutes('2026-09-23T07:00:00Z', at('2026-09-23T13:30:00Z'))).toBe(390);
    expect(officeMinutes('2026-09-20T07:00:00Z', at('2026-09-23T13:30:00Z'))).toBe(1440);
    expect(officeMinutes('2026-09-23T13:30:00Z', at('2026-09-23T07:00:00Z'))).toBe(0);
  });
});
