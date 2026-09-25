/**
 * The pre-start: under a minute, before the first job, and the day does not open without it.
 *
 * ── Kris, 25 September ───────────────────────────────────────────────────────────────────────────
 *
 * *"who: anyone driving a company vehicle. Checks: vehicle (tyres, lights, load), tools and PPE,
 * test equipment in date, licence current. Under a minute, done before the first job. Not done = no
 * jobs on the phone that day. Any 'Not OK' = jobs stay locked until the supervisor clears it
 * (supervisor notified immediately)."*
 *
 * ── Why this one locks, when almost nothing else in SPEC does ────────────────────────────────────
 *
 * `lib/gentle` exists because software that calls people wrong makes them defensive, and nearly
 * everywhere the right move is to ask. Two things in this product refuse instead: the pay run, and
 * this. The reason is the same in both — the person who bears the mistake is not the person making
 * it. A tech who drives out on bald tyres is carrying everybody in the other lane, and a tester
 * that went out of calibration in March gives a reading that says a circuit is dead when it is not.
 *
 * ── Why locking the JOBS is the right lock ───────────────────────────────────────────────────────
 *
 * The obvious design is to block the phone, or the clock-on. Both are worse. Blocking the phone
 * means somebody stranded on a site with no way to tell anybody why; blocking the clock means a
 * person working unpaid while they sort it out. Locking the JOBS leaves them every way of reaching
 * their supervisor, leaves the clock alone, and removes the one thing that must not happen — going
 * to work.
 *
 * ── And why "Not OK" does not simply stop the day ────────────────────────────────────────────────
 *
 * A fault found is the pre-start WORKING. If declaring a flat tyre cost somebody their whole day,
 * the second flat tyre would not get declared, and the check becomes a button people press to make
 * the screen go away. So a fault notifies the supervisor immediately and the supervisor clears it —
 * often in thirty seconds, because the answer is usually "take the other ute".
 */

export type CheckKey = 'vehicle' | 'gear' | 'testers' | 'licence';

export interface PreStartCheck {
  key: CheckKey;
  label: string;
  /** What to actually look at. Specific, because "check the vehicle" is not a check. */
  look: string;
  /**
   * Whether SPEC already knows the answer and is asking the person to confirm it rather than to
   * find it out. Test equipment calibration and licence expiry are both on file.
   */
  prefilled: boolean;
}

export const CHECKS: PreStartCheck[] = [
  {
    key: 'vehicle', label: 'The ute', prefilled: false,
    look: 'Tyres, lights, and the load tied down.',
  },
  {
    key: 'gear', label: 'Tools and PPE', prefilled: false,
    look: 'What today needs, and your boots, glasses and gloves.',
  },
  {
    key: 'testers', label: 'Test equipment in date', prefilled: true,
    look: 'SPEC knows when yours was last calibrated — just confirm it is the one in your hand.',
  },
  {
    key: 'licence', label: 'Licence current', prefilled: true,
    look: 'SPEC knows when yours expires — confirm you have it on you.',
  },
];

export const checkByKey = (key: string): PreStartCheck | undefined =>
  CHECKS.find(c => c.key === key);

export type Mark = 'ok' | 'not_ok';

export interface PreStart {
  /** The day it is for. One per person per day. */
  day: string;
  who: string;
  marks: Partial<Record<CheckKey, Mark>>;
  /** What is wrong, when something is. Required for a fault — "not ok" with no words is not a report. */
  note: string;
  doneAt: string | null;
  /** Set when a supervisor has looked at a fault and said the day may go ahead. */
  clearedAt: string | null;
  clearedBy: string | null;
}

export const emptyPreStart = (day: string, who: string): PreStart =>
  ({ day, who, marks: {}, note: '', doneAt: null, clearedAt: null, clearedBy: null });

export const isComplete = (p: PreStart): boolean =>
  CHECKS.every(c => p.marks[c.key] !== undefined);

export const faults = (p: PreStart): PreStartCheck[] =>
  CHECKS.filter(c => p.marks[c.key] === 'not_ok');

/**
 * A fault needs words.
 *
 * "Not OK" on its own tells a supervisor that something is wrong with a ute somewhere and nothing
 * else — so they ring, and the next person learns that marking a fault means a phone call, and
 * marks OK. One box, one sentence, and the supervisor can usually answer without ringing at all.
 */
export const needsNote = (p: PreStart): boolean =>
  faults(p).length > 0 && p.note.trim().length === 0;

