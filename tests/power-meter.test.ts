import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  FRAMEWORK, HEAVY_SLOTS, SHARED_SLOTS, HEAVY_POINTS, SHARED_POINTS, ENOUGH_SLOTS,
  powerReading, readSlot, bandOf, ringOffset, coverageLine, scopeLabel, sourcesOf,
  readSnapSlot, SNAP_MET_AT,
  type Measure, type Slot,
} from '../src/lib/power-meter';
import { PILLARS } from '../src/lib/scoring';

/**
 * ── The Virtual GM Power Meter ───────────────────────────────────────────────────────────────────
 *
 * Kris, 19 September: *"add the Virtual GM power meter - HACC your power - to the my page - this is
 * the power meter gathering information through the spec system to give an instant percentage to
 * the business leaders and the board on how well the business is tracking"*.
 *
 * One number, on the screen a board looks at. That is the most dangerous kind of number this
 * product can print, so most of this file is about the cases where it must REFUSE to print one.
 */

const measure = (text: string, answer: Measure['answer'], over: Partial<Measure> = {}): Measure => ({
  criterionId: `c-${text}`,
  text,
  roleId: 'r1',
  roleTitle: 'Operations Manager',
  answer,
  result: null,
  target: null,
  ...over,
});

/**
 * A business measuring everything, all of it going well.
 *
 * The Snap Score is not in here and cannot be: it is the one slot no business writes down, so it
 * is handed to `powerReading` separately. `GOOD_SNAP` is what a business that closes things out
 * looks like.
 */
const everythingMet = (): Measure[] => FRAMEWORK.map(s => measure(s.name, 'Y'));
const GOOD_SNAP = { pct: 88, early: false };

describe('the framework itself', () => {
  it('IS TWENTY-FIVE MEASURES: five heavy hitters and twenty others', () => {
    expect(HEAVY_SLOTS).toBe(5);
    expect(SHARED_SLOTS).toBe(20);
    expect(FRAMEWORK).toHaveLength(25);
  });

  /*
    The weighting IS the opinion this meter exists to express. Five times fifteen, plus
    twenty-five shared, is a hundred — and a business with immaculate debtor days and an injured
    apprentice must not be able to average its way to a good reading.
  */
  it('AND THE FIVE CARRY THREE QUARTERS OF IT', () => {
    expect(HEAVY_SLOTS * HEAVY_POINTS + SHARED_POINTS).toBe(100);
    expect(HEAVY_SLOTS * HEAVY_POINTS).toBe(75);
  });

  it('every slot belongs to one of the four pillars and has a way of being recognised', () => {
    for (const slot of FRAMEWORK) {
      expect(PILLARS, `${slot.id} has no pillar`).toContain(slot.pillar);
      expect(slot.matches, `${slot.id} has no matcher`).toBeInstanceOf(RegExp);
      expect(slot.name.length).toBeGreaterThan(2);
    }
  });

  it('and no two slots share an id, which would silently drop one', () => {
    expect(new Set(FRAMEWORK.map(s => s.id)).size).toBe(FRAMEWORK.length);
  });
});

