import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  CONNECTABLE, REPLACES, READS_ONLY, replacesIt, freshness, canStandAlone, STALE_HOURS,
} from '../src/lib/connected-data';

/*
  ── Can a business leave the system it came from? ────────────────────────────────────────────────

  Kris: "can the job management system be set up that another system can be connected and the data
  feeds into it and then IF the business chooses to turn off simPRO for example it continues without
  any issues".

  Yes — and only because of one rule:

      A connector WRITES INTO SPEC's own tables. No screen ever reads from the other system live.

  Broken once, the promise is gone: that screen goes blank the day the other system is switched off,
  and a business that finds one blank screen cannot trust there are not five more. The screen that
  reads live looks identical to the one that does not, right up until the day it matters — which is
  exactly why this is a test and not a paragraph in a design document.
*/

/** Every page and component a customer can actually load. */
function screens(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(tsx)$/.test(entry)) out.push(full);
    }
  };
  walk('src/app');
  walk('src/components');
  return out;
}

/**
 * The modules that talk to somebody else's system over the network.
 *
 * Named rather than pattern-matched, so adding a connector is a deliberate act that includes adding
 * it here — a new `simpro-net.ts` that nobody listed would slip past a clever regex.
 */
const NETWORK_MODULES = ['xero-net'];

describe('SPEC keeps working when the other system is turned off', () => {
  it('there are screens to check', () => {
    expect(screens().length).toBeGreaterThan(20);
  });

  /*
    ── The rule ─────────────────────────────────────────────────────────────────────────────────

    No page or component may import a connector's network module. A connector runs on a schedule or
    a webhook and writes rows; it never renders. If this ever fails, the named file is the one that
    will go blank when a customer switches simPRO off.
  */
  it('NO SCREEN READS FROM A SYSTEM SPEC REPLACES, at render time', () => {
    const offenders: string[] = [];
    for (const file of screens()) {
      /*
        The Connections screen itself is the exception, and only it: its whole job is to show
        whether a connection is alive, which it cannot do without touching the connector. It never
        renders a customer's business data from the other system.
      */
      if (file.startsWith(join('src', 'app', 'connections'))) continue;
      const src = readFileSync(file, 'utf8');
      for (const mod of NETWORK_MODULES) {
        if (new RegExp(`from ['"][^'"]*${mod}['"]`).test(src)) offenders.push(`${file} imports ${mod}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  /*
    ── The one SPEC does not replace ────────────────────────────────────────────────────────────

    Kris: "xero is the financial system and stays — i dont want to make a financial system — YET".
    So `financials` is deliberately NOT in the list of things SPEC takes over, and reading the
    ledger live is correct there. A second set of books inside SPEC would be a liability, not a
    feature: the accountant, the bank and the tax office all work from the real one.
  */
  it('DOES NOT CLAIM TO REPLACE THE FINANCIAL SYSTEM', () => {
    expect(REPLACES).not.toContain('financials');
    expect(READS_ONLY).toEqual(['financials']);
    expect(replacesIt('job_management')).toBe(true);
    expect(replacesIt('financials')).toBe(false);
  });

  it('and the job system IS one it replaces, which is the whole question', () => {
    expect(REPLACES).toContain('job_management');
  });

  it('AND THE JOBS BOARD READS SPEC’S OWN TABLE', () => {
    const jobs = readFileSync('src/app/jobs/page.tsx', 'utf8');
    expect(jobs).toContain('.from(schema.jobs)');
  });

  it('the rule is written down where somebody adding a connector will read it', () => {
    const src = readFileSync('src/lib/connected-data.ts', 'utf8');
    expect(src).toContain('never in a page render');
    expect(src).toContain('the rows stay');
  });
});

describe('how fresh the numbers are', () => {
  const NOW = new Date('2026-09-24T09:00:00Z');

  it('knows the categories a business can run elsewhere', () => {
    expect(CONNECTABLE).toContain('job_management');
    expect(CONNECTABLE).toContain('financials');
  });

  it('says so plainly when a feed is current', () => {
    const f = freshness({ status: 'live', name: 'simPRO', category: 'job_management', lastSyncAt: '2026-09-24T07:00:00Z' }, NOW);
    expect(f.state).toBe('live');
    expect(f.says).toContain('up to date');
  });

  /*
    Data that has stopped being updated is not the same as data that is wrong, and a business
    mid-changeover needs to be told which it is looking at. A number with no date quietly becomes a
    lie.
  */
  it('DISTINGUISHES STALE FROM WRONG, and dates it', () => {
    const f = freshness({ status: 'live', name: 'simPRO', category: 'job_management', lastSyncAt: '2026-09-01T07:00:00Z' }, NOW);
    expect(f.state).toBe('stale');
    expect(f.says).toContain('2026-09-01');
    expect(f.says).toContain('Still SPEC’s own rows');
    expect(STALE_HOURS).toBe(36);
  });

  /*
    The switched-off case — the one this whole file exists for. The first thing anybody wonders
    when they turn a system off is whether they have just lost everything, so that is what it
    answers first.
  */
  it('SAYS THE WORK IS STILL HERE when the other system is switched off', () => {
    const f = freshness({ status: 'broken', name: 'simPRO', category: 'job_management', lastSyncAt: '2026-09-20T07:00:00Z' }, NOW);
    expect(f.state).toBe('stopped');
    expect(f.says).toContain('stays here');
    expect(f.says).toContain('keeps going on its own');
  });

  /*
    Turning the ledger off genuinely does take the figures away, and saying otherwise would be the
    one dishonest sentence here: a business that acted on it would find its P&L gone.
  */
  it('TELLS THE TRUTH ABOUT THE LEDGER, which is a different truth', () => {
    const f = freshness({ status: 'broken', name: 'Xero', category: 'financials', lastSyncAt: '2026-09-20T07:00:00Z' }, NOW);
    expect(f.state).toBe('stopped');
    expect(f.says).toContain('does not keep its own set of books');
    expect(f.says).not.toContain('keeps going on its own');
  });

  it('and nothing connected is not a fault', () => {
    expect(freshness(null, NOW).state).toBe('never');
    expect(freshness(null, NOW).says).toContain('SPEC’s own numbers');
  });
});

describe('whether they can stand alone yet', () => {
  it('SAYS YES ONCE THE ROWS ARE HERE, and what turning it off does not take away', () => {
    const v = canStandAlone({ jobs: 1240, quotes: 310, timesheets: 9800 });
    expect(v.ok).toBe(true);
    expect(v.says).toContain('SPEC’s own rows');
    expect(v.says).toContain('takes nothing away');
  });

  it('and is honest before anything has come across', () => {
    const v = canStandAlone({ jobs: 0, quotes: 0, timesheets: 0 });
    expect(v.ok).toBe(false);
    expect(v.says).toContain('Let the connection run first');
  });
});