export type DayState =
  | 'not_done'    // nothing marked yet — the jobs are not on the phone
  | 'held'        // a fault, waiting on the supervisor
  | 'cleared'     // a fault the supervisor has cleared
  | 'clear';      // everything OK

export interface DayReading {
  state: DayState;
  /** THE question this module exists to answer. */
  mayWork: boolean;
  says: string;
}

export function readDay(p: PreStart | null): DayReading {
  if (!p || !isComplete(p) || !p.doneAt) {
    return {
      state: 'not_done', mayWork: false,
      says: 'Your pre-start is not done, so today’s jobs are not on your phone yet. It takes under a minute.',
    };
  }
  const bad = faults(p);
  if (bad.length === 0) {
    return { state: 'clear', mayWork: true, says: 'Pre-start done. You are good to go.' };
  }
  if (p.clearedAt) {
    return {
      state: 'cleared', mayWork: true,
      says: `${p.clearedBy} cleared it, so you are good to go. The fault is still on the record.`,
    };
  }
  return {
    state: 'held', mayWork: false,
    says: `${bad.map(b => b.label).join(' and ')} marked not OK. It is on your supervisor's screen now, and your jobs open the moment they clear it — you do not have to ring anybody.`,
  };
}

/**
 * What the supervisor sees, the moment a fault is marked.
 *
 * SPEC has no way to push a message to a phone yet, and this module will not say it has one — a
 * product that claims something arrived on its own when nothing did is the failure
 * `tests/no-false-feed.test.ts` exists to prevent. So this is the line that appears on the
 * supervisor's own screen, and `readDay` says exactly that to the person: it is on their screen,
 * not "they have been told".
 *
 * The distinction matters on the morning it is wrong. A tech who believes a message was sent waits;
 * a tech who knows it is sitting on a screen rings if nobody has looked in ten minutes.
 */
export function tellSupervisor(p: PreStart): string | null {
  const bad = faults(p);
  if (bad.length === 0) return null;
  const what = bad.map(b => b.label.toLowerCase()).join(' and ');
  return `${p.who} has marked ${what} not OK: “${p.note.trim()}”. Their jobs are locked until you clear it.`;
}

/**
 * Who has to do one.
 *
 * Anyone driving a company vehicle — which is not the same as everyone, and not the same as every
 * tech. An office person taking a ute to pick up materials is driving a company vehicle; a sparkie
 * in their own car on a rostered day at the yard is not.
 */
export const mustDoOne = (person: { drivesCompanyVehicle: boolean }): boolean =>
  person.drivesCompanyVehicle;

/* ─────────────────────────────────────────────────────────────────────────────
 * On time, which is the Safety KPI
 * ───────────────────────────────────────────────────────────────────────────── */

/**
 * Done before the first job, which is what "on time" means here.
 *
 * Not a clock time. A business with a 6am start and one with a 9am start would both be measured
 * against somebody else's morning, and the thing that actually matters is whether the check
 * happened before the work did rather than at eleven o'clock from the seat of a moving vehicle.
 */
export function onTime(p: PreStart | null, firstJobAt: string | null): boolean | null {
  if (!p?.doneAt) return false;
  if (!firstJobAt) return null;
  const done = Date.parse(p.doneAt);
  const first = Date.parse(firstJobAt);
  if (!Number.isFinite(done) || !Number.isFinite(first)) return null;
  return done <= first;
}

export interface OnTimeReading {
  /** How many people were counted. Null when nobody had a first job, so nothing can be said. */
  of: number;
  onTime: number;
  /** 0–100, or null when there is nothing to measure. A KPI SPEC cannot read is not a KPI of zero. */
  percent: number | null;
  says: string;
}

export function onTimeRate(
  rows: readonly { preStart: PreStart | null; firstJobAt: string | null }[],
): OnTimeReading {
  const judged = rows.map(r => onTime(r.preStart, r.firstJobAt)).filter((v): v is boolean => v !== null);
  if (judged.length === 0) {
    return { of: 0, onTime: 0, percent: null, says: 'Nobody had a job booked, so there is nothing to measure.' };
  }
  const ok = judged.filter(Boolean).length;
  const percent = Math.round((ok / judged.length) * 100);
  return {
    of: judged.length, onTime: ok, percent,
    says: ok === judged.length
      ? `Everybody did their pre-start before their first job.`
      : `${ok} of ${judged.length} did their pre-start before their first job.`,
  };
}

export const WHY_IT_LOCKS =
  'The jobs are what is locked, not your phone and not your clock. You can reach anybody, you are still on the clock, and the one thing that cannot happen is going to work on a ute nobody has looked at.';
