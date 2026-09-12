import { describe, it, expect } from 'vitest';
import { lines, verdict, type HealthFacts } from '../src/lib/site-health';

const healthy: HealthFacts = {
  required: { DATABASE_URL: true, NEXT_PUBLIC_SUPABASE_URL: true, NEXT_PUBLIC_SUPABASE_ANON_KEY: true, APP_URL: true },
  optional: { RESEND_API_KEY: true, ANTHROPIC_API_KEY: true },
  database: { status: 'ok' },
  schema: { status: 'ok' },
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