describe('matching a business’s own words to the framework', () => {
  /*
    A business writes its KPIs in its own language. "Gross profit margin at or above target", "GP%
    holding on solar" and "Gross margin" are the same measure, and the framework has one slot for
    all three.
  */
  const slotFor = (id: string): Slot => FRAMEWORK.find(s => s.id === id)!;

  it('RECOGNISES THE SAME MEASURE WRITTEN THREE DIFFERENT WAYS', () => {
    for (const text of ['Gross profit margin at or above target', 'GP% holding on solar', 'Gross margin 40%']) {
      expect(readSlot(slotFor('gross_profit'), [measure(text, 'Y')]).state, text).toBe('met');
    }
  });

  it('and does not confuse net profit with gross profit, which is the whole argument', () => {
    expect(readSlot(slotFor('gross_profit'), [measure('Net profit margin above 8%', 'Y')]).state)
      .toBe('not_measured');
    expect(readSlot(slotFor('net_margin'), [measure('Net profit margin above 8%', 'Y')]).state)
      .toBe('met');
  });

  it('nor leaving with people leaving, which are different early warnings', () => {
    expect(readSlot(slotFor('turnover'), [measure('Absenteeism under 3%', 'Y')]).state).toBe('not_measured');
    expect(readSlot(slotFor('absenteeism'), [measure('Absenteeism under 3%', 'Y')]).state).toBe('met');
  });

  /*
    One miss is a miss.

    Averaging the measures behind a slot would let a business with four tidy safety KPIs and one
    injury report a met safety slot — which is exactly the arithmetic that makes an aggregate worth
    arguing with rather than acting on.
  */
  it('AND ONE MISS BEHIND A SLOT MAKES THE SLOT A MISS', () => {
    const reading = readSlot(slotFor('safety_incident'), [
      measure('Safety incidents: zero', 'Y'),
      measure('Reportable incident on site', 'N'),
      measure('Incident actions closed', 'Y'),
    ]);
    expect(reading.state).toBe('not_met');
    expect(reading.from).toHaveLength(3);
  });

  /*
    NA — watch, pending, not tracked — is the ABSENCE of an answer, the same as it is everywhere
    else in SPEC. A slot fed only by unmarked measures is unmeasured, never a quiet pass.
  */
  it('AND AN UNMARKED MEASURE NEVER COUNTS AS A PASS', () => {
    expect(readSlot(slotFor('cash_flow'), [measure('Cash flow positive', 'NA')]).state).toBe('not_measured');
    expect(readSlot(slotFor('cash_flow'), [measure('Cash flow positive', '')]).state).toBe('not_measured');
  });

  /*
    ── Found by pointing a browser at JBI's real data, not by thinking about it ────────────────

    "Weekly gross profit report delivered on time with a proposed improvement" was matched as the
    GROSS PROFIT MARGIN — a heavy hitter worth fifteen points — because it contains the words gross
    profit. It is a real and useful KPI about a reporting habit and it says nothing whatever about
    the margin. The meter read 71% partly on the strength of a report being late.

    This is the precise failure the whole file is built to avoid, and it survived every check here
    until the thing was drawn on a real business.
  */
  it('AND A KPI ABOUT DELIVERING A REPORT IS NOT A MEASURE OF THE THING IT REPORTS', () => {
    const paperwork = measure('Weekly gross profit report delivered on time with a proposed improvement', 'N');
    expect(readSlot(slotFor('gross_profit'), [paperwork]).state).toBe('not_measured');
    expect(readSlot(slotFor('gross_profit'), [measure('Gross profit margin at target', 'N')]).state).toBe('not_met');
  });

  it('and the same rule does not swallow an ordinary measure that happens to say "on time"', () => {
    expect(readSlot(slotFor('safety_actions'), [measure('Safety actions closed on time', 'Y')]).state).toBe('met');
    expect(readSlot(slotFor('corrective'), [measure('Corrective actions closed on time', 'Y')]).state).toBe('met');
  });

  /*
    The same KPI usually sits on several roles — four supervisors all measured on "Zero incidents
    (LTI / MTI)". Listing it four times makes the row unreadable and says nothing extra; the COUNT
    is the part worth keeping, because it is how much of the business stands behind that slot.
  */
  it('AND A MEASURE ON FOUR ROLES IS SAID ONCE, WITH THE FOUR', () => {
    const roles = ['r1', 'r2', 'r3', 'r4'].map(roleId =>
      measure('Zero incidents (LTI / MTI)', 'Y', { roleId, criterionId: `c-${roleId}` }));
    const reading = readSlot(slotFor('safety_incident'), roles);
    expect(reading.from).toHaveLength(4);
    expect(sourcesOf(reading)).toEqual([{ text: 'Zero incidents (LTI / MTI)', roles: 4 }]);
  });

  it('and the measures that fed a slot come back with it, so a wrong match can be seen', () => {
    const reading = readSlot(slotFor('debtor_days'), [measure('Invoices over 90 days', 'N', { roleTitle: 'Office Manager' })]);
    expect(reading.from[0].roleTitle).toBe('Office Manager');
    expect(reading.from[0].text).toBe('Invoices over 90 days');
  });
});

