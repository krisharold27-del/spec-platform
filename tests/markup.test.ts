import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  MARK_TOOLS, isMarkKind, markLabel, markText, onPlan, cableMetres, maySave,
  savedLine, SAVED_TO, OFFLINE_LINE, type Mark,
} from '../src/lib/markup';

/*
  ── Mark up the plan ─────────────────────────────────────────────────────────────────────────────

  Design 17: *"Tech Day → Mark up the plan: on the phone, add cable runs, moved/added points and
  notes on the drawing; Save as the as-built → job, office copy and certificate. 44px touch
  targets."*

  What normally happens is a photo of a paper plan with biro on it, and somebody in the office tries
  to read it a week later. Recording each mark AS a mark is the difference.
*/

const mark = (over: Partial<Mark> = {}): Mark =>
  ({ kind: 'cable', x: 50, y: 50, what: '', metres: 14, ...over });

describe('the three tools', () => {
  /*
    Three, and a fourth would make this a data-entry screen. A data-entry screen on a phone on a
    site is a screen that gets skipped, which leaves the business with no as-built at all.
  */
  it('IS THREE THINGS A SPARKIE ACTUALLY MARKS, and no more', () => {
    expect(MARK_TOOLS.map(t => t.key)).toEqual(['cable', 'point', 'note']);
    expect(isMarkKind('cable')).toBe(true);
    expect(isMarkKind('dimension')).toBe(false);
    expect(markLabel('point')).toContain('point');
  });

  it('and each says what it is for', () => {
    for (const t of MARK_TOOLS) expect(t.hint.length, t.key).toBeGreaterThan(20);
  });
});

describe('a mark on the plan', () => {
  /* Kept as a fraction of the plan, so it survives any zoom or screen size. */
  it('STAYS INSIDE THE PLAN', () => {
    expect(onPlan({ x: 0, y: 0 })).toBe(true);
    expect(onPlan({ x: 100, y: 100 })).toBe(true);
    expect(onPlan({ x: 140, y: 50 }), 'a mark nobody would ever find again').toBe(false);
    expect(onPlan({ x: -1, y: 50 })).toBe(false);
  });

  /*
    The metres go on the label rather than into a detail view: the whole reason to record a cable
    run is the length, and a length somebody has to tap to see is a length nobody reads.
  */
  it('PUTS THE LENGTH ON THE LABEL, not behind a tap', () => {
    expect(markText(mark({ metres: 14 }))).toBe('Cable run 14m');
    expect(markText(mark({ metres: null }))).toBe('Cable run');
  });

  it('and falls back to something readable when nothing was typed', () => {
    expect(markText(mark({ kind: 'point', what: '' }))).toBe('Point moved');
    expect(markText(mark({ kind: 'note', what: '' }))).toBe('Note');
    expect(markText(mark({ kind: 'note', what: 'Riser blocked' }))).toBe('Riser blocked');
  });

  it('totals the cable, which is what the next estimate is worth', () => {
    expect(cableMetres([mark({ metres: 14 }), mark({ metres: 9 }), mark({ kind: 'note', metres: null })]))
      .toBe(23);
    expect(cableMetres([])).toBe(0);
  });
});

describe('saving it as the as-built', () => {
  /*
    ── An empty as-built is worse than none ─────────────────────────────────────────────────────

    It reads as "somebody checked and there was nothing to mark", which is a statement about the
    installation that nobody actually made.
  */
  it('REFUSES AN EMPTY ONE, and says why', () => {
    const v = maySave([]);
    expect(v.ok).toBe(false);
    expect(v.why).toContain('not the same as nobody checking');
  });

  it('and saves one with anything on it', () => {
    expect(maySave([mark()]).ok).toBe(true);
  });

  /* Said before the button is pressed, so nobody is surprised where it went. */
  it('SAYS WHERE IT GOES — the job, the office copy and the certificate', () => {
    expect(SAVED_TO).toEqual(['The job', 'The office copy', 'The certificate']);
    const line = savedLine([mark({ metres: 14 }), mark({ kind: 'note', metres: null })]);
    expect(line).toContain('2 marks');
    expect(line).toContain('14m of cable');
    expect(line).toContain('certificate');
  });
});

describe('it has to work in a basement', () => {
  /*
    Marking up must never depend on a signal. A screen that fails where the work happens is a screen
    people stop opening — and the screen has to SAY so, or nobody trusts it enough to use it.
  */
  it('KEEPS EVERYTHING ON THE PHONE, and says so', () => {
    expect(OFFLINE_LINE).toContain('no signal');
    const phone = readFileSync('src/components/tech-day-phone.tsx', 'utf8');
    expect(phone).toContain('OFFLINE_LINE');
  });

  /* A thumb on a phone in a switchroom. */
  it('HAS 44px TARGETS on every tool', () => {
    const phone = readFileSync('src/components/tech-day-phone.tsx', 'utf8');
    const panel = phone.slice(phone.indexOf('function MarkUpPanel'));
    expect(panel).toContain('min-h-[44px]');
  });

  /*
    Beside the six steps, not inside them. The order — SWMS, start, photos, materials, sign-off,
    finish — is fixed and tested; marking up happens whenever something is found, which may be three
    times in a morning or not at all. In the sequence it would be a step people skip.
  */
  it('IS NOT ONE OF THE SIX STEPS', () => {
    const steps = readFileSync('src/lib/tech-day.ts', 'utf8');
    const block = steps.slice(steps.indexOf('export const STEPS'), steps.indexOf('] as const', steps.indexOf('export const STEPS')));
    expect(block).not.toMatch(/markup|mark up|as-built/i);
  });
});
