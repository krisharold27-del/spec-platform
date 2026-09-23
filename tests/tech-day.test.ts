import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  STEPS, EMPTY_DAY, apply, canDo, canFinish, nextStep, isDone, timesheet, hoursLabel, clock, doneLine,
  primaryLabel, primaryNote, summary, revive, storageKey, cleanMaterials, minutesBetween,
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
    Nothing is stored on a server for this yet — there is no jobs or timesheet table — and the page
    has to say so rather than let a tech believe the office has their hours.
  */
  it('says plainly that the day is kept on this phone for now', () => {
    expect(phone).toMatch(/kept on this phone/i);
    expect(phone).not.toMatch(/has the invoice ready/);
  });
});