/**
 * ── JBI's own words, verbatim ───────────────────────────────────────────────────────────────────
 *
 * Every string below is a real KPI from Kris's business, copied out of the database. It is the
 * fixture that matters, because the framework's words are nobody's words: the matching was written
 * against "Gross profit margin" and "Staff turnover", and JBI writes "Zero negative turnover" and
 * "Adherence to contractual work obligations".
 *
 * Two of the five HEAVY HITTERS were being missed on his own business — turnover and contractual
 * breach, thirty of the hundred points — and nothing in this file could see it, because every
 * fixture in it was written by me from the framework's side.
 */
const JBI_KPIS = [
  'Zero incidents (LTI / MTI)',
  'Zero workers compensation claims',
  'Gross profit margin at target',
  'Weekly gross profit report delivered on time with a proposed improvement',
  'Zero negative turnover',
  'Zero negative turnover across the business',
  'A culture nobody wants to leave — zero regretted departures',
  'Adherence to contractual work obligations',
  'Zero breaches (licensing, procedures, golden rules)',
  'Monthly revenue at or above target',
  'Controllable cash net profit at or above target',
  'Debtor days within target',
  'Billable utilisation above target',
  'Team trained, confident and capable for their tasks',
  'Supervisor development pathway fulfilled',
  'Client net promoter score at or above target',
  'Quote-to-win conversion ratio at target (segmented by sector once data allows)',
  'Department 100% staffed (hires or AI-covered roles)',
  'Job notes and timesheets complete same day',
];

describe('against the words a real business actually uses', () => {
  const met = (texts: readonly string[]) => powerReading(texts.map(t => measure(t, 'Y')), GOOD_SNAP);

  it('FINDS ALL FIVE HEAVY HITTERS IN JBI’S OWN KPIS', () => {
    const reading = met(JBI_KPIS);
    const missed = reading.heavy.filter(h => h.state === 'not_measured').map(h => h.slot.name);
    expect(missed, `SPEC cannot see these in JBI's own words: ${missed.join(', ')}`).toEqual([]);
  });

  /*
    Named one at a time, because a count passing tells you nothing about WHICH one broke when
    somebody edits a matcher later.
  */
  it('and reads "Zero negative turnover" as the turnover heavy hitter', () => {
    expect(readSlot(FRAMEWORK.find(s => s.id === 'turnover')!, [measure('Zero negative turnover', 'Y')]).state).toBe('met');
    expect(readSlot(FRAMEWORK.find(s => s.id === 'turnover')!,
      [measure('A culture nobody wants to leave — zero regretted departures', 'Y')]).state).toBe('met');
  });

  it('and "Adherence to contractual work obligations" as the contract heavy hitter', () => {
    expect(readSlot(FRAMEWORK.find(s => s.id === 'contract_breach')!,
      [measure('Adherence to contractual work obligations', 'Y')]).state).toBe('met');
  });

  it('and picks up the smaller ones it has slots for', () => {
    const reading = met(JBI_KPIS);
    const seen = (id: string) => reading.shared.find(r => r.slot.id === id)!.state;
    expect(seen('revenue_budget'), 'Monthly revenue at or above target').toBe('met');
    expect(seen('training_done'), 'Team trained, confident and capable').toBe('met');
    expect(seen('dev_plans'), 'Supervisor development pathway fulfilled').toBe('met');
    expect(seen('regulatory'), 'Zero breaches (licensing, procedures, golden rules)').toBe('met');
    expect(seen('debtor_days')).toBe('met');
    expect(seen('productivity'), 'Billable utilisation above target').toBe('met');
    expect(seen('net_margin'), 'Controllable cash net profit').toBe('met');
  });

  /*
    And it still refuses what it should. A business whose KPIs SPEC cannot place does not get a
    generous reading — widening the matchers must never turn into matching everything.
  */
  it('AND STILL SEES NOTHING IN THE ONES IT HAS NO SLOT FOR', () => {
    // No Snap Score handed in either, so this really is only the text matching being asked.
    const reading = powerReading([
      'Client net promoter score at or above target',
      'Quote-to-win conversion ratio at target (segmented by sector once data allows)',
      'Department 100% staffed (hires or AI-covered roles)',
      'Job notes and timesheets complete same day',
    ].map(t => measure(t, 'Y')));
    expect(reading.measured).toBe(0);
    expect(reading.score).toBeNull();
  });

  it('and gives JBI a real reading rather than a shrug', () => {
    const reading = met(JBI_KPIS);
    expect(reading.score).toBe(100);
    expect(reading.measured).toBeGreaterThanOrEqual(12);
  });
});

