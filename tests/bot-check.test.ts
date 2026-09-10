import { describe, it, expect } from 'vitest';
import { issueFormToken, checkFormToken, honeypotTripped, MIN_FILL_MS, MAX_AGE_MS } from '../src/lib/bot-check';

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
