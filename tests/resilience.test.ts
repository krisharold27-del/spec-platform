import { describe, it, expect, afterEach } from 'vitest';

/**
 * The properties that keep the site up when something else is down.
 *
 * Every one of these was a real outage or a real broken build on 11 September. They are cheap to
 * reintroduce — a `!` on an environment variable, a `throw` at the top of a module — and expensive
 * to notice, because the damage shows up in an environment nobody is looking at, as a 500 on a page
 * that has nothing to do with the setting that is missing.
 */

const ORIGINAL = { ...process.env };
afterEach(() => { process.env = { ...ORIGINAL }; });

describe('the database handle', () => {
  /**
   * The one that took the production build down. Almost every module imports `db`; when this file
   * threw at module load, one missing setting stopped Next.js collecting page data for an API route
   * and the whole build failed — and at runtime it killed every page, including the marketing ones
   * that never touch a database.
   */
  it('does not throw on import when DATABASE_URL is missing', async () => {
    delete process.env.DATABASE_URL;
    const mod = await import('../src/db');
    expect(mod.db).toBeDefined();
    expect(mod.schema).toBeDefined();
  });

  // It must still fail — just at the point of use, where the caller can handle it, rather than
  // taking down everything that merely imports it.
  it('fails on the first query instead, with a message that says what to do', async () => {
    delete process.env.DATABASE_URL;
    const { db } = await import('../src/db');
    expect(() => (db as unknown as Record<string, unknown>).select)
      .toThrow(/DATABASE_URL is not set/);
  });
});

describe('the Supabase server client', () => {
  /**
   * The `!` assertions here threw "Your project's URL and Key are required" from deep inside a page
   * render, which surfaced as a 500 on every protected page. Returning null instead makes the
   * compiler force every caller to decide what the absence means — and the honest answer for a read
   * is "nobody is signed in", which sends the visitor to /signin rather than to an error page.
   */
  it('returns null rather than throwing when it is not configured', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const { createClient } = await import('../src/lib/supabase/server');
    await expect(createClient()).resolves.toBeNull();
  });

  it('is null when only one of the two settings is present', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const { createClient } = await import('../src/lib/supabase/server');
    await expect(createClient()).resolves.toBeNull();
  });
});

describe('the source, read as text', () => {
  /**
   * Belt and braces, and deliberately crude. These are one-character regressions — a `!` put back
   * on an environment variable reads as tidying up, passes review, and takes the site down the next
   * time a setting is rotated. Reading the file is the only check that catches it before a deploy.
   */
  const read = async (p: string) =>
    (await import('node:fs')).readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

  it('never asserts an environment variable is present with a bang', async () => {
    for (const file of ['src/lib/supabase/server.ts', 'src/lib/supabase/middleware.ts', 'src/db/index.ts']) {
      expect(await read(file)).not.toMatch(/process\.env\.[A-Z0-9_]+!/);
    }
  });

  it('keeps the request-path middleware unable to throw', async () => {
    const src = await read('src/lib/supabase/middleware.ts');
    expect(src).toContain('try {');
    expect(src).toContain('catch');
  });

  // A helper that brings the database forward must never stop the release it was written to help.
  it('keeps the deploy migration unable to fail a build', async () => {
    expect(await read('scripts/deploy-migrate.ts')).not.toContain('process.exit(1)');
  });
});
