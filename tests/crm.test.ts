import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  DEFAULT_STAGES, DEFAULT_ROT_DAYS, orderStages, parseProbability, parseRotDays,
  LOST_REASONS, lostRefusal, probabilityOf, weightedCents, stageTotals, moveRefusal,
  daysBetween, winRate, forecast, WIN_RATE_DAYS, lastTouch, rotting,
  ACTIVITY_KINDS, isActivityKind, activityLabel, bucketOf, orderActivities, nextActivity, parseDueDate, dueLabel,
  dealFlag, canSeeDeal, ownerOptions, jobFromDeal, search, eventLine, pctLabel,
  type StageDef, type DealLike,
} from '../src/lib/crm';
import { tableShapes } from '../src/lib/schema-sql';
import { CAPABILITIES } from '../src/lib/coverage';
import { allDoors, navDoors, NAV_HREFS } from '../src/lib/doors';

const stages: StageDef[] = DEFAULT_STAGES.map((s, i) => ({ ...s, id: `s${i}` }));
const TODAY = '2026-09-23';

const deal = (over: Partial<DealLike> = {}): DealLike => ({
  id: over.id ?? 'd', stageId: 's0', status: 'open', valueCents: 100_000, closedAt: null, createdAt: '2026-09-01T00:00:00Z', ...over,
});

describe('the stages SPEC proposes for a trade business', () => {
  it('are the five, in order, each with a rising probability', () => {
    expect(DEFAULT_STAGES.map(s => s.name)).toEqual(['Lead in', 'Contacted', 'Site visit booked', 'Quote sent', 'Negotiating']);
    const p = DEFAULT_STAGES.map(s => s.probability);
    expect([...p].sort((a, b) => a - b)).toEqual(p);
    expect(p.every(x => x > 0 && x < 100)).toBe(true);
  });
  it('go quiet after seven days unless the business says otherwise', () => {
    expect(DEFAULT_ROT_DAYS).toBe(7);
    expect(DEFAULT_STAGES.every(s => s.rotDays === 7)).toBe(true);
  });
  it('sort by position, whatever order they were read in', () => {
    expect(orderStages([...stages].reverse()).map(s => s.id)).toEqual(['s0', 's1', 's2', 's3', 's4']);
  });
  it('take a probability as a whole percent from 0 to 100', () => {
    expect(parseProbability('40')).toBe(40);
    expect(parseProbability('40%')).toBe(40);
    expect(parseProbability('0')).toBe(0);
    expect(parseProbability('100')).toBe(100);
    expect(parseProbability('101')).toBeNull();
    expect(parseProbability('-5')).toBeNull();
    expect(parseProbability('4.5')).toBeNull();
    expect(parseProbability('')).toBeNull();
    expect(parseProbability(null)).toBeNull();
  });
  it('take days-before-quiet as 1 to 365', () => {
    expect(parseRotDays('7')).toBe(7);
    expect(parseRotDays('0')).toBeNull();
    expect(parseRotDays('366')).toBeNull();
    expect(parseRotDays('x')).toBeNull();
  });
});

describe('probability and weighting', () => {
  it('is the stage’s while open, certain when won, nothing when lost', () => {
    expect(probabilityOf({ status: 'open', stageId: 's3' }, stages)).toBe(60);
    expect(probabilityOf({ status: 'won', stageId: 's0' }, stages)).toBe(100);
    expect(probabilityOf({ status: 'lost', stageId: 's4' }, stages)).toBe(0);
    expect(probabilityOf({ status: 'open', stageId: 'gone' }, stages)).toBe(0);
  });
  it('weights in whole cents, rounded once', () => {
    expect(weightedCents(100_000, 40)).toBe(40_000);
    expect(weightedCents(333, 33)).toBe(110);
    expect(weightedCents(1000, 150)).toBe(1000);
    expect(weightedCents(1000, -5)).toBe(0);
    expect(Number.isInteger(weightedCents(12_345, 17))).toBe(true);
  });
});

