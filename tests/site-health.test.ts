import { describe, it, expect } from 'vitest';
import { lines, verdict, type HealthFacts } from '../src/lib/site-health';

const healthy: HealthFacts = {
  required: { DATABASE_URL: true, NEXT_PUBLIC_SUPABASE_URL: true, NEXT_PUBLIC_SUPABASE_ANON_KEY: true, APP_URL: true },
  optional: { RESEND_API_KEY: true, ANTHROPIC_API_KEY: true },
  database: { status: 'ok' },
  schema: { status: 'ok' },
  // Asked and answered. Leaving this out is itself a state — "not tested" — covered further down.
  email: { state: 'ok' },
};

const find = (f: HealthFacts, what: string) => lines(f).find(l => l.what === what)!;

describe('is the live site working', () => {
  it('says working when everything is on', () => {
    expect(verdict(lines(healthy))).toBe('working');
    expect(lines(healthy).every(l => l.fix === null)).toBe(true);
  });

  /*
    The rule the whole page turns on. SPEC with no AI key is a complete product — the Basic tier is
    exactly that, deliberately. Calling it broken teaches somebody to ignore a page whose only value
    is that it speaks up when something is actually wrong.
  */
  it('never calls a missing optional extra broken', () => {
    const f = { ...healthy, optional: { RESEND_API_KEY: false, ANTHROPIC_API_KEY: false } };
    expect(verdict(lines(f))).toBe('limited');
    expect(lines(f).some(l => l.severity === 'broken')).toBe(false);
  });

  it('says problems are still logged without the AI key', () => {
    const f = { ...healthy, optional: { ...healthy.optional, ANTHROPIC_API_KEY: false } };
    expect(find(f, 'SPEC reading a problem').says).toMatch(/still logged, ranked and assigned/);
  });

  it('puts signing in first, because it is the failure that costs a customer', () => {
    expect(lines(healthy)[0].what).toBe('People signing in');
  });

  it('calls a sign-in failure broken, whichever half is missing', () => {
    const noAuth = { ...healthy, required: { ...healthy.required, NEXT_PUBLIC_SUPABASE_ANON_KEY: false } };
    expect(find(noAuth, 'People signing in').severity).toBe('broken');
    expect(find(noAuth, 'People signing in').says).toMatch(/Nobody can sign in/);

    const noDb = { ...healthy, database: { status: 'failed', reason: 'The database refused the password in DATABASE_URL.' } };
    expect(find(noDb, 'People signing in').severity).toBe('broken');
    expect(find(noDb, 'People signing in').says).toMatch(/refused the password/);
  });

  it('names the drift when the build expects something the database has not got', () => {
    const f = { ...healthy, schema: { status: 'behind', says: 'users is missing notify_level.' } };
    expect(verdict(lines(f))).toBe('broken');
    const line = find(f, 'The site and the database agreeing');
    expect(line.says).toBe('users is missing notify_level.');
    expect(line.fix).toMatch(/Redeploy/);
  });

  it('does not pretend to have checked the shape when the database was unreachable', () => {
    const f = { ...healthy, database: { status: 'not_configured' }, schema: { status: 'not_checked' } };
    expect(find(f, 'The site and the database agreeing').says).toMatch(/not reachable/);
  });

  it('every fix says where to type it, not just what is missing', () => {
    const f: HealthFacts = {
      required: { DATABASE_URL: false, NEXT_PUBLIC_SUPABASE_URL: false, NEXT_PUBLIC_SUPABASE_ANON_KEY: false, APP_URL: false },
      optional: { RESEND_API_KEY: false, ANTHROPIC_API_KEY: false },
      database: { status: 'not_configured' },
      schema: { status: 'not_checked' },
    };
    for (const l of lines(f)) {
      expect(l.fix, l.what).toBeTruthy();
    }
    // The ones that need a setting typed in say where to type it.
    const withSettings = lines(f).filter(l => /Add [A-Z_]+/.test(l.fix ?? ''));
    expect(withSettings.length).toBeGreaterThan(0);
    for (const l of withSettings) expect(l.fix).toMatch(/Vercel/);
  });

  it('never leaks a value — only whether a setting is there', () => {
    const said = lines(healthy).map(l => `${l.says} ${l.fix ?? ''}`).join(' ');
    expect(said).not.toMatch(/re_[A-Za-z0-9]/);
    expect(said).not.toMatch(/postgres(ql)?:\/\//);
  });
});

/*
  The failure that prompted this: /status said "Working. Invitations can be sent." about a key that
  had been deleted an hour earlier, because it only checked that the SETTING existed.
*/
describe('whether email actually works, rather than whether a key exists', () => {
  const withEmail = (state: string, detail?: string): HealthFacts => ({ ...healthy, email: { state, detail } });
  const emailLine = (f: HealthFacts) => lines(f).find(l => l.what === 'Inviting people by email')!;

  it('never calls a refused key working, and says how to replace it', () => {
    const l = emailLine(withEmail('refused'));
    expect(l.severity).not.toBe('working');
    expect(l.says).toMatch(/refuses it/);
    expect(l.fix).toMatch(/resend\.com/);
  });

  it('catches the one nobody predicts — a good key with no verified sender domain', () => {
    const l = emailLine(withEmail('no_verified_domain', 'specbizhq.com has not been added to Resend at all.'));
    expect(l.severity).not.toBe('working');
    expect(l.says).toMatch(/has not been added to Resend/);
    expect(l.says).toMatch(/would still bounce/);
  });

  it('does not blame SPEC when the email service cannot be reached', () => {
    const l = emailLine(withEmail('unreachable'));
    expect(l.says).toMatch(/does not mean it is broken/);
  });

  it('says it has not been tested rather than claiming it works', () => {
    const notAsked: HealthFacts = { ...healthy };
    delete notAsked.email;
    expect(emailLine(notAsked).says).toMatch(/has not been tested/);
    expect(emailLine(notAsked).severity).not.toBe('working');
  });

  it('only says working when the key was accepted AND the domain is verified', () => {
    const l = emailLine(withEmail('ok'));
    expect(l.severity).toBe('working');
    expect(l.fix).toBeNull();
  });

  /*
    None of these stop anybody using SPEC. A business that never sends an invitation loses nothing,
    so a broken key must not put "Something is wrong" at the top of the page.
  */
  it('never makes an email problem the headline', () => {
    for (const state of ['refused', 'no_verified_domain', 'unreachable', 'no_key']) {
      expect(verdict(lines(withEmail(state))), state).toBe('limited');
    }
  });
});
