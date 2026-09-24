import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  PER_HOURS, RECORDABLE, LOST_TIME, isRecordable, isLostTime, rates, ratesLine,
  injuryAlert, needsClaim, ENOUGH_HOURS, TELL, type Injury,
} from '../src/lib/trifr';

/*
  ── TRIFR, and the alert that goes up the moment somebody is hurt ────────────────────────────────

  Kris: "TRIFR figures easy as the system knows total hours... it needs to be immediate if an injury
  in the workplace — make sure this alerts the business as well as this is a non negotiable breach".

  Most small businesses quote a rate they are not sure of, because the injuries are in one system
  and the hours are in another. SPEC holds both.
*/

const hurt = (severity: string | null, id = 'i1'): Injury => ({ id, severity, at: '2026-09-01' });

describe('which injuries count', () => {
  /*
    A first aid injury — a plaster from the kit — is NOT recordable. Including it would make a
    business's rate look worse than a competitor's who counts correctly.
  */
  it('DOES NOT COUNT A PLASTER FROM THE KIT', () => {
    expect(isRecordable('first_aid')).toBe(false);
    expect(isRecordable('medical')).toBe(true);
    expect(isRecordable('lost_time')).toBe(true);
    expect(isRecordable('serious')).toBe(true);
    expect(RECORDABLE).toHaveLength(3);
  });

  it('and lost time is the narrower one', () => {
    expect(isLostTime('lost_time')).toBe(true);
    expect(isLostTime('serious')).toBe(true);
    expect(isLostTime('medical'), 'treated, but at work the next day').toBe(false);
    expect(LOST_TIME).toHaveLength(2);
  });

  it('an injury nobody has assessed counts as neither', () => {
    expect(isRecordable(null)).toBe(false);
    expect(isLostTime(null)).toBe(false);
  });
});

describe('the rate', () => {
  it('is per million hours, the convention a builder expects', () => {
    expect(PER_HOURS).toBe(1_000_000);
    // 2 recordable in 100,000 hours → 20 per million.
    const r = rates([hurt('medical', 'a'), hurt('lost_time', 'b'), hurt('first_aid', 'c')], 100_000);
    expect(r.recordable).toBe(2);
    expect(r.lostTime).toBe(1);
    expect(r.trifr).toBe(20);
    expect(r.ltifr).toBe(10);
  });

  /*
    Under about five people for a year, one injury produces a rate in the hundreds — which says
    nothing about the business and everything about the small denominator. Publishing it would be
    worse than saying so.
  */
  it('REFUSES TO PUBLISH A RATE FROM TOO FEW HOURS', () => {
    expect(ENOUGH_HOURS).toBe(10_000);
    const r = rates([hurt('medical')], 500);
    expect(r.trifr).toBeNull();
    expect(ratesLine(r)).toContain('Not enough hours yet');
  });

  /* A rate without its hours is a number nobody can check — and for a small business it swings on one event. */
  it('ALWAYS SAYS THE HOURS BESIDE THE RATE', () => {
    const said = ratesLine(rates([hurt('medical')], 80_000));
    expect(said).toContain('TRIFR');
    expect(said).toContain('80,000 hours');
  });

  it('and says when the number is not final', () => {
    const said = ratesLine(rates([hurt('medical'), hurt(null, 'b')], 80_000));
    expect(said).toContain('no severity recorded');
    expect(said).toContain('not final');
  });

  it('is zero, honestly, when nobody has been hurt', () => {
    expect(rates([], 80_000).trifr).toBe(0);
  });
});

describe('the alert — non-negotiable', () => {
  /*
    Kris's word. Not softened by severity: the difference between a plaster and a hospital is very
    often luck, and a business that only hears about the bad ones never hears about the
    near-identical event the week before.
  */
  it('IS RAISED FOR EVERY INJURY, INCLUDING FIRST AID', () => {
    for (const s of ['first_aid', 'medical', 'lost_time', 'serious', null]) {
      const a = injuryAlert(s, false);
      expect(a.says.length, String(s)).toBeGreaterThan(20);
      expect(a.steps.length, String(s)).toBeGreaterThan(2);
    }
  });

  it('and a first aid injury is still recorded as a breach', () => {
    expect(injuryAlert('first_aid', false).says).toContain('breach');
    expect(injuryAlert('first_aid', false).says).toContain('zero');
  });

  /* Severity changes what it SAYS and who acts — never whether it is raised. */
  it('TELLS SOMEBODY NOW when it is serious or notifiable', () => {
    expect(injuryAlert('serious', false).urgency).toBe('now');
    expect(injuryAlert('medical', true).urgency, 'notifiable on its own').toBe('now');
    expect(injuryAlert('lost_time', false).urgency).toBe('now');
    expect(injuryAlert('first_aid', false).urgency).toBe('today');
  });

  it('and a serious one says not to disturb the site', () => {
    const steps = injuryAlert('serious', false).steps.join(' ');
    expect(steps).toContain('stay as it is');
    expect(steps).toContain('regulator');
  });

  /* Steps somebody can actually do — never "investigate". */
  it('GIVES STEPS, NOT INSTRUCTIONS TO INVESTIGATE', () => {
    for (const s of ['first_aid', 'lost_time', 'serious']) {
      for (const step of injuryAlert(s, false).steps) {
        expect(step, s).not.toMatch(/^investigate\.?$/i);
        expect(step.length, s).toBeGreaterThan(15);
      }
    }
  });

  /* A business that can switch off being told about injuries is one where somebody eventually does. */
  it('CANNOT BE SWITCHED OFF', () => {
    const src = readFileSync('src/lib/trifr.ts', 'utf8');
    expect(TELL.length).toBe(2);
    expect(src).toContain('Not a setting');
  });
});

describe('the workers’ compensation side', () => {
  /*
    A business that waits for lost time lodges late — which costs the person money and the business
    its premium. Medical treatment is where a claim usually begins.
  */
  it('STARTS AT MEDICAL TREATMENT, not at lost time', () => {
    expect(needsClaim('first_aid')).toBe(false);
    expect(needsClaim('medical')).toBe(true);
    expect(needsClaim('lost_time')).toBe(true);
  });

  it('and the alert says to start it today rather than when the paperwork surfaces', () => {
    expect(injuryAlert('lost_time', false).steps.join(' ')).toContain('today');
    expect(injuryAlert('serious', false).steps.join(' ')).toContain('today');
  });
});