describe('stage totals', () => {
  const deals = [
    deal({ id: 'a', stageId: 's0', valueCents: 10_000 }),
    deal({ id: 'b', stageId: 's0', valueCents: 5_000 }),
    deal({ id: 'c', stageId: 's3', valueCents: 20_000 }),
    deal({ id: 'w', stageId: 's3', valueCents: 99_999, status: 'won', closedAt: TODAY }),
    deal({ id: 'l', stageId: 's0', valueCents: 88_888, status: 'lost', closedAt: TODAY }),
  ];
  const t = stageTotals(stages, deals);
  it('has one column per stage, in order', () => {
    expect(t.map(x => x.stageId)).toEqual(['s0', 's1', 's2', 's3', 's4']);
  });
  it('counts and sums open deals only', () => {
    expect(t[0]).toEqual({ stageId: 's0', count: 2, valueCents: 15_000, weightedCents: 1_500 });
    expect(t[3]).toEqual({ stageId: 's3', count: 1, valueCents: 20_000, weightedCents: 12_000 });
    expect(t[1]).toEqual({ stageId: 's1', count: 0, valueCents: 0, weightedCents: 0 });
  });
});

describe('moving a deal', () => {
  it('moves an open deal to any stage in the pipeline, forwards or back', () => {
    expect(moveRefusal({ status: 'open', stageId: 's3' }, 's1', stages)).toBeNull();
    expect(moveRefusal({ status: 'open', stageId: 's0' }, 's4', stages)).toBeNull();
  });
  it('refuses a closed deal and a stage that is not there', () => {
    expect(moveRefusal({ status: 'won', stageId: 's0' }, 's1', stages)).toMatch(/closed/);
    expect(moveRefusal({ status: 'lost', stageId: 's0' }, 's1', stages)).toMatch(/closed/);
    expect(moveRefusal({ status: 'open', stageId: 's0' }, 'elsewhere', stages)).toMatch(/not in your pipeline/);
  });
});

describe('losing a deal', () => {
  it('asks for a reason from the short list', () => {
    expect(LOST_REASONS).toContain('Price');
    expect(LOST_REASONS.at(-1)).toBe('Other');
    expect(lostRefusal('Price', '')).toBeNull();
    expect(lostRefusal('', '')).toMatch(/why/);
    expect(lostRefusal('Because', 'x')).toMatch(/why/);
  });
  it('and a sentence when the reason is Other', () => {
    expect(lostRefusal('Other', '  ')).toMatch(/few words/);
    expect(lostRefusal('Other', 'Client moved interstate')).toBeNull();
  });
});

describe('the forecast strip — computed, never stored', () => {
  const deals = [
    deal({ id: 'a', stageId: 's0', valueCents: 100_000 }),            // 10%
    deal({ id: 'b', stageId: 's4', valueCents: 50_000 }),             // 80%
    deal({ id: 'w1', status: 'won', valueCents: 30_000, closedAt: '2026-09-05T03:00:00Z' }),
    deal({ id: 'w2', status: 'won', valueCents: 70_000, closedAt: '2026-08-30T03:00:00Z' }),
    deal({ id: 'l1', status: 'lost', valueCents: 10_000, closedAt: '2026-09-10T03:00:00Z' }),
    deal({ id: 'old', status: 'won', valueCents: 1, closedAt: '2026-01-01T00:00:00Z' }),
  ];
  const f = forecast(deals, stages, TODAY);
  it('sums open value and weights it by stage', () => {
    expect(f.openCount).toBe(2);
    expect(f.openCents).toBe(150_000);
    expect(f.weightedCents).toBe(10_000 + 40_000);
  });
  it('counts won this calendar month only', () => {
    expect(f.wonThisMonthCount).toBe(1);
    expect(f.wonThisMonthCents).toBe(30_000);
  });
  it('win rate is won over won-plus-lost, in the window', () => {
    expect(WIN_RATE_DAYS).toBe(90);
    expect(f.closedInWindow).toBe(3);
    expect(f.winRate).toBeCloseTo(2 / 3);
  });
  it('is not measured — null, never zero — when nothing has closed', () => {
    const empty = forecast([deal()], stages, TODAY);
    expect(empty.winRate).toBeNull();
    expect(pctLabel(empty.winRate)).toBe('—');
    expect(forecast([], stages, TODAY)).toEqual({
      openCount: 0, openCents: 0, weightedCents: 0, wonThisMonthCount: 0, wonThisMonthCents: 0, winRate: null, closedInWindow: 0,
    });
  });
  it('ignores a deal dated in the future', () => {
    expect(winRate([deal({ status: 'won', closedAt: '2026-10-01' })], TODAY).closed).toBe(0);
  });
  it('holds no forecast column in the database', () => {
    const cols = tableShapes().filter(t => t.name.startsWith('crm_')).flatMap(t => t.columns.map(c => c.name));
    for (const c of cols) expect(c).not.toMatch(/weighted|forecast|win_rate|probability_cents/);
  });
});

