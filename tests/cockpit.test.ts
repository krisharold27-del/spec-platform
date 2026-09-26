import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import {
  pctLabel, seatProgress, money, health, SCALE_CHECKS, CHANNELS, CHANNEL_TOTAL,
  PHASES, SOFTWARE_TARGET,
} from '../src/lib/cockpit';
import { summarise } from '../src/lib/uptime';

/** Nothing measured yet — the state a fresh deployment is in. */
const NOTHING_MEASURED = summarise([]);

/** A day of healthy checks, five minutes apart. */
const MEASURED = summarise(
  Array.from({ length: 12 }, (_, i) => ({
    at: new Date(Date.now() - (11 - i) * 5 * 60_000).toISOString(),
    ok: true,
    ms: 120,
  })),
);

describe('running SPEC Business Solutions', () => {
  /*
    The rule the whole page rests on. A system-health panel showing plausible invented numbers is
    worse than no panel, and this project has already paid for that lesson twice.
  */
  it('never invents a figure it does not measure', () => {
    const rows = health({ tenants: 1, seats: 40, consultingClients: 1 }, NOTHING_MEASURED);
    for (const r of rows) {
      if (r.kind === 'unmeasured') expect(r.value, r.label).toBeNull();
      else expect(r.value, r.label).not.toBeNull();
    }
  });

  /*
    A fresh deployment with no schedule attached yet must say so, not show a perfect score off no
    samples. This is the state every new environment starts in.
  */
  it('says nothing has been measured rather than showing a flattering blank', () => {
    const unmeasured = health({ tenants: 1, seats: 40, consultingClients: 1 }, NOTHING_MEASURED)
      .filter(r => r.kind === 'unmeasured');
    expect(unmeasured.length).toBe(2);
    expect(unmeasured.map(r => r.note).join(' ')).toMatch(/Nothing measured yet|nothing to time/);
    for (const r of unmeasured) expect(r.value).toBeNull();
  });

  it('reports uptime and response time once checks have actually run', () => {
    const rows = health({ tenants: 1, seats: 40, consultingClients: 1 }, MEASURED);
    const answered = rows.find(r => r.label === 'Answered when asked')!;
    const speed = rows.find(r => r.label === 'Response time')!;
    expect(answered.kind).toBe('measured');
    expect(answered.value).toBe('100.00%');
    expect(answered.note).toMatch(/12 of 12 checks answered/);
    expect(speed.value).toBe('120ms');
  });

  it('counts what it genuinely can', () => {
    const rows = health({ tenants: 3, seats: 112, consultingClients: 1 }, MEASURED);
    expect(rows.find(r => r.label === 'Businesses on SPEC')).toMatchObject({ value: '3', kind: 'measured' });
    expect(rows.find(r => r.label === 'Seats that bill')).toMatchObject({ value: '112', kind: 'measured' });
  });

  /*
    40 of 20,000 is 0.2%. Rounding that to something that looks like progress is how a founder ends
    up believing a number that is not true — which is the failure SPEC sells against.
  */
  it('does not flatter a small number into looking bigger', () => {
    expect(pctLabel(40, 20_000)).toBe('0.2%');
    expect(pctLabel(0, 20_000)).toBe('0%');
    expect(pctLabel(2000, 20_000)).toBe('10%');
    expect(seatProgress(40)).toBeCloseTo(0.2, 5);
  });

  it('never reports more than complete', () => {
    expect(seatProgress(30_000)).toBe(100);
    expect(pctLabel(30_000, 20_000)).toBe('150%'); // the label states the truth; the bar is what clamps
  });

  it('handles a target of nothing without dividing by zero', () => {
    expect(pctLabel(5, 0)).toBe('—');
  });

  it('writes money the same way the rest of SPEC does', () => {
    expect(money(1_234_567)).toBe('$1,234,567');
    expect(money(0)).toBe('$0');
  });

  /*
    A readiness list where everything is green is a readiness list nobody wrote honestly.
  */
  it('admits what has not been done', () => {
    const undone = SCALE_CHECKS.filter(c => !c.done);
    expect(undone.length).toBeGreaterThan(0);
    /*
      The backup is still the honest gap, and it is the one that cannot be closed by writing code:
      a backup nobody has restored is a belief, and the only way to stop it being one is to restore
      it once, on purpose.

      Load-testing used to be pinned here too. It was closed by actually running one at twenty
      thousand seats — which found three tables where reading one business meant reading all of
      them — so this now pins the RULE rather than that item: something on this list must still be
      red, and the item may only turn green by being done.
    */
    expect(undone.map(c => c.label).join(' ')).toMatch(/backup/i);
  });

  it('never calls something done without saying how it was proven', () => {
    for (const c of SCALE_CHECKS.filter(c => c.done)) {
      expect(c.evidence, `${c.label} is marked done`).not.toMatch(/never run|not yet|todo|belief/i);
      expect(c.evidence.length, `${c.label} needs real evidence`).toBeGreaterThan(40);
    }
  });

  it('backs every claim with something checkable', () => {
    for (const c of SCALE_CHECKS) {
      expect(c.evidence.length, c.label).toBeGreaterThan(20);
    }
  });

  it('keeps the channel mix as a shape, not a forecast that adds to the target', () => {
    expect(CHANNEL_TOTAL).toBeLessThan(SOFTWARE_TARGET.seats);
    expect(CHANNELS.length).toBe(5);
    // Three of the five carry the volume and are referral-based — that is the argument of the chart.
    const referral = CHANNELS.filter(c => /referral|word-of-mouth|Divisional/.test(c.label));
    expect(referral).toHaveLength(3);
    expect(referral.reduce((t, c) => t + c.seats, 0)).toBeGreaterThan(CHANNEL_TOTAL / 2);
  });

  it('has a road with three phases, in order', () => {
    expect(PHASES.map(p => p.tone)).toEqual(['early', 'building', 'compounding']);
  });
});