describe('the reading', () => {
  it('IS 100 WHEN EVERYTHING MEASURED WENT WELL', () => {
    const reading = powerReading(everythingMet(), GOOD_SNAP);
    expect(reading.score).toBe(100);
    expect(reading.band).toBe('green');
    expect(reading.measured).toBe(25);
  });

  /*
    The reading is out of WHAT IS MEASURED, never out of twenty-four. A business with no TRIFR
    criterion is not failing TRIFR — SPEC simply cannot see it, and counting an absence as a miss
    would make the meter a punishment for not having bought more software.
  */
  it('AND IS SCORED OUT OF WHAT IT CAN SEE, NOT OUT OF TWENTY-FIVE', () => {
    const half = FRAMEWORK.slice(0, 12).map(s => measure(s.name, 'Y'));
    const reading = powerReading(half);
    expect(reading.score).toBe(100);
    expect(reading.measured).toBe(12);
    expect(coverageLine(reading)).toContain('12 of the 25');
  });

  it('and one heavy hitter missed costs fifteen of the hundred', () => {
    const all = everythingMet();
    const withMiss = all.map(m => (m.text === 'Gross profit margin' ? { ...m, answer: 'N' as const } : m));
    expect(powerReading(withMiss, GOOD_SNAP).score).toBe(85);
  });

  it('and one of the nineteen costs a point and a third', () => {
    const all = everythingMet();
    const withMiss = all.map(m => (m.text === 'Debtor days' ? { ...m, answer: 'N' as const } : m));
    // 25 - 25/20 = 23.75 of 100 → 99 once rounded. A small measure moves the number a small amount.
    expect(powerReading(withMiss, GOOD_SNAP).score).toBe(99);
  });

  it('and the bands are the design’s: green from 85, amber from 60', () => {
    expect(bandOf(100)).toBe('green');
    expect(bandOf(85)).toBe('green');
    expect(bandOf(84)).toBe('amber');
    expect(bandOf(60)).toBe('amber');
    expect(bandOf(59)).toBe('red');
    expect(bandOf(null)).toBe('unknown');
  });
});