describe('going quiet', () => {
  it('counts whole days', () => {
    expect(daysBetween('2026-09-16T23:59:00Z', TODAY)).toBe(7);
    expect(daysBetween('2026-09-24', TODAY)).toBe(0);
    expect(daysBetween('nonsense', TODAY)).toBe(0);
  });
  it('the last touch is the latest thing that happened — not a promise of something later', () => {
    expect(lastTouch('2026-09-01T00:00:00Z', ['2026-09-10T00:00:00Z', '2026-09-05T00:00:00Z'], [null, '2026-09-12T00:00:00Z']))
      .toBe('2026-09-12T00:00:00Z');
    expect(lastTouch('2026-09-01T00:00:00Z', [], [])).toBe('2026-09-01T00:00:00Z');
  });
  it('flags an open deal untouched for its stage’s limit', () => {
    expect(rotting({ status: 'open', stageId: 's0' }, stages, '2026-09-16', TODAY)).toEqual({ quiet: true, days: 7 });
    expect(rotting({ status: 'open', stageId: 's0' }, stages, '2026-09-17', TODAY)).toEqual({ quiet: false, days: 6 });
  });
  it('reads the limit per stage', () => {
    const fast = stages.map(s => (s.id === 's3' ? { ...s, rotDays: 2 } : s));
    expect(rotting({ status: 'open', stageId: 's3' }, fast, '2026-09-21', TODAY).quiet).toBe(true);
    expect(rotting({ status: 'open', stageId: 's0' }, fast, '2026-09-21', TODAY).quiet).toBe(false);
  });
  it('never flags a closed deal', () => {
    expect(rotting({ status: 'won', stageId: 's0' }, stages, '2026-01-01', TODAY).quiet).toBe(false);
  });
});

