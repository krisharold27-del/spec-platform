import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  fingerprint, cardState, wordsHold, wordsKey, dollars, figuresIn, RECHECK_DAYS,
  type Recommendation, type Answered,
} from '../src/lib/recommends';
import { labourRateAdvice, coveringRate, quarterMargin, roundUpToFive, MIN_MINUTES } from '../src/lib/labour-rate-advice';
import {
  SWITCH_AREAS, areaOf, productReady, relevant, checksFor, confirmed, switchAdvice, switchPlan,
  mayRunSideBySide, mayUseSwitch, mayUndo, stillChecking, switchChoices, parsePrevious, didYouKnow,
  GUARANTEE, SHADOW_LINES, SHADOW_OFFER, DAY_ONE, FRICTION_KINDS, summariseClaims,
  type BusinessCounts, type SwitchRow,
} from '../src/lib/switch';
import { ADMIN_DEPARTMENT, ANGUS_SHIELD } from '../src/lib/virtual-gm-overview';
import { VIRTUAL_GM } from '../src/lib/virtual-gm';
import { defaultChoices } from '../src/lib/coverage';

const routeExists = (href: string) =>
  existsSync(join('src/app', href.split('?')[0].split('#')[0].replace(/^\//, ''), 'page.tsx'));

const RATE = { id: 'r1', name: 'Standard', costCents: 5500, chargeCents: 9500 };
const HOURS = (total: number, billable: number) => ({ total: total * 60, billable: billable * 60 });

const FULL: BusinessCounts = {
  staff: 14, staffWithStart: 14, staffWithContact: 14, staffInducted: 14, customers: 40, catalogue: 120,
  jobs: 30, timesheets30: 200, timesheetsApproved30: 180, payRunsSent: 4, ledgerLinked: true,
};
const EMPTY: BusinessCounts = {
  staff: 0, staffWithStart: 0, staffWithContact: 0, staffInducted: 0, customers: 0, catalogue: 0,
  jobs: 0, timesheets30: 0, timesheetsApproved30: 0, payRunsSent: 0, ledgerLinked: false,
};

describe('Claude recommends — the engine', () => {
  const rec = labourRateAdvice({ rate: RATE, minutes: HOURS(400, 300), jobs: [] });

  it('knows a recommendation by what it says to do, not by the counts under it', () => {
    const tomorrow = labourRateAdvice({ rate: RATE, minutes: HOURS(410, 308), jobs: [] });
    expect(rec.kind).toBe('recommend');
    // More timesheets, same rate called for — the same recommendation, so Not yet is not re-asked.
    expect(fingerprint(tomorrow)).toBe(fingerprint(rec));
    const different = labourRateAdvice({ rate: RATE, minutes: HOURS(400, 200), jobs: [] });
    expect(fingerprint(different)).not.toBe(fingerprint(rec));
  });

  it('asks, waits after Not yet, asks again after the wait, and says done after Yes', () => {
    const now = new Date('2026-09-25T00:00:00Z');
    const answered = (answer: Answered['answer'], daysAgo: number, outcome: string | null = null): Answered => ({
      answer, fingerprint: fingerprint(rec), outcome,
      decidedAt: new Date(now.getTime() - daysAgo * 86_400_000).toISOString(),
    });
    expect(cardState(rec, null, now)).toBe('ask');
    expect(cardState(rec, answered('not_yet', 2), now)).toBe('waiting');
    expect(cardState(rec, answered('not_yet', RECHECK_DAYS + 1), now)).toBe('ask');
    expect(cardState(rec, answered('yes', 0, 'done'), now)).toBe('done');
    // A Not yet to a DIFFERENT recommendation does not silence this one.
    expect(cardState(rec, { ...answered('not_yet', 1), fingerprint: 'labour_rate|recommend|other' }, now)).toBe('ask');
  });

  it('never asks on a hold, and shows missing rather than asking when data is short', () => {
    const hold = labourRateAdvice({ rate: { ...RATE, chargeCents: 20000 }, minutes: HOURS(400, 300), jobs: [] });
    expect(cardState(hold, null)).toBe('hold');
    const short = labourRateAdvice({ rate: RATE, minutes: HOURS(5, 5), jobs: [] });
    expect(cardState(short, null)).toBe('missing');
  });

  it('refuses Claude wording that drops or changes a figure, or says coming soon', () => {
    expect(rec.kind === 'recommend' && rec.headline).toContain('$125/hr');
    expect(wordsHold(rec, 'Set your Standard labour rate at $125/hr, because a billable hour really costs you $73.33.')).toBe(true);
    expect(wordsHold(rec, 'Set your labour rate at $120/hr because costs have gone up a fair bit lately.')).toBe(false);
    expect(wordsHold(rec, 'Set your Standard labour rate at $125/hr. More advice coming soon.')).toBe(false);
    expect(wordsHold(rec, 'ok')).toBe(false);
  });

  it('never lets wording call something ready that the check says is not', () => {
    const payroll = switchAdvice(areaOf('payroll')!, null, checksFor(areaOf('payroll')!, FULL));
    expect(payroll.kind).toBe('missing');
    expect(wordsHold(payroll, `You are ready to switch your payroll to ${ANGUS_SHIELD.name} today, go for it now.`)).toBe(false);
  });

  it('keys wording to the exact figures, so old wording never sits beside new numbers', () => {
    const other = labourRateAdvice({ rate: { ...RATE, costCents: 6000 }, minutes: HOURS(400, 300), jobs: [] });
    expect(wordsKey(other)).not.toBe(wordsKey(rec));
    expect(wordsKey(rec)).toBe(wordsKey(labourRateAdvice({ rate: RATE, minutes: HOURS(400, 300), jobs: [] })));
  });

  it('says money the way a person does', () => {
    expect(dollars(12500)).toBe('$125');
    expect(dollars(7333)).toBe('$73.33');
    expect(figuresIn('Set it at $125/hr — 75% billable, 14 staff')).toEqual(['$125', '75%', '14']);
  });
});

describe('Claude recommends — the labour rate', () => {
  it('works the rate out from the business’s own numbers, and shows every one of them', () => {
    const rec = labourRateAdvice({
      rate: RATE, minutes: HOURS(400, 300),
      jobs: [{ valueCents: 100_000, costCents: 70_000 }, { valueCents: 300_000, costCents: 150_000 }],
    });
    // $55 an hour, 75% billable → $73.33 a billable hour → at a 40% margin $122.22 → up to $125.
    expect(rec.kind).toBe('recommend');
    if (rec.kind !== 'recommend') return;
    expect(rec.action).toEqual({ type: 'set_labour_rate', rateId: 'r1', chargeCents: 12500 });
    expect(rec.headline).toBe('Set your Standard labour rate at $125/hr.');
    expect(rec.reason).toContain('only 75% of paid hours are billed');
    expect(rec.reason).toContain('$73.33');
    const values = Object.fromEntries(rec.facts.map(f => [f.label, f.value]));
    expect(values['What an hour costs you']).toBe('$55/hr');
    expect(values['Billable share']).toBe('75%');
    expect(values['You charge now']).toBe('$95/hr');
    expect(values['Your jobs this quarter']).toBe('45% average margin');
  });

  it('never invents a local market rate — it says SPEC does not have one', () => {
    for (const rec of [
      labourRateAdvice({ rate: RATE, minutes: HOURS(400, 300), jobs: [] }),
      labourRateAdvice({ rate: null, minutes: HOURS(0, 0), jobs: [] }),
    ]) {
      const local = rec.facts.find(f => f.label === 'What local trades charge')!;
      expect(local.value).toBe('Not known to SPEC');
      expect(local.note).toContain('no local rate data');
    }
  });

  it('says exactly what is missing instead of guessing', () => {
    const none = labourRateAdvice({ rate: null, minutes: HOURS(12, 10), jobs: [] });
    expect(none.kind).toBe('missing');
    if (none.kind !== 'missing') return;
    expect(none.missing.map(m => m.what).join(' ')).toContain('A labour rate');
    expect(none.missing.map(m => m.what).join(' ')).toContain('(you have 12)');
    expect(none.missing.every(m => m.href && routeExists(m.href))).toBe(true);

    const noBillable = labourRateAdvice({ rate: RATE, minutes: HOURS(100, 0), jobs: [] });
    expect(noBillable.kind).toBe('missing');
    const zeroCost = labourRateAdvice({ rate: { ...RATE, costCents: 0 }, minutes: HOURS(100, 80), jobs: [] });
    expect(zeroCost.kind).toBe('missing');
    expect(MIN_MINUTES).toBe(2400);
  });

  it('holds when the business already charges enough', () => {
    const rec = labourRateAdvice({ rate: { ...RATE, chargeCents: 12500 }, minutes: HOURS(400, 300), jobs: [] });
    expect(rec.kind).toBe('hold');
    expect(rec.headline).toContain('$125/hr covers');
  });

  it('does the arithmetic in pieces that can each be checked', () => {
    expect(roundUpToFive(12222)).toBe(12500);
    expect(roundUpToFive(12500)).toBe(12500);
    expect(coveringRate(5500, 0.75, 0.4)).toBe(12500);
    expect(coveringRate(5500, 0, 0.4)).toBeNull();
    expect(quarterMargin([])).toBeNull();
    expect(quarterMargin([{ valueCents: 1000, costCents: 0 }])).toBeNull();
  });
});

describe('Switch when ready', () => {
  const payroll = areaOf('payroll')!;
  const accounting = areaOf('accounting')!;
  const people = areaOf('people')!;
  const jobs = areaOf('jobs')!;

  it('changes nothing on day one — no area has a plan until somebody asks', () => {
    for (const a of SWITCH_AREAS) {
      expect(mayUseSwitch(a, null, checksFor(a, FULL))).toBe(false);
      expect(mayUndo(null)).toBe(false);
    }
    expect(DAY_ONE).toContain('Nothing changes');
  });

  it('shows accounting and payroll always, other areas only when the business runs its own', () => {
    const none = { connections: [], choices: defaultChoices() };
    expect(SWITCH_AREAS.filter(a => relevant(a, none)).map(a => a.key)).toEqual(['accounting', 'payroll']);
    expect(relevant(jobs, { connections: [{ category: 'job_management' }], choices: defaultChoices() })).toBe(true);
    expect(relevant(areaOf('safety')!, { connections: [], choices: { ...defaultChoices(), incidents: 'own' } })).toBe(true);
  });

  it('knows what SPEC can run today and what it cannot — from the build, not a flag', () => {
    expect(productReady(payroll)).toBe(ANGUS_SHIELD.switchable);
    expect(productReady(accounting)).toBe(false);
    for (const k of ['jobs', 'crm', 'people', 'safety']) expect(productReady(areaOf(k)!), k).toBe(true);
  });

  it('payroll names the three things SPEC does not hold, and never says it checks out', () => {
    const checks = checksFor(payroll, FULL);
    const missingIds = checks.filter(c => !c.met).map(c => c.id);
    expect(missingIds).toEqual(['rates', 'cycles', 'balances']);
    const rec = switchAdvice(payroll, null, checks);
    expect(rec.kind).toBe('missing');
    expect(rec.headline).toBe(`We’ll tell you when ${ANGUS_SHIELD.name} is ready to run your payroll processing.`);
    if (rec.kind !== 'missing') return;
    expect(rec.missing.map(m => m.what).join(' ')).toMatch(/pay rate.*pay cycles.*leave balances/is);
    expect(rec.interest?.yes).toBe('I want this');
  });

  it('says what the business can do now apart from what Angus Shield is still getting ready — the latter in ONE line', () => {
    const short = { ...FULL, staffWithStart: 3, timesheets30: 0, timesheetsApproved30: 0, payRunsSent: 0 };
    const rec = switchAdvice(payroll, null, checksFor(payroll, short));
    expect(rec.kind).toBe('missing');
    if (rec.kind !== 'missing') return;
    const yours = rec.missing.filter(m => m.side === 'you');
    const theirs = rec.missing.filter(m => m.side === 'product');
    expect(yours.length).toBe(4);
    expect(yours.every(m => m.href)).toBe(true);
    expect(theirs).toHaveLength(1);
    expect(rec.headline).toBe(`4 things to sort before ${ANGUS_SHIELD.name} can run your payroll processing.`);
    // A product name keeps its capitals mid-sentence.
    for (const m of rec.missing) expect(m.what).not.toMatch(/angus shield/);
  });

  it('folds the list behind Show me, on every screen that draws the card', () => {
    const card = readFileSync('src/components/recommends.tsx', 'utf8');
    expect(card).toContain('Show me');
    expect(card).toMatch(/<details[^>]*data-recommends-missing/);
    expect(card).toContain('You can do now');
  });

  it('offers Shadow for accounting, with Kris’s three lines', () => {
    const rec = switchAdvice(accounting, null, checksFor(accounting, FULL));
    expect(rec.kind === 'missing' && rec.interest?.yes).toBe('I want this — turn on Shadow');
    expect(SHADOW_LINES).toEqual(['No $10k–$15k setup cost.', 'No migration project.', 'Switch when you’re ready.']);
    expect(SHADOW_OFFER).toContain('Nothing in your accounting system changes');
  });

  it('recommends switching an area only when every check against the business’s data is met', () => {
    const ready = switchAdvice(people, null, checksFor(people, FULL));
    expect(ready.kind).toBe('recommend');
    expect(ready.headline).toBe('You’re ready to switch your HR to SPEC.');
    expect(ready.kind === 'recommend' && ready.reason).toContain('all 14 have a start date');

    const short = switchAdvice(people, null, checksFor(people, { ...FULL, staffWithStart: 11 }));
    expect(short.kind).toBe('missing');
    expect(short.kind === 'missing' && short.missing.map(m => m.what).join()).toContain('11 of 14 have a start date');
  });

  it('UNLOCKS THE SWITCH ONLY WHEN THE OWNER SAYS READY AND SPEC HAS CONFIRMED', () => {
    const checks = checksFor(people, FULL);
    const planned: SwitchRow = { state: 'requested', ownerReadyAt: null, switchedAt: null };
    expect(confirmed(people, checks)).toBe(true);
    expect(mayUseSwitch(people, planned, checks)).toBe(false);                               // confirmed, owner not ready
    expect(mayUseSwitch(people, { ...planned, ownerReadyAt: '2026-09-25' }, checks)).toBe(true); // both

    const shortChecks = checksFor(people, { ...FULL, staffWithContact: 13 });
    const ownerReady = { ...planned, ownerReadyAt: '2026-09-25' };
    expect(mayUseSwitch(people, ownerReady, shortChecks)).toBe(false);                       // owner ready, not confirmed
    expect(stillChecking(people, ownerReady, shortChecks)).toEqual(['Everybody has contact details — 13 of 14 have a phone or email']);
  });

  it('keeps Angus Shield locked, and says exactly what is still being checked', () => {
    const row: SwitchRow = { state: 'side_by_side', ownerReadyAt: '2026-09-25', switchedAt: null };
    const checks = checksFor(accounting, FULL);
    expect(mayUseSwitch(accounting, row, checks)).toBe(false);
    const still = stillChecking(accounting, row, checks);
    expect(still[0]).toBe(`${ANGUS_SHIELD.name} isn’t ready to run your accounting yet`);
    expect(still.join(' ')).toContain('reproduces your profit and loss');
  });

  it('runs side by side first where money is at stake', () => {
    const checks = checksFor(jobs, FULL);
    const ready: SwitchRow = { state: 'requested', ownerReadyAt: '2026-09-25', switchedAt: null };
    expect(mayRunSideBySide(jobs, ready)).toBe(true);
    expect(mayUseSwitch(jobs, ready, checks)).toBe(false);
    expect(mayUseSwitch(jobs, { ...ready, state: 'side_by_side' }, checks)).toBe(true);
    expect(mayRunSideBySide(people, ready)).toBe(false);
  });

  it('builds a plan from the business’s own gaps, and works out every step', () => {
    const row: SwitchRow = { state: 'requested', ownerReadyAt: null, switchedAt: null };
    const plan = switchPlan(jobs, row, checksFor(jobs, { ...FULL, catalogue: 0 }));
    const keys = plan.steps.map(s => s.key);
    expect(keys).toEqual(['check:staff', 'check:customers', 'check:catalogue', 'check:jobs', 'side', 'ready', 'switch', 'keep']);
    expect(plan.steps.find(s => s.key === 'check:catalogue')).toMatchObject({ done: false, href: '/jobs?tab=catalogue' });
    expect(plan.done).toBe(3);

    const angus = switchPlan(payroll, row, checksFor(payroll, FULL));
    expect(angus.steps[0]).toMatchObject({ key: 'product', done: false, note: 'We’ll tell you here when it is.' });

    const switched = switchPlan(people, { state: 'spec', ownerReadyAt: '2026-08-01', switchedAt: '2026-08-01T00:00:00Z' }, checksFor(people, FULL), new Date('2026-09-25'));
    expect(switched.done).toBe(switched.steps.length);
  });

  it('undo puts back exactly the Coverage choices the switch replaced', () => {
    const choices = { ...defaultChoices(), incidents: 'own' as const, hazards: 'own' as const, leads: 'own' as const };
    const safety = areaOf('safety')!;
    const { clear, previous } = switchChoices(safety, choices);
    expect(clear.sort()).toEqual(['hazards', 'incidents']);
    expect(parsePrevious(JSON.stringify(previous), safety).sort()).toEqual(['hazards', 'incidents']);
    // A hand-edited or foreign row is dropped rather than restored.
    expect(parsePrevious('{"leads":"own","hazards":"spec","x":"own"}', safety)).toEqual([]);
    expect(parsePrevious('not json', safety)).toEqual([]);
  });

  it('every step and check that sends somebody somewhere sends them to a real screen', () => {
    for (const a of SWITCH_AREAS) {
      for (const c of [...checksFor(a, FULL), ...checksFor(a, EMPTY)]) if (c.href) expect(routeExists(c.href), c.href).toBe(true);
      expect(routeExists(a.home), a.home).toBe(true);
    }
  });

  it('only says SPEC CAN when it can, and never says coming soon anywhere', () => {
    expect(didYouKnow(people)).toBe('Did you know SPEC can run your HR? Switching won’t cause any problems — we check everything first.');
    expect(didYouKnow(payroll)).not.toMatch(/SPEC can run/);
    expect(didYouKnow(payroll)).toContain('is being built to process your pay — tax, super and payslips');
    const src = ['src/lib/switch.ts', 'src/components/recommends.tsx', 'src/app/switch/page.tsx']
      .map(f => readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*(\/\/|\*).*$/gm, '')).join('\n');
    expect(src).not.toMatch(/coming soon/i);
  });

  it('shows the Simple Guarantee, and counts friction without reading anybody’s words', () => {
    expect(GUARANTEE).toBe('The Simple Guarantee: if switching isn’t easy, that month is free.');
    expect(FRICTION_KINDS.length).toBeGreaterThan(2);
    const { claims, kinds } = summariseClaims([
      { tenantId: 'a', month: '2026-09', area: 'payroll', kind: 'unclear', at: '2026-09-02' },
      { tenantId: 'a', month: '2026-09', area: 'payroll', kind: 'too_many_steps', at: '2026-09-05' },
      { tenantId: 'b', month: '2026-09', area: 'jobs', kind: 'unclear', at: '2026-09-03' },
    ]);
    expect(claims.map(c => `${c.tenantId}:${c.at}`)).toEqual(['a:2026-09-05', 'b:2026-09-03']);
    expect(kinds).toEqual({ unclear: 2, too_many_steps: 1 });
    // The operator's screen selects the friction rows without the note column.
    const admin = readFileSync('src/app/admin/page.tsx', 'utf8');
    const query = admin.slice(admin.indexOf('const friction'), admin.indexOf('summariseClaims(friction)'));
    expect(query).toContain('switchFriction');
    expect(query).not.toMatch(/note/);
  });
});

describe('Yes carries out only what was recommended', () => {
  const src = readFileSync('src/app/recommends/actions.ts', 'utf8');

  it('works the recommendation out again on the server and refuses a stale one', () => {
    expect(src).toContain('recommendationFor(user.tenantId, topic, user)');
    expect(src).toMatch(/fingerprint\(rec\) !== shown/);
    expect(src).toContain('logDecision(');
  });

  it('never takes the action from the form', () => {
    expect(src).not.toMatch(/formData\.get\('(action|chargeCents|rateId)'\)/);
  });

  it('only the switch itself needs an administrator, and it re-checks both halves', () => {
    const sw = readFileSync('src/app/switch/actions.ts', 'utf8');
    expect(sw).toContain('canAdminister');
    expect(sw).toMatch(/if \(!mayUseSwitch\(area, reading\.row, reading\.checks\)\)/);
    expect(sw).toContain('Not available yet');
  });
});

describe('Virtual GM + Virtual Admin', () => {
  const page = readFileSync('src/app/virtual-gm/page.tsx', 'utf8');

  it('shows both sides, named plainly', () => {
    expect(page).toContain('title="Virtual GM + Virtual Admin"');
    expect(page).toContain('data-vgm-side="gm"');
    expect(page).toContain('data-vgm-side="admin"');
    expect(page).toContain('Virtual Admin Department');
    expect(VIRTUAL_GM.kicker).toBe('The virtual GM + virtual admin');
    expect(VIRTUAL_GM.both).toContain('SPEC runs both the GM and the admin department, virtually.');
  });

  it('the admin side is the six jobs Kris named, each on a screen that exists', () => {
    expect(ADMIN_DEPARTMENT.map(j => j.key)).toEqual(['payroll', 'invoicing', 'bills', 'compliance', 'hr', 'reporting']);
    for (const j of ADMIN_DEPARTMENT) expect(routeExists(j.href), j.href).toBe(true);
  });

  it('uses the same Claude recommends and Switch when ready cards as everywhere else', () => {
    expect(page).toContain('<Recommends topic="labour_rate"');
    expect(page).toContain("<SwitchCards areas={['payroll']}");
    // The accounting card lives in the financial-system panel, shared with /financials.
    expect(page).toContain('<FinancialSystemPanel');
    expect(readFileSync('src/components/financial-system.tsx', 'utf8')).toContain("<SwitchCards areas={['accounting']}");
  });

  it('and the cards turn up wherever their area does', () => {
    const where: Record<string, string> = {
      'src/app/jobs/page.tsx': 'topic="labour_rate"',
      'src/app/people/page.tsx': "areas={['payroll']}",
      'src/app/safety/page.tsx': "areas={['safety']}",
      'src/app/crm/page.tsx': "areas={['crm']}",
      'src/app/connections/page.tsx': "'accounting', 'payroll'",
    };
    for (const [file, needle] of Object.entries(where)) expect(readFileSync(file, 'utf8'), file).toContain(needle);
  });
});

/** Every page and component, for the checks that hold across the product. */
function screens(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir)) {
      const full = join(dir, e);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx$/.test(e)) out.push(full);
    }
  };
  walk('src/app');
  walk('src/components');
  return out;
}

describe('no API key reaches the browser', () => {
  it('the card that words recommendations is a server component, and Claude is only called from lib', () => {
    const card = readFileSync('src/components/recommends.tsx', 'utf8');
    expect(card).not.toContain("'use client'");
    for (const f of screens()) expect(readFileSync(f, 'utf8'), f).not.toContain('ANTHROPIC_API_KEY');
  });
});