describe('the twenty-fifth measure — the Snap Score', () => {
  /*
    Kris, 19 September: *"snap score can be added to the Virtual GM power meter and be the 25th
    data point"*.

    Every other slot is matched against a KPI somebody wrote down. This one is computed from the
    improvement register — how much of what the business finds it actually closes out. It is the
    only measure here that no business has to remember to create.
  */
  const snapSlot = () => FRAMEWORK.find(s => s.id === 'snap_score')!;

  it('IS ONE OF THE TWENTY SHARING THE 25, NOT A SIXTH HEAVY HITTER', () => {
    expect(snapSlot().weight).toBe('shared');
    expect(FRAMEWORK.filter(s => s.weight === 'heavy')).toHaveLength(5);
  });

  /*
    Seventy-five is the product's OWN green line for the Snap Score, the one the register's pill
    has always used. A different number here would give a business two official opinions about the
    same score on two screens, and the argument would be about SPEC rather than about the business.
  */
  it('IS MET AT THE PRODUCT’S OWN GREEN LINE, NOT A NEW ONE', () => {
    expect(SNAP_MET_AT).toBe(75);
    expect(readSnapSlot({ pct: 75, early: false }).state).toBe('met');
    expect(readSnapSlot({ pct: 74, early: false }).state).toBe('not_met');
    expect(readSnapSlot({ pct: 97, early: false }).state).toBe('met');
  });

  /*
    Three problems is not a pattern. A business that has only just started logging them has not
    failed at closing things out — it has nothing to close yet, which is not the same thing and
    must not cost it points.
  */
  it('AND A REGISTER TOO YOUNG TO READ IS NOT A FAILURE', () => {
    expect(readSnapSlot({ pct: null, early: true }).state).toBe('not_measured');
    expect(readSnapSlot(null).state).toBe('not_measured');
    expect(readSnapSlot(undefined).state).toBe('not_measured');
  });

  /*
    It has no criterion behind it, so it cannot list one — and a row with no provenance at all is
    the one thing this list refuses to draw. Every other row says where it came from; the one that
    did not would be the one nobody could argue with.
  */
  it('AND STILL SAYS WHERE IT CAME FROM', () => {
    expect(readSnapSlot({ pct: 88, early: false }).note).toContain('improvement register');
    expect(readSnapSlot({ pct: 88, early: false }).note).toContain('88');
    expect(readSnapSlot({ pct: null, early: true }).note).toContain('too few problems logged');
    const page = readFileSync('src/components/power-meter.tsx', 'utf8');
    expect(page).toContain('reading.note');
  });

  /*
    The guard that stops a business feeding this slot by naming a KPI after it. Every other slot is
    matched on text; this one must never be, or "Snap Score at target" on somebody's scorecard
    would quietly overwrite the computed reading with an opinion.
  */
  it('AND CANNOT BE FED BY A KPI THAT SIMPLY NAMES IT', () => {
    const reading = powerReading([
      measure('Snap Score at or above target', 'Y'),
      measure('Problems closed out (Snap Score)', 'Y'),
      measure('Improvement register kept up to date', 'Y'),
    ], null);
    const snap = reading.shared.find(r => r.slot.id === 'snap_score')!;
    expect(snap.state).toBe('not_measured');
    expect(snap.from).toEqual([]);
  });

  it('and it moves the reading like any other of the twenty', () => {
    const all = everythingMet();
    const good = powerReading(all, { pct: 90, early: false });
    const bad = powerReading(all, { pct: 40, early: false });
    expect(good.score).toBe(100);
    // One of twenty sharing 25 points is 1.25 of 100 — small, and real.
    expect(bad.score).toBe(99);
    expect(good.measured).toBe(25);
    expect(bad.measured).toBe(25);
  });

  it('and names itself when it is the thing that slipped', () => {
    const reading = powerReading(everythingMet(), { pct: 40, early: false });
    const snap = reading.shared.find(r => r.slot.id === 'snap_score')!;
    expect(snap.cause).toContain('Snap Score 40');
    /*
      But it is never the headline cause. That line is reserved for the five heavy hitters: fifteen
      points is the largest single move the reading can make, and naming a measure worth 1.25 as
      the reason would be true and useless.
    */
    expect(reading.cause).toBeNull();
  });
});

