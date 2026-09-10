import { describe, it, expect } from 'vitest';
import { safeNext, emailOtpType, DEFAULT_AFTER_SIGN_IN } from '../src/lib/auth-redirect';

describe('after sign-in, only ever a page inside SPEC', () => {
  it('keeps an ordinary path', () => {
    expect(safeNext('/journey')).toBe('/journey');
    expect(safeNext('/scorecard/abc?x=1')).toBe('/scorecard/abc?x=1');
  });

  it('refuses anything that would leave the site', () => {
    for (const bad of ['@evil.com', 'https://evil.com', '//evil.com', '/\\evil.com', 'evil.com']) {
      expect(safeNext(bad)).toBe(DEFAULT_AFTER_SIGN_IN);
    }
  });

  it('falls back when there is nothing', () => {
    expect(safeNext(null)).toBe(DEFAULT_AFTER_SIGN_IN);
    expect(safeNext('')).toBe(DEFAULT_AFTER_SIGN_IN);
  });
});

describe('link types', () => {
  it('accepts the types Supabase issues', () => {
    expect(emailOtpType('email')).toBe('email');
    expect(emailOtpType('invite')).toBe('invite');
  });
  it('refuses a hand-edited type', () => {
    expect(emailOtpType('admin')).toBeNull();
    expect(emailOtpType(null)).toBeNull();
  });
});
