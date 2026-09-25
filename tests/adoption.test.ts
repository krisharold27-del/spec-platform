import { describe, it, expect } from 'vitest';
import {
  AREAS, areaByKey, tiles, tileFor, runningHere, adoptionLine, needingYou,
  movePlan, NOTHING_NEEDS_YOU,
  type AreaSetting, type Needs,
} from '../src/lib/adoption';

const jbi: AreaSetting[] = [
  { key: 'board', runningHere: true, elsewhere: null, connected: false },
  { key: 'people', runningHere: true, elsewhere: null, connected: false },
  { key: 'compliance', runningHere: true, elsewhere: null, connected: false },
  { key: 'safety', runningHere: false, elsewhere: 'Safety Minder', connected: true },
  { key: 'win', runningHere: false, elsewhere: 'HubSpot', connected: true },
  { key: 'do', runningHere: false, elsewhere: 'Simpro', connected: true },
  { key: 'paid', runningHere: false, elsewhere: 'Simpro', connected: true },
  { key: 'money', runningHere: false, elsewhere: 'Xero', connected: true },
];

describe('the nine areas', () => {
  it('is nine, and covers the whole owner’s job', () => {
    expect(AREAS).toHaveLength(9);
    expect(AREAS.map(a => a.key)).toEqual(
      ['win', 'do', 'paid', 'people', 'pay', 'safety', 'compliance', 'money', 'board']);
  });

  it('looks one up', () => {
    expect(areaByKey('pay')?.label).toBe('Pay');
    expect(areaByKey('nope')).toBeUndefined();
  });
});

describe('Pay is never a staged area', () => {
  /*
    Kris's final word, which overrode an earlier note. Asserted rather than trusted because the
    earlier note is still in the design file and somebody reading it could easily put Pay back.
  */
  it('runs in siteVIP even when nothing says so', () => {
    const t = tileFor(areaByKey('pay')!, undefined, undefined);
    expect(t.runningHere).toBe(true);
  });

  it('runs in siteVIP even when a setting says it does not', () => {
    const t = tileFor(areaByKey('pay')!, { key: 'pay', runningHere: false, elsewhere: 'Xero Payroll', connected: true }, undefined);
    expect(t.runningHere).toBe(true);
    expect(t.elsewhere).toBeNull();
  });

  it('is the only always-on area', () => {
    expect(AREAS.filter(a => a.alwaysHere).map(a => a.key)).toEqual(['pay']);
  });
});

describe('JBI starts at 4 of 9', () => {
  const list = tiles(jbi, []);

  it('counts Board, People, Pay and Compliance', () => {
    expect(runningHere(list)).toBe(4);
    expect(list.filter(t => t.runningHere).map(t => t.area.key).sort())
      .toEqual(['board', 'compliance', 'pay', 'people']);
  });

  it('says so in the header', () => {
    expect(adoptionLine(list)).toContain('4 of 9');
  });
});

describe('an area somewhere else', () => {
  const list = tiles(jbi, []);

  it('is grey, never green or red', () => {
    const simpro = list.find(t => t.area.key === 'do')!;
    expect(simpro.dot).toBe('grey');
    expect(simpro.line).toContain('In Simpro');
  });

  it('still counts towards the Power Meter when it is connected', () => {
    expect(list.find(t => t.area.key === 'do')!.line).toContain('still counts');
  });

  it('says the Power Meter is guesswork when it is not connected', () => {
    const [t] = tiles([{ key: 'do', runningHere: false, elsewhere: 'Simpro', connected: false }], []).filter(x => x.area.key === 'do');
    expect(t.line).toContain('guesswork');
    expect(adoptionLine(tiles([{ key: 'do', runningHere: false, elsewhere: 'Simpro', connected: false }], []))).toContain('not connected');
  });

  it('offers to run it here', () => {
    expect(list.find(t => t.area.key === 'win')!.action).toBe('Run it in siteVIP');
  });
});

describe('Money opens here whatever the ledger is', () => {
  it('opens rather than offering to move', () => {
    const t = tiles(jbi, []).find(x => x.area.key === 'money')!;
    expect(t.action).toBe('Open →');
    expect(t.to).toBe('/money');
  });

  it('is still counted honestly as not running here', () => {
    /* The reviews run here; the ledger does not. Ticking it off would be a con. */
    expect(tiles(jbi, []).find(x => x.area.key === 'money')!.runningHere).toBe(false);
  });
});

describe('one line per tile', () => {
  it('says nothing needs you, out loud', () => {
    const t = tileFor(areaByKey('people')!, { key: 'people', runningHere: true, elsewhere: null, connected: false }, undefined);
    expect(t.line).toBe(NOTHING_NEEDS_YOU);
    expect(t.dot).toBe('green');
  });

  it('carries the one thing when there is one', () => {
    const needs: Needs[] = [{ key: 'people', line: 'Two licences expire this week.', dot: 'amber' }];
    const list = tiles(jbi, needs);
    const t = list.find(x => x.area.key === 'people')!;
    expect(t.line).toBe('Two licences expire this week.');
    expect(t.dot).toBe('amber');
    expect(needingYou(list)).toHaveLength(1);
  });

  it('ignores a need for an area that is not running here', () => {
    const list = tiles(jbi, [{ key: 'do', line: 'Six jobs unscheduled.', dot: 'red' }]);
    expect(list.find(x => x.area.key === 'do')!.dot).toBe('grey');
    expect(needingYou(list)).toHaveLength(0);
  });
});

describe('turning one on', () => {
  it('names what comes across rather than promising a migration', () => {
    const p = movePlan(areaByKey('do')!, 'Simpro');
    expect(p.brings.length).toBeGreaterThan(2);
    expect(p.says).toContain('Simpro');
    expect(p.says).toContain('Nobody re-types');
  });

  it('works for a business coming from nothing', () => {
    expect(movePlan(areaByKey('win')!, null).says).toContain('sets it up in siteVIP');
  });
});