describe('activities', () => {
  it('has the five kinds, and an email is a reminder, never something SPEC sends', () => {
    expect(ACTIVITY_KINDS.map(k => k.key)).toEqual(['call', 'meeting', 'site_visit', 'email', 'task']);
    expect(activityLabel('email')).toBe('Email to send');
    expect(isActivityKind('site_visit')).toBe(true);
    expect(isActivityKind('fax')).toBe(false);
    expect(activityLabel('fax')).toBe('Task');
  });
  it('buckets by due date', () => {
    expect(bucketOf('2026-09-22', TODAY)).toBe('overdue');
    expect(bucketOf('2026-09-23', TODAY)).toBe('today');
    expect(bucketOf('2026-09-24', TODAY)).toBe('upcoming');
  });
  const a = (id: string, dueDate: string, doneAt: string | null = null, createdAt = '2026-09-01') => ({ id, dueDate, doneAt, createdAt });
  it('orders overdue first — longest overdue at the top — then today, then soonest', () => {
    const list = [a('up2', '2026-10-02'), a('today', TODAY), a('od1', '2026-09-20'), a('up1', '2026-09-25'), a('od2', '2026-09-01'), a('done', '2026-09-01', '2026-09-02')];
    const o = orderActivities(list, TODAY);
    expect(o.map(x => x.id)).toEqual(['od2', 'od1', 'today', 'up1', 'up2']);
    expect(o.map(x => x.bucket)).toEqual(['overdue', 'overdue', 'today', 'upcoming', 'upcoming']);
  });
  it('breaks a tie on the same day by when it was added', () => {
    const o = orderActivities([a('late', TODAY, null, '2026-09-10'), a('early', TODAY, null, '2026-09-02')], TODAY);
    expect(o.map(x => x.id)).toEqual(['early', 'late']);
  });
  it('the next activity is the earliest one not done', () => {
    expect(nextActivity([a('x', '2026-09-30'), a('y', '2026-09-24'), a('z', '2026-09-01', '2026-09-01')])?.id).toBe('y');
    expect(nextActivity([a('z', '2026-09-01', '2026-09-01')])).toBeNull();
  });
  it('takes a due date only as a real day', () => {
    expect(parseDueDate('2026-09-30')).toBe('2026-09-30');
    expect(parseDueDate('2026-02-30')).toBeNull();
    expect(parseDueDate('30/09/2026')).toBeNull();
    expect(parseDueDate('')).toBeNull();
  });
  it('says when in words', () => {
    expect(dueLabel(TODAY, TODAY)).toBe('Today');
    expect(dueLabel('2026-09-24', TODAY)).toBe('Tomorrow');
    expect(dueLabel('2026-09-22', TODAY)).toBe('1 day overdue');
    expect(dueLabel('2026-09-20', TODAY)).toBe('3 days overdue');
    expect(dueLabel('2026-09-26', TODAY)).toMatch(/26/);
  });
});

describe('the flag on a card', () => {
  const open = { status: 'open', stageId: 's0' };
  it('red only for a missed activity — a broken promise', () => {
    expect(dealFlag(open, stages, { dueDate: '2026-09-20' }, TODAY, TODAY)).toEqual({ text: 'Activity overdue', light: 'red' });
  });
  it('amber, never red, for going quiet', () => {
    const f = dealFlag(open, stages, { dueDate: '2026-09-30' }, '2026-09-01', TODAY);
    expect(f).toEqual({ text: 'Quiet 22 days', light: 'amber' });
  });
  it('grey when nothing is scheduled — nothing promised, nothing broken', () => {
    expect(dealFlag(open, stages, null, TODAY, TODAY)).toEqual({ text: 'Nothing scheduled', light: 'pending' });
  });
  it('nothing at all when the next step is booked and it is recent', () => {
    expect(dealFlag(open, stages, { dueDate: '2026-09-25' }, TODAY, TODAY)).toBeNull();
  });
  it('nothing on a closed deal', () => {
    expect(dealFlag({ status: 'won', stageId: 's0' }, stages, { dueDate: '2026-01-01' }, '2026-01-01', TODAY)).toBeNull();
  });
  it('is never red unless something was due', () => {
    for (const touch of ['2025-01-01', '2026-09-01', TODAY]) {
      for (const next of [null, { dueDate: TODAY }, { dueDate: '2026-12-01' }]) {
        expect(dealFlag(open, stages, next, touch, TODAY)?.light).not.toBe('red');
      }
    }
  });
});

