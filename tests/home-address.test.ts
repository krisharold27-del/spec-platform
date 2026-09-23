import { describe, expect, it } from 'vitest';
import { homeRedirect, HOME_HOST } from '../src/lib/home-address';

describe('one home at www.sitevipapp.com', () => {
  it('moves every old address to the same page on the new home', () => {
    expect(homeRedirect('specbizhq.com', '/pricing')).toBe(`https://${HOME_HOST}/pricing`);
    expect(homeRedirect('www.specbizhq.com', '/')).toBe(`https://${HOME_HOST}/`);
    expect(homeRedirect('app.specbizhq.com', '/my-page', '?x=1')).toBe(`https://${HOME_HOST}/my-page?x=1`);
  });

  it('keeps a sign-in link working after the move', () => {
    expect(homeRedirect('app.specbizhq.com', '/auth/confirm', '?token_hash=abc&type=magiclink'))
      .toBe(`https://${HOME_HOST}/auth/confirm?token_hash=abc&type=magiclink`);
  });

  it('never redirects a machine — a Stripe webhook does not follow redirects', () => {
    expect(homeRedirect('app.specbizhq.com', '/api/stripe/webhook')).toBeNull();
    expect(homeRedirect('specbizhq.com', '/api/ping')).toBeNull();
  });

  it('sends the bare new domain to www', () => {
    expect(homeRedirect('sitevipapp.com', '/jobs')).toBe(`https://${HOME_HOST}/jobs`);
  });

  it('leaves the home itself, previews and this desk alone', () => {
    expect(homeRedirect(HOME_HOST, '/')).toBeNull();
    expect(homeRedirect('spec-platform-two.vercel.app', '/')).toBeNull();
    expect(homeRedirect('localhost:3000', '/')).toBeNull();
    expect(homeRedirect(null, '/')).toBeNull();
  });

  it('is not fooled by a look-alike', () => {
    expect(homeRedirect('evilspecbizhq.com', '/')).toBeNull();
    expect(homeRedirect('specbizhq.com.evil.com', '/')).toBeNull();
  });
});
