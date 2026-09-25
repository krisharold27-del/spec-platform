import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ASK, YES, CHECK, gentle, patterns, PATTERN_AT, hoursNudge,
  type GentleKey, type Confirmed,
} from '../src/lib/gentle';

const KEYS: GentleKey[] = ['under_cost', 'hours_mismatch', 'leave_over', 'long_day', 'invoice_differs', 'own_spend', 'deleting'];

describe('the wording is fixed', () => {
  it('asks rather than tells', () => {
    expect(ASK).toBe('Hang on a second, is this correct?');
    expect(YES).toBe("Yes, it's right");
    expect(CHECK).toBe('Let me check');
  });

  it('never says a person is wrong', () => {
    /*
      Kris: "never a red WRONG". Asserted across every prompt rather than trusted, because the
      wording is the feature — a single one drifting into "invalid" undoes the whole idea.
    */
    for (const key of KEYS) {
      const g = gentle(key);
      const text = `${g.ask} ${g.because}`.toLowerCase();
      for (const banned of ['wrong', 'invalid', 'error', 'not allowed', 'illegal', 'must not']) {
        expect(text, `${key} says "${banned}"`).not.toContain(banned);
      }
    }
  });

  it('is the same question in all seven places', () => {
    for (const key of KEYS) expect(gentle(key).ask).toBe(ASK);
  });
});

describe('the reason uses the business’s own facts', () => {
  it('fills them in', () => {
    const g = gentle('under_cost', { price: '$4,200', cost: '$4,900' });
    expect(g.because).toContain('$4,200');
    expect(g.because).toContain('$4,900');
  });

  it('still reads as a sentence with nothing to fill in', () => {
    for (const key of KEYS) {
      const because = gentle(key).because;
      expect(because, key).not.toContain('undefined');
      expect(because, key).not.toContain('null');
      expect(because.length, key).toBeGreaterThan(30);
    }
  });

  it('allows for the answer being yes', () => {
    /* Every one of these fires on things that are genuinely sometimes correct. */
    expect(gentle('long_day', { hours: '14' }).because).toContain('shutdown');
    expect(gentle('under_cost').because).toContain('unless you meant to');
  });
});

describe('what the leader sees afterwards', () => {
  const at = (n: number) => `2026-09-${String(n).padStart(2, '0')}`;
  const made = (key: GentleKey, who: string, n: number): Confirmed =>
    ({ key, who, at: at(n), what: 'x' });

  it('says nothing about a one-off', () => {
    expect(patterns([made('long_day', 'Hemi', 1), made('long_day', 'Hemi', 2)])).toHaveLength(0);
  });

  it('surfaces a pattern', () => {
    const list = [1, 2, 3].map(n => made('long_day', 'Hemi', n));
    const [p] = patterns(list);
    expect(p.times).toBe(PATTERN_AT);
    expect(p.who).toBe('Hemi');
    expect(p.last).toBe(at(3));
    expect(p.says).toContain('fatigue');
  });

  it('keeps people apart', () => {
    const list = [
      ...[1, 2, 3].map(n => made('long_day', 'Hemi', n)),
      ...[1, 2].map(n => made('long_day', 'Tom', n)),
    ];
    expect(patterns(list).map(p => p.who)).toEqual(['Hemi']);
  });

  it('keeps kinds apart', () => {
    const list = [
      ...[1, 2].map(n => made('long_day', 'Hemi', n)),
      ...[3, 4].map(n => made('own_spend', 'Hemi', n)),
    ];
    expect(patterns(list)).toHaveLength(0);
  });

  it('puts the loudest first', () => {
    const list = [
      ...[1, 2, 3].map(n => made('long_day', 'Hemi', n)),
      ...[1, 2, 3, 4, 5].map(n => made('own_spend', 'Tom', n)),
    ];
    expect(patterns(list).map(p => p.who)).toEqual(['Tom', 'Hemi']);
  });
});

describe('the hours nudge', () => {
  it('says how many are left', () => {
    expect(hoursNudge(6, 'J-4402')).toBe('J-4402 has 6 hours left. Finish within 6 if you can.');
  });

  it('handles the singular', () => {
    expect(hoursNudge(1, 'J-4402')).toContain('1 hour left');
  });

  it('does not tell somebody off for running out', () => {
    const line = hoursNudge(0, 'J-4402')!;
    expect(line).toContain('not a problem');
  });

  it('says nothing when the job has no estimate', () => {
    expect(hoursNudge(null, 'J-4402')).toBeNull();
  });
});

describe('gentle prompts never block', () => {
  it('does not import the refusal machinery', () => {
    /*
      The two must not blend. A soft question that sometimes turns out to be a hard block teaches
      people to distrust every soft question.
    */
    const src = readFileSync(join(process.cwd(), 'src/lib/gentle.ts'), 'utf8');
    expect(src).not.toMatch(/from '\.\/refuse'/);
  });
});
