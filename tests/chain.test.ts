import { describe, it, expect } from 'vitest';
import {
  OBLIGATIONS, obligationByKey, isObligation, LINKS, linkByKey,
  linkWatch, isBroken, tellWhom, readChain, brokenChains,
  WHY_ON_THE_CHART, DUTY_RISES,
  type Link,
} from '../src/lib/chain';

const link = (over: Partial<Link> = {}): Link => ({
  obligation: 'heights',
  link: 'supervisor',
  duty: 'Checks the harness and the anchor before anybody goes up.',
  roleId: 'r-sup',
  roleTitle: 'Site Supervisor',
  person: 'Tom Reyes',
  leftAt: null,
  ...over,
});

const heights = (): Link[] => [
  link({ link: 'owner', roleId: 'r-own', roleTitle: 'Director', person: 'Kris Harold', duty: 'Resources it.' }),
  link({ link: 'safety', roleId: 'r-saf', roleTitle: 'Safety Lead', person: 'Amrit Kaur', duty: 'Writes the SWMS.' }),
  link({ link: 'supervisor' }),
  link({ link: 'technician', roleId: 'r-tech', roleTitle: 'Technician', person: 'Hemi Walker', duty: 'Uses it properly.' }),
];

describe('the nine obligations', () => {
  it('is the nine the design names', () => {
    expect(OBLIGATIONS).toHaveLength(9);
    expect(OBLIGATIONS.map(o => o.key)).toEqual([
      'vehicles', 'fatigue', 'heights', 'isolation', 'asbestos',
      'confined', 'subbies', 'inductions', 'psychosocial',
    ]);
  });

  it('says what goes wrong in concrete terms, never "increased risk"', () => {
    for (const o of OBLIGATIONS) {
      expect(o.ifBroken.length, o.key).toBeGreaterThan(40);
      expect(o.ifBroken.toLowerCase(), o.key).not.toContain('increased risk');
    }
  });

  it('looks one up', () => {
    expect(obligationByKey('heights')?.label).toBe('Working at heights');
    expect(isObligation('heights')).toBe(true);
    expect(isObligation('nope')).toBe(false);
  });
});

describe('the links are ordered by position in the duty, not by seniority', () => {
  it('puts the scheduler above the technician', () => {
    /*
      On a fatigue or vehicles duty the person who decided the day is further up the chain than the
      person who drove it, whatever the org chart says about who reports to whom.
    */
    expect(linkByKey('scheduler')!.height).toBeLessThan(linkByKey('technician')!.height);
  });

  it('has the owner at the top and the apprentice at the bottom', () => {
    expect(Math.min(...LINKS.map(l => l.height))).toBe(linkByKey('owner')!.height);
    expect(Math.max(...LINKS.map(l => l.height))).toBe(linkByKey('apprentice')!.height);
  });
});

describe('a link nobody holds', () => {
  it('is held when somebody is in it', () => {
    const w = linkWatch(link());
    expect(w.state).toBe('held');
    expect(isBroken(w.state)).toBe(false);
    expect(w.says).toContain('Tom Reyes');
  });

  it('is vacant when the seat is empty', () => {
    const w = linkWatch(link({ person: null }));
    expect(w.state).toBe('vacant');
    expect(w.says).toContain('seat is empty');
  });

  it('is worse when somebody has LEFT, and says why', () => {
    /*
      The state everybody misses. The work carries on, somebody covers informally, and the first
      time anybody checks is after something has happened.
    */
    const w = linkWatch(link({ person: null, leftAt: '2026-08-01' }));
    expect(w.state).toBe('left');
    expect(w.says).toContain('still thinks it is covered');
  });

  it('is unassigned when no seat carries it at all', () => {
    const w = linkWatch(link({ roleId: null, roleTitle: null, person: null }));
    expect(w.state).toBe('unassigned');
    expect(w.says).toContain('no seat carries it');
  });
});