describe('the scale checklist has to be true, not just written', () => {
  /*
    ── The cockpit was quoting numbers from a fortnight ago ──────────────────────────────────────

    `SCALE_CHECKS` is what Kris reads to answer his own two standing questions: *"we need to scale
    to 20,000 seats"* and *"make it stable - it must never be down"*. On 18 September it said
    **"647 tests"** when there were 1,181, **"four customer journeys"** when there were fifteen, and
    **"24 of 24 tables"** under row-level security when there were 33.

    Every one of those was true when it was written. None had been true for a week. It is the same
    failure `tests/readiness.test.ts` was written to catch in the readiness document — a claim
    nobody checks quietly stops being true — and it had simply never been pointed at the one screen
    where the founder goes to find out whether his own product is ready.

    Only the counts are held here. The judgement about what is risky is prose, and prose is exactly
    what a person should be writing.
  */
  const evidence = SCALE_CHECKS.map(c => c.evidence).join(' ');

  it('NEVER CLAIMS MORE TESTS THAN EXIST, AND NEVER GOES STALE', () => {
    /*
      This used to demand the exact figure, which meant every commit that added a test failed the
      build until somebody hand-edited a number in product copy — three times in one afternoon on
      26 September. A check that fails on every commit for a reason nobody cares about is a check
      that gets rubber-stamped, and a rubber-stamped check is worse than no check at all.

      So the cockpit states a floor — "2,900+ tests" — and this holds both ends of it. The claim can
      never be larger than the truth, which is the thing that actually mattered. And it can never
      sit more than a hundred behind it, so "2,900+" cannot still be there at four thousand:
      technically true, quietly useless, which is the exact failure this file was written to catch.
    */
    const files = readdirSync('tests').filter(f => f.endsWith('.ts'));
    const blocks = files
      .map(f => readFileSync(`tests/${f}`, 'utf8').match(/^\s*(it|test)(\.[a-z]+)?\(/gm)?.length ?? 0)
      .reduce((a, b) => a + b, 0);

    const quoted = evidence.match(/([\d,]+)\+ tests/);
    expect(quoted, 'the cockpit no longer states a test count at all — it should read like "2,900+ tests"').toBeTruthy();
    const claimed = Number(quoted![1].replace(/,/g, ''));

    expect(claimed, `the cockpit claims ${claimed} tests; there are only ${blocks}`).toBeLessThanOrEqual(blocks);
    expect(blocks - claimed, `there are ${blocks} tests but the cockpit still says ${claimed}+ — round it up`).toBeLessThan(100);
  });

  it('QUOTES THE REAL NUMBER OF BROWSER JOURNEYS', () => {
    const journeys = readdirSync('scripts').filter(f => /-journey\.m[jt]s$/.test(f));
    const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
      'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen',
      'eighteen', 'nineteen', 'twenty'];
    const said = words[journeys.length] ?? String(journeys.length);
    expect(evidence, `there are ${journeys.length} journeys; the cockpit says otherwise`)
      .toContain(`${said} customer journeys`);
  });

  it('QUOTES THE REAL NUMBER OF TABLES UNDER ROW-LEVEL SECURITY', () => {
    /*
      Counted from the schema, never from the database. Asking a database about its own shape tells
      you about the machine you happen to be pointed at — and local dev, CI and production are three
      different machines. The schema is the thing that ships.
    */
    const schema = readFileSync('src/db/schema.ts', 'utf8');
    const rls = (schema.match(/\.enableRLS\(\)/g) ?? []).length;
    expect(rls).toBeGreaterThan(20);
    expect(evidence, `${rls} tables enable RLS; the cockpit says otherwise`).toContain(`${rls} of ${rls} tables`);
  });
});