describe('when it refuses to put a number up', () => {
  /*
    The check this whole file exists for.

    A business with one matched KPI that went well reads 100% — arithmetically true, completely
    wrong, and on the screen a board looks at. Kris's brief: "if it spins, errors, or shows an
    unrecognised number, the anticipation inverts into broken trust — worse than never promising
    it." So below a floor there is no number at all.
  */
  it('WILL NOT REPORT 100% OFF A SINGLE KPI', () => {
    const reading = powerReading([measure('Safety incidents: zero', 'Y')]);
    expect(reading.score).toBeNull();
    expect(reading.band).toBe('unknown');
    expect(reading.verdict).toContain('Not enough is being measured');
  });

  /*
    And the second half of the floor. Seventy-five points of this reading live in the five heavy
    hitters, so a meter built only from the other nineteen is measuring a quarter of itself and
    calling it the business.
  */
  it('NOR A NUMBER BUILT ENTIRELY FROM THE SMALL MEASURES', () => {
    /*
      Named one by one rather than "the first ten shared slots", which is how this test was first
      written and was wrong about its own premise: "Lost time injuries" also answers the heavy
      safety-incident slot, so the reading had a heavy hitter in it and correctly produced a number.
      The CODE was right and the fixture was not — which is worth keeping, because a lost-time
      injury really is a safety incident and the overlap is a feature.
    */
    const noHeavy = ['absenteeism', 'training_done', 'engagement', 'dev_plans', 'budget_miss',
      'revenue_budget', 'net_margin', 'cash_flow', 'revenue_growth', 'debtor_days']
      .map(id => measure(FRAMEWORK.find(s => s.id === id)!.name, 'Y'));
    const reading = powerReading(noHeavy);
    expect(reading.heavyMeasured).toBe(0);
    expect(reading.measured).toBeGreaterThanOrEqual(ENOUGH_SLOTS);
    expect(reading.score).toBeNull();
    expect(coverageLine(reading)).toContain('heavy hitters');
  });

  it('and says so in words rather than showing a zero', () => {
    const nothing = powerReading([]);
    expect(nothing.score).toBeNull();
    expect(nothing.measured).toBe(0);
    expect(coverageLine(nothing)).toContain('no measure yet');
    // A ring stuck at zero and a ring with nothing to say look identical and mean opposite things.
    expect(ringOffset(null)).toBe(264);
    expect(ringOffset(0)).toBe(264);
    expect(ringOffset(100)).toBe(0);
    expect(Math.round(ringOffset(50))).toBe(132);
  });

  it('and the coverage is stated on every reading, not only the bad ones', () => {
    expect(coverageLine(powerReading(everythingMet(), GOOD_SNAP))).toContain('25 of the 25');
  });

  /*
    ── Where the caveat lives, and why it moved ──────────────────────────────────────────────

    It used to be printed inside the pill beside the number. That was mine, not the design's: the
    drawing's pill holds four things — the ring, the label, the percentage and "Hack Your Power" —
    and adding a fifth is what grew a corner instrument into a slab. Kris, 19 September: *"just do
    what the design says and make it perfectly"*.

    So the pill is the design's and the caveat is one click away, in the breakdown the pill opens.
    What must never happen is the caveat disappearing altogether, which is what this now holds.
  */
  it('AND THE COVERAGE IS NEVER MORE THAN ONE CLICK FROM THE NUMBER', () => {
    const page = readFileSync('src/components/power-meter.tsx', 'utf8');
    // The pill is the control that opens the breakdown, so the two are always reachable together.
    expect(page).toContain('data-power-toggle');
    const breakdown = page.slice(page.indexOf('export function PowerBreakdown'));
    expect(breakdown).toContain('coverageLine(reading)');
    expect(breakdown).toContain('data-power-coverage');
  });

  /*
    And the pill stays the four things the design draws. Held here because the temptation to add a
    fifth is exactly what happened the first time.
  */
  it('AND THE PILL STAYS THE FOUR THINGS THE DESIGN DRAWS', () => {
    const page = readFileSync('src/components/power-meter.tsx', 'utf8');
    const pill = page.slice(page.indexOf('const inside = ('), page.indexOf('const shell ='));
    expect(pill).toContain('Virtual GM Power Meter');
    expect(pill).toContain('Hack Your Power');
    expect(pill).toContain('data-power-score');
    // Not the coverage, not a button, not the month. Those belong in the breakdown.
    expect(pill).not.toContain('reading.measured');
    expect(pill).not.toContain('coverageLine');
  });
});

describe('the sentence under the number', () => {
  /*
    Fifteen points is the largest single move this reading can make, so the cause worth naming is
    always a heavy hitter. Naming one of the nineteen would be true and useless.
  */
  it('NAMES A HEAVY HITTER, IN THE BUSINESS’S OWN FIGURES', () => {
    const all = everythingMet().map(m => (m.text === 'Gross profit margin'
      ? { ...m, answer: 'N' as const, result: '33%', target: '40%' }
      : m));
    expect(powerReading(all, GOOD_SNAP).cause).toBe('Gross profit margin — 33% against a target of 40%');
  });

  it('and says what it can when no figure was entered', () => {
    const all = everythingMet().map(m => (m.text === 'Safety incidents' ? { ...m, answer: 'N' as const } : m));
    expect(powerReading(all, GOOD_SNAP).cause).toContain('marked not met this month');
  });

  /*
    A target of ZERO is the normal case here, not the edge: zero incidents, zero claims, zero
    negative turnover. The first wording read "missed against an agreed 0", which is not a sentence
    anybody says, and it was going to be the one this line printed most often.
  */
  it('AND A TARGET OF ZERO STILL READS LIKE ENGLISH', () => {
    const all = everythingMet().map(m => (m.text === 'Negative staff turnover'
      ? { ...m, answer: 'N' as const, target: '0' } : m));
    expect(powerReading(all, GOOD_SNAP).cause).toBe('Negative staff turnover — not met this month, against a target of 0');
  });

  it('and there is no cause when nothing heavy was missed', () => {
    expect(powerReading(everythingMet(), GOOD_SNAP).cause).toBeNull();
  });
});

