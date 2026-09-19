import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { kpiStanding, kpiGap, isLive, type MirrorKpi } from '../src/lib/mirror-kpis';

/**
 * One function's body, from its own line to the next export.
 *
 * The first attempt cut at the next `\n}` and stopped inside the function, so three checks failed
 * against code that was right there — a check that is wrong about WHERE to look reports the same
 * red as a missing feature, and sends somebody to fix the wrong thing.
 */
const bodyOf = (source: string, name: string): string => {
  const from = source.indexOf(`export async function ${name}`);
  if (from < 0) return '';
  const rest = source.slice(from + 10);
  const next = rest.indexOf('\nexport ');
  return next < 0 ? rest : rest.slice(0, next);
};

/**
 * ── A mirror that reads the numbers, instead of remembering them ─────────────────────────────────
 *
 * Kris, 19 September: mirrors should work *"same as Artifacts in claude"* — *"live and interactive,
 * not a report"* — and *"helps the staff make good decisions and aligns to key kpi's in the
 * business"*.
 *
 * Every figure on a mirror was JSON stored when somebody made it, under a badge reading **Live**.
 * The badge was true about something else — whether the systems the mirror NAMES are connected —
 * and no number on one had ever been recalculated. The design's own sentence for the screen is
 * "Not a snapshot; it updates as the numbers move".
 *
 * A KPI line is now a POINTER at one of the business's criteria, read again on every open for
 * whichever month is being looked at. These hold the words it says when it gets there, because the
 * most common state a mirror is opened in is the one that is easiest to get wrong.
 */

const line = (over: Partial<MirrorKpi> = {}): MirrorKpi => ({
  criterionId: 'c1',
  roleId: 'r1',
  text: 'Gross profit margin at target',
  pillar: 'earnings',
  roleTitle: 'Operations Manager',
  target: '11.3%',
  status: 'met',
  result: '12.1%',
  ...over,
});

describe('what a live KPI line says', () => {
  it('reports where it stands, in the business’s own word for it', () => {
    expect(kpiStanding(line()).label).toBe('Met');
    expect(kpiStanding(line()).tone).toBe('green');
    expect(kpiStanding(line({ status: 'not_met' })).tone).toBe('red');
  });

  /*
    The state a mirror is most often opened in — somebody looks at this month on the third — and the
    one that would do the most damage read wrongly. An unmarked month is not a failure, and a red
    line for it would have a team arguing about a month nobody has scored yet.
  */
  it('AN UNMARKED MONTH IS NOT A FAILURE', () => {
    const fresh = kpiStanding(line({ status: null, result: null }));
    expect(fresh.label).toBe('Not marked yet');
    expect(fresh.tone).toBe('grey');
  });

  it('and neither is a measure nobody has agreed a target for', () => {
    expect(kpiGap(line({ target: null }))).toBe('No target agreed yet, so there is nothing to be behind.');
  });

  it('puts the figure against the agreed number, which is what the conversation is about', () => {
    expect(kpiGap(line())).toBe('12.1% against an agreed 11.3%.');
  });

  it('and says so plainly when a month was marked with no figure', () => {
    expect(kpiGap(line({ result: null }))).toContain('no figure was entered');
  });

  /*
    A line entered by hand and a line read this morning are different claims, and a mirror is the
    screen a business argues in front of. They must never be indistinguishable.
  */
  it('KNOWS WHICH LINES ARE READ AND WHICH WERE TYPED', () => {
    expect(isLive({ criterionId: 'c1' })).toBe(true);
    expect(isLive({})).toBe(false);
    expect(isLive({ criterionId: null })).toBe(false);
  });
});

describe('the mirror never keeps its own copy of a number', () => {
  /*
    The whole promise, held against the code rather than described in a comment.

    `addKpiToBoard` must store the criterion and its role — never the value. A copied figure is out
    of date the moment the month is scored, and a mirror quoting a stale number at a team is worse
    than one that admits it has none.
  */
  it('STORES THE MEASURE, NOT ITS VALUE', () => {
    const source = readFileSync('src/lib/boards-live-data.ts', 'utf8');
    const body = bodyOf(source, 'addKpiToBoard');
    expect(body).toContain('criterionId: criterion.id');
    expect(body).toContain('roleId: role.id');
    // The value it writes is empty: there is nowhere for a stale number to live.
    expect(body).toMatch(/value: ''/);
  });

  it('and reads them against the period it was given, rather than a fixed one', () => {
    const source = readFileSync('src/lib/boards-live-data.ts', 'utf8');
    const body = bodyOf(source, 'mirrorKpisFor');
    expect(body).toContain('opts.periodId');
    expect(body).toContain('schema.assessments');
  });

  /*
    A mirror is shared. Without this it would be a way to publish somebody else's scorecard into a
    room they never agreed to be in — so the viewer's scope is applied at the READ, not in the page.
  */
  it('AND NEVER SHOWS A MEASURE FROM OUTSIDE THE VIEWER’S PART OF THE CHART', () => {
    const source = readFileSync('src/lib/boards-live-data.ts', 'utf8');
    const body = bodyOf(source, 'mirrorKpisFor');
    expect(body).toContain('opts.visible.has');
    // And it says how many it dropped rather than quietly showing fewer rows to some people.
    expect(body).toContain('hidden');
  });
});