describe('the duty rises', () => {
  it('tells the next person UP, not down', () => {
    const links = heights().map(l => l.link === 'supervisor' ? { ...l, person: null } : l);
    const reading = readChain(obligationByKey('heights')!, links);
    const broken = reading.broken[0];
    const told = tellWhom(broken, reading.links)!;
    expect(told.link.person).toBe('Amrit Kaur');
    /* Never the technician, who sits below it. */
    expect(told.kind.key).not.toBe('technician');
  });

  it('skips a link above that is itself broken', () => {
    const links = heights().map(l =>
      l.link === 'supervisor' || l.link === 'safety' ? { ...l, person: null } : l);
    const reading = readChain(obligationByKey('heights')!, links);
    const told = tellWhom(reading.broken.find(b => b.kind.key === 'supervisor')!, reading.links)!;
    expect(told.link.person).toBe('Kris Harold');
  });

  it('says so when nobody above is holding it either', () => {
    const links = heights().map(l => ({ ...l, person: null }));
    const reading = readChain(obligationByKey('heights')!, links);
    expect(tellWhom(reading.broken[0], reading.links)).toBeNull();
    expect(reading.forTheMeeting).toContain('nobody above it is holding it either');
  });

  it('says the rule in words', () => {
    expect(DUTY_RISES).toContain('whether they know it or not');
  });
});

describe('reading a whole chain', () => {
  it('lights every seat in it and no others', () => {
    const reading = readChain(obligationByKey('heights')!, heights());
    expect(reading.roleIds).toEqual(['r-own', 'r-saf', 'r-sup', 'r-tech']);
  });

  it('orders the links top to bottom', () => {
    const reading = readChain(obligationByKey('heights')!, heights());
    expect(reading.links.map(l => l.kind.key)).toEqual(['owner', 'safety', 'supervisor', 'technician']);
  });

  it('is quiet when every link is held', () => {
    const reading = readChain(obligationByKey('heights')!, heights());
    expect(reading.broken).toHaveLength(0);
    expect(reading.forTheMeeting).toBeNull();
    expect(reading.says).toContain('every one of them held');
  });

  it('says a duty nobody has mapped is a duty the business cannot show', () => {
    const reading = readChain(obligationByKey('asbestos')!, heights());
    expect(reading.links).toHaveLength(0);
    expect(reading.says).toContain('cannot show');
  });

  it('ignores links belonging to another obligation', () => {
    const mixed = [...heights(), link({ obligation: 'asbestos', link: 'owner' })];
    expect(readChain(obligationByKey('heights')!, mixed).links).toHaveLength(4);
  });
});

describe('what goes on the weekly meeting', () => {
  it('names the duty, the link and who is carrying it meanwhile', () => {
    const links = heights().map(l => l.link === 'supervisor' ? { ...l, person: null } : l);
    const agenda = readChain(obligationByKey('heights')!, links).forTheMeeting!;
    expect(agenda).toContain('Working at heights');
    expect(agenda).toContain('Site supervisor');
    expect(agenda).toContain('Amrit Kaur');
    /* Never a generic item — "review chain of responsibility" gets carried forward for months. */
    expect(agenda).not.toMatch(/^Review/i);
  });

  it('counts the rest rather than listing them all', () => {
    const links = heights().map(l =>
      l.link === 'supervisor' || l.link === 'technician' ? { ...l, person: null } : l);
    expect(readChain(obligationByKey('heights')!, links).forTheMeeting).toContain('1 more link');
  });
});

describe('what a leader opens the chart to find', () => {
  it('puts the worst-broken duty first', () => {
    const links = [
      ...heights().map(l => l.link === 'supervisor' ? { ...l, person: null } : l),
      link({ obligation: 'fatigue', link: 'scheduler', roleId: 'r-sch', roleTitle: 'Scheduler', person: null }),
      link({ obligation: 'fatigue', link: 'supervisor', person: null }),
    ];
    const found = brokenChains(links);
    expect(found[0].obligation.key).toBe('fatigue');
  });

  it('counts a duty nobody has mapped as needing attention', () => {
    const found = brokenChains(heights());
    /* Eight obligations with nothing mapped, and heights fully held. */
    expect(found.map(f => f.obligation.key)).not.toContain('heights');
    expect(found).toHaveLength(OBLIGATIONS.length - 1);
  });

  it('explains why this lives on the chart', () => {
    expect(WHY_ON_THE_CHART).toContain('looks exactly like a full register');
  });
});
