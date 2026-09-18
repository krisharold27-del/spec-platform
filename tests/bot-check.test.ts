import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  issueFormToken, checkFormToken, honeypotTripped, waitOutMs,
  MIN_FILL_MS, MAX_AGE_MS, WAIT_MARGIN_MS,
} from '../src/lib/bot-check';

const SECRET = 'test-secret';

describe('the signed timestamp on the sign-up form', () => {
  const t0 = 1_789_000_000_000;
  const token = issueFormToken(SECRET, t0);

  it('passes a person who took a few seconds', () => {
    expect(checkFormToken(token, SECRET, t0 + 20_000)).toBe('ok');
  });

  it('stops a script that posts instantly', () => {
    expect(checkFormToken(token, SECRET, t0 + MIN_FILL_MS - 1)).toBe('too_fast');
  });

  it('stops an old form being replayed', () => {
    expect(checkFormToken(token, SECRET, t0 + MAX_AGE_MS + 1)).toBe('expired');
  });

  it('cannot be forged — a changed time or a different secret fails', () => {
    const [, mac] = token.split('.');
    expect(checkFormToken(`${t0 - 60_000}.${mac}`, SECRET, t0 + 20_000)).toBe('invalid');
    expect(checkFormToken(token, 'another-secret', t0 + 20_000)).toBe('invalid');
    expect(checkFormToken('', SECRET)).toBe('invalid');
    expect(checkFormToken('garbage', SECRET)).toBe('invalid');
  });
});

describe('the trap field', () => {
  it('is tripped only when something was typed into it', () => {
    expect(honeypotTripped('https://spam.example')).toBe(true);
    expect(honeypotTripped('')).toBe(false);
    expect(honeypotTripped('  ')).toBe(false);
    expect(honeypotTripped(null)).toBe(false);
  });
});

describe('the held wait always clears the bar', () => {
  /*
    The bug this pins, in full, because it is invisible and it bounced real sign-ups:

    The caller sleeps for exactly `waitOutMs` and then asks `checkFormToken` again. Node's timers
    are allowed to fire a whisker early — libuv rounds to whole milliseconds — so the second question
    was sometimes asked at 2,999ms, came back `too_fast` a second time, and the person was sent back
    to the form reading "This form had been open a while". Nothing had been open a while. They had
    typed quickly, waited three seconds they never noticed, and been told something untrue on the
    first screen of the product.

    Two checks, because one alone would not have caught it: that the wait clears the bar even when
    the timer fires early, and that there is a margin at all.
  */
  it('THE MARGIN EXISTS, and is wide enough for a timer that fires early', () => {
    expect(WAIT_MARGIN_MS).toBeGreaterThanOrEqual(10);
  });

  it('WAITING IT OUT IS OK EVEN IF THE TIMER FIRES A MILLISECOND EARLY', () => {
    const secret = 's';
    for (let filledIn = 0; filledIn < MIN_FILL_MS; filledIn += 37) {
      const issued = 1_700_000_000_000;
      const submitted = issued + filledIn;
      const token = issueFormToken(secret, issued);
      const held = waitOutMs(token, secret, submitted);
      // The sleep lands one millisecond SHORT, which is the case that was failing.
      const asked = submitted + held - 1;
      expect(checkFormToken(token, secret, asked), `filled in after ${filledIn}ms`).toBe('ok');
    }
  });

  it('and a form that is genuinely old is still refused, margin or no margin', () => {
    const secret = 's';
    const issued = 1_700_000_000_000;
    const token = issueFormToken(secret, issued);
    expect(waitOutMs(token, secret, issued + MAX_AGE_MS + 1)).toBe(0);
    expect(checkFormToken(token, secret, issued + MAX_AGE_MS + 1)).toBe('expired');
  });

  it('TOO FAST AND EXPIRED ARE NEVER THE SAME MESSAGE', () => {
    // They were, and that is how a customer got told their form had expired when it had not.
    const page = readFileSync(join(process.cwd(), 'src/app/signup/page.tsx'), 'utf8');
    expect(page).toContain('too_fast:');
    const actions = readFileSync(join(process.cwd(), 'src/app/signup/actions.ts'), 'utf8');
    expect(actions).toContain("back('too_fast')");
  });
});
