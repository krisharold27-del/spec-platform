import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  FRAMEWORK, HEAVY_SLOTS, SHARED_SLOTS, HEAVY_POINTS, SHARED_POINTS, ENOUGH_SLOTS,
  powerReading, readSlot, bandOf, ringOffset, coverageLine, scopeLabel, sourcesOf,
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

/** A business measuring everything, all of it going well. */
const everythingMet = (): Measure[] => FRAMEWORK.map(s => measure(s.name, 'Y'));

describe('the framework itself', () => {
  it('IS TWENTY-FOUR MEASURES: five heavy hitters and nineteen others', () => {
    expect(HEAVY_SLOTS).toBe(5);
    expect(SHARED_SLOTS).toBe(19);
    expect(FRAMEWORK).toHaveLength(24);
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

describe('the reading', () => {
  it('IS 100 WHEN EVERYTHING MEASURED WENT WELL', () => {
    const reading = powerReading(everythingMet());
    expect(reading.score).toBe(100);
    expect(reading.band).toBe('green');
    expect(reading.measured).toBe(24);
  });

  /*
    The reading is out of WHAT IS MEASURED, never out of twenty-four. A business with no TRIFR
    criterion is not failing TRIFR — SPEC simply cannot see it, and counting an absence as a miss
    would make the meter a punishment for not having bought more software.
  */
  it('AND IS SCORED OUT OF WHAT IT CAN SEE, NOT OUT OF TWENTY-FOUR', () => {
    const half = FRAMEWORK.slice(0, 12).map(s => measure(s.name, 'Y'));
    const reading = powerReading(half);
    expect(reading.score).toBe(100);
    expect(reading.measured).toBe(12);
    expect(coverageLine(reading)).toContain('12 of the 24');
  });

  it('and one heavy hitter missed costs fifteen of the hundred', () => {
    const all = everythingMet();
    const withMiss = all.map(m => (m.text === 'Gross profit margin' ? { ...m, answer: 'N' as const } : m));
    expect(powerReading(withMiss).score).toBe(85);
  });

  it('and one of the nineteen costs a point and a third', () => {
    const all = everythingMet();
    const withMiss = all.map(m => (m.text === 'Debtor days' ? { ...m, answer: 'N' as const } : m));
    // 25 - 25/19 = 23.68 of 100 → 99 once rounded. A small measure moves the number a small amount.
    expect(powerReading(withMiss).score).toBe(99);
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
    expect(coverageLine(powerReading(everythingMet()))).toContain('24 of the 24');
  });

  /*
    And beside the NUMBER, not only inside the breakdown.

    Drawn on JBI's real data this read 100% from eight of the twenty-four — every one of the eight
    genuinely met, and a board member who never opened the breakdown would have walked away
    believing the business was perfect on all of it. The headline is what gets remembered, so the
    headline carries the caveat.
  */
  it('AND THE HEADLINE CARRIES ITS OWN CAVEAT', () => {
    const page = readFileSync('src/components/power-meter.tsx', 'utf8');
    const header = page.slice(page.indexOf('data-power-score'), page.indexOf('Hack Your Power'));
    expect(header).toContain('reading.measured');
    expect(header).toContain('reading.total');
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
    expect(powerReading(all).cause).toBe('Gross profit margin — 33% against an agreed 40%');
  });

  it('and says what it can when no figure was entered', () => {
    const all = everythingMet().map(m => (m.text === 'Safety incidents' ? { ...m, answer: 'N' as const } : m));
    expect(powerReading(all).cause).toContain('marked not met this month');
  });

  it('and there is no cause when nothing heavy was missed', () => {
    expect(powerReading(everythingMet()).cause).toBeNull();
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
    expect(source).toContain('input.periodId');
  });
});