describe('only me and above', () => {
  const visible = new Set(['me', 'below']);
  it('shows a deal owned in my line, and none sideways or above', () => {
    expect(canSeeDeal('me', visible, 'full')).toBe(true);
    expect(canSeeDeal('below', visible, 'readonly')).toBe(true);
    expect(canSeeDeal('sideways', visible, 'full')).toBe(false);
    expect(canSeeDeal('sideways', visible, 'administrator')).toBe(false);
  });
  it('an unowned deal is an administrator’s to place, nobody else’s to read', () => {
    expect(canSeeDeal(null, visible, 'administrator')).toBe(true);
    expect(canSeeDeal(null, visible, 'full')).toBe(false);
  });
  it('offers as owners only people in my line, never an empty role or the board', () => {
    const roles = [
      { id: 'me', title: 'GM', stream: 'operational', holder: { name: 'Pat' }, pencilled: null, members: [] },
      { id: 'below', title: 'Estimator', stream: 'commercial', holder: null, pencilled: 'Alex', members: [] },
      { id: 'empty', title: 'Sales', stream: 'commercial', holder: null, pencilled: null, members: [] },
      { id: 'side', title: 'Other GM', stream: 'operational', holder: { name: 'Zed' }, pencilled: null, members: [] },
      { id: 'board', title: 'Chair', stream: 'board', holder: { name: 'Bo' }, pencilled: null, members: [] },
    ];
    const opts = ownerOptions(roles, new Set(['me', 'below', 'empty', 'board']));
    expect(opts).toEqual([
      { roleId: 'below', name: 'Alex', title: 'Estimator' },
      { roleId: 'me', name: 'Pat', title: 'GM' },
    ]);
  });
});

describe('a won deal becomes a job', () => {
  it('carries the title, the client, the site and the value', () => {
    expect(jobFromDeal({ title: ' Switchboard upgrade ', site: 'Balmain', valueCents: 480_000 }, 'Lee Holdings', 'Sam Lee'))
      .toEqual({ title: 'Switchboard upgrade', client: 'Lee Holdings', site: 'Balmain', valueCents: 480_000 });
  });
  it('falls back to the person when there is no organisation, and never invents a site', () => {
    expect(jobFromDeal({ title: 'Rewire', site: '', valueCents: 0 }, null, 'Sam Lee'))
      .toEqual({ title: 'Rewire', client: 'Sam Lee', site: '', valueCents: 0 });
    expect(jobFromDeal({ title: '', site: '', valueCents: -5 }, '  ', null))
      .toEqual({ title: 'Won deal', client: 'New client', site: '', valueCents: 0 });
  });
  it('goes through the Jobs pipeline’s own creation path, at Won', () => {
    const actions = readFileSync('src/app/crm/actions.ts', 'utf8');
    expect(actions).toContain('createJob(');
    expect(actions).toMatch(/stage: 'won'/);
    const jobs = readFileSync('src/app/jobs/actions.ts', 'utf8');
    expect(jobs, 'a typed enquiry still starts at enquiry, through the same path').toMatch(/createJob\([^)]*stage: 'enquiry'/s);
  });
});

describe('contacts', () => {
  const people = [
    { name: 'Sam Lee', email: 'sam@example.com', org: 'Lee Holdings' },
    { name: 'Jo Park', email: null, org: 'Park Builders' },
  ];
  const f = (p: typeof people[number]) => [p.name, p.email, p.org];
  it('searches every field, every word, any case', () => {
    expect(search(people, 'lee', f).map(p => p.name)).toEqual(['Sam Lee']);
    expect(search(people, 'PARK builders', f).map(p => p.name)).toEqual(['Jo Park']);
    expect(search(people, 'example', f)).toHaveLength(1);
    expect(search(people, 'nobody', f)).toHaveLength(0);
    expect(search(people, '  ', f)).toHaveLength(2);
  });
});