describe('whose numbers the reading is of', () => {
  it('IS THE BRANCH SOMEBODY CAN ALREADY SEE, AND SAYS SO', () => {
    expect(scopeLabel(true)).toBe('the whole business');
    expect(scopeLabel(false)).toBe('your reporting line');
  });

  /*
    Applied in the QUERY, not in the page. A render that briefly holds numbers somebody may not see
    is one refactor away from showing them, and this reading covers the whole business.
  */
  it('AND SCOPE IS APPLIED WHERE THE DATA IS READ', () => {
    const source = readFileSync('src/lib/power-meter-data.ts', 'utf8');
    expect(source).toContain('input.visible');
    expect(source).toContain('inArray(schema.criteria.roleId, roleIds)');
    expect(source).toContain('inArray(schema.assessments.roleId, roleIds)');
  });

  /*
    KPIs only. A criterion that is not a KPI is a standard the role is held to — including them
    would let a business move this number by adding standards rather than by running better.
  */
  it('and only KPIs feed it, not every standard a role is held to', () => {
    const source = readFileSync('src/lib/power-meter-data.ts', 'utf8');
    expect(source).toContain('eq(schema.criteria.kpi, true)');
    expect(source).toContain('eq(schema.criteria.active, true)');
  });

  /*
    The meter holds no numbers of its own — same rule as a mirror. Change a mark and it changes,
    because there is nowhere for a second copy to go stale.
  */
  it('AND IT KEEPS NO COPY OF ANY NUMBER', () => {
    const source = readFileSync('src/lib/power-meter-data.ts', 'utf8');
    expect(source).not.toMatch(/db\.(insert|update|delete)/);
    expect(source).toContain('schema.assessments');
  });

  /*
    ── The month it reads, which is the fault that made this useless ─────────────────────────

    The first version read whatever the newest period was. On JBI that is the month that opened
    four days ago with NOT ONE MARK IN IT — so the meter said "Not enough to read" on Kris's own
    business, on the day he opened it. Kris: *"fix this problem - it makes this really
    frustrating"*.

    It was not wrong. It was useless, which is worse for a feature whose whole job is to say
    something at a glance. A month is scored at its END, so a meter tied to the open month is blank
    for most of every month and worth looking at for about three days.

    So it walks back to the most recent month anybody marked, stops there, and says which.
  */
  it('READS THE LAST MONTH ANYBODY MARKED, NOT AN OPEN MONTH NOBODY HAS SCORED', () => {
    const source = readFileSync('src/lib/power-meter-data.ts', 'utf8');
    expect(source).toContain('desc(schema.periods.period)');
    // Walks candidates and skips the ones with nothing in them.
    expect(source).toContain('if (!marks.length) continue;');
    // And says which month, because a number with no date on it is an argument waiting to happen.
    expect(source).toContain('period: candidate.period');
    expect(source).toContain('stale:');
    const page = readFileSync('src/components/power-meter.tsx', 'utf8');
    expect(page).toContain('data-power-month');
  });

  /*
    A reading from eighteen months ago is not a power meter, it is an anecdote. Dressing one up as
    the current state of a business is the stale-number fault this product keeps finding.
  */
  it('but never walks back further than a year', () => {
    const source = readFileSync('src/lib/power-meter-data.ts', 'utf8');
    expect(source).toContain('const WINDOW = 12');
    expect(source).toContain('periods.slice(0, WINDOW)');
  });
});