describe('the timeline', () => {
  const e = (kind: string, over: Partial<{ fromStageId: string; toStageId: string; text: string }> = {}) =>
    ({ kind, fromStageId: over.fromStageId ?? null, toStageId: over.toStageId ?? null, text: over.text ?? '', byName: 'Pat', at: TODAY });
  it('says each change in words', () => {
    expect(eventLine(e('created', { toStageId: 's0' }), stages)).toBe('Deal added by Pat, in Lead in');
    expect(eventLine(e('stage', { fromStageId: 's0', toStageId: 's2' }), stages)).toBe('Pat moved it from Lead in to Site visit booked');
    expect(eventLine(e('lost', { text: 'Price' }), stages)).toBe('Lost, marked by Pat — Price');
    expect(eventLine(e('won'), stages)).toBe('Won, marked by Pat');
    expect(eventLine(e('stage', { fromStageId: 'gone', toStageId: 's1' }), stages)).toMatch(/since removed/);
    expect(eventLine(e('note', { text: 'Rang back' }), stages)).toBe('Pat: Rang back');
  });
});

describe('the tables', () => {
  const crm = tableShapes().filter(t => t.name.startsWith('crm_'));
  it('exist, and every one carries its own tenant, indexed', () => {
    expect(crm.map(t => t.name).sort()).toEqual(['crm_activities', 'crm_deal_events', 'crm_deals', 'crm_organisations', 'crm_people', 'crm_stages']);
    for (const t of crm) {
      expect(t.columns.some(c => c.name === 'tenant_id' && c.notNull), t.name).toBe(true);
      expect(t.indexes.some(i => i.columns[0] === 'tenant_id'), t.name).toBe(true);
    }
  });
  it('keep money in whole cents', () => {
    const money = crm.flatMap(t => t.columns).filter(c => /value|amount|price/.test(c.name));
    expect(money.map(c => c.name)).toEqual(['value_cents']);
  });
  it('are named in the policy file', () => {
    const rls = readFileSync('drizzle/0001_rls.sql', 'utf8');
    for (const t of crm) expect(rls).toContain(`'${t.name}'`);
  });
  it('carry no foreign key, like everything that ships', () => {
    const src = readFileSync('src/db/schema.ts', 'utf8');
    const block = src.slice(src.indexOf('/* ══ CRM'));
    expect(block.length).toBeGreaterThan(100);
    expect(block).not.toContain('.references(');
  });
});

describe('where it lives', () => {
  it('is a door under The work, and on the bar right after Financials', () => {
    const door = allDoors({ businesses: 1, runsSpec: false }).find(d => d.href === '/crm');
    expect(door?.label).toBe('CRM');
    expect((NAV_HREFS as readonly string[])).toContain('/crm');
    /* Kris set the order by hand on 26 September: My Page, Mirrors, Jobs, Financials, CRM. CRM is
       still beside the work it belongs to; Financials moved between them at his word. */
    const bar = navDoors({ businesses: 1, runsSpec: false }).map(d => d.href);
    expect(bar.indexOf('/crm')).toBe(bar.indexOf('/financials') + 1);
  });
  it('the coverage map sends "Customers & sites" to the whole client list, which the CRM feeds', () => {
    // Was /crm until 23 September, when /clients became "every client, site, contact and job
    // history in one place" — the capability's own words.
    const cap = CAPABILITIES.find(c => c.connect === 'crm');
    expect(cap?.href).toBe('/clients');
  });
});

describe('generic, never one client, never a vendor', () => {
  function files(dir: string, out: string[] = []): string[] {
    for (const e of readdirSync(dir)) {
      const p = join(dir, e);
      if (statSync(p).isDirectory()) files(p, out); else out.push(p);
    }
    return out;
  }
  const sources = [...files('src/app/crm'), 'src/lib/crm.ts', 'src/lib/crm-data.ts', 'src/components/deal-board.tsx'];
  it('names no CRM product anywhere a customer could read it', () => {
    for (const f of sources) {
      expect(readFileSync(f, 'utf8'), f).not.toMatch(/pipedrive|hubspot|salesforce|zoho|monday\.com/i);
    }
  });
  it('sends nothing — no mail is composed or sent from the CRM', () => {
    for (const f of sources) {
      const text = readFileSync(f, 'utf8');
      expect(text, f).not.toMatch(/from '@\/lib\/email'|from '\.\/email'|resend|mailto:/i);
    }
  });
});
