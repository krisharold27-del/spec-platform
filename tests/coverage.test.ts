import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  AREAS, AREA_CATEGORY, CAPABILITIES, capabilitiesIn, CONNECTED_LABEL, SYSTEM_NOUN, defaultChoices, choose,
  chooseArea, areaRunner, effectiveChoices, rowsFor, totalsOf, connectedNote, connectionState, connectHref,
  connectLabel, CONNECTION_WORDS, MODULE_TABS, ownLine, SLOT_CAPABILITY, sourceFor, coverageLine,
} from '../src/lib/coverage';
import { FRAMEWORK, sourceLine, withSources, powerReading } from '../src/lib/power-meter';
import { CATEGORIES, COMMON_SYSTEMS } from '../src/lib/systems';

/** The design's own rows: R('key', 'Name', 'what', 'Vendor'). */
const design = readFileSync('designs/SPEC Coverage.dc.html', 'utf8');
const designRows = [...design.matchAll(/R\('([a-z]+)', '([^']+)', '(?:[^'\\]|\\.)*', '([^']*)'\)/g)]
  .map(m => ({ key: m[1], name: m[2].replace(/\\u2019/g, '’'), own: m[3] }));

/*
  One deliberate rename, and only one: the design names a state regulator in a row title. The
  product names the thing — a notifiable event — and leaves the regulator to the business's region.
*/
const RENAMED: Record<string, string> = { 'SafeWork notifiable events': 'Notifiable events' };

describe('the capability map', () => {
  it('is exactly the design’s 38', () => {
    expect(designRows).toHaveLength(38);
    expect(CAPABILITIES).toHaveLength(38);
    expect(CAPABILITIES.map(c => c.key)).toEqual(designRows.map(r => r.key));
    expect(CAPABILITIES.map(c => c.name)).toEqual(designRows.map(r => RENAMED[r.name] ?? r.name));
  });

  it('grouped the design’s way: 17 jobs, 10 HR, 11 safety', () => {
    expect(AREAS.map(a => a.key)).toEqual(['jobs', 'hr', 'safety']);
    expect(capabilitiesIn('jobs')).toHaveLength(17);
    expect(capabilitiesIn('hr')).toHaveLength(10);
    expect(capabilitiesIn('safety')).toHaveLength(11);
    expect(new Set(CAPABILITIES.map(c => c.key)).size).toBe(38);
  });

  /*
    The design offers another system only on the rows where one business happened to run one. Kris,
    23 September: "they can choose to use their own system if they choose and connect it". So every
    row can be handed over: the design's rows keep the kind of system the design names, and every
    other row falls to its area's own kind.
  */
  it('offers the business’s own system on every row — the design’s kind where it names one, the area’s otherwise', () => {
    for (const c of CAPABILITIES) expect(c.connect, c.key).toBeTruthy();
    const named = new Set(designRows.filter(r => r.own).map(r => r.key));
    for (const c of CAPABILITIES.filter(x => !named.has(x.key))) expect(c.connect, c.key).toBe(AREA_CATEGORY[c.area]);
    expect(CAPABILITIES.find(c => c.key === 'customers')!.connect).toBe('crm');
    expect(CAPABILITIES.find(c => c.key === 'payroll')!.connect).toBe('financials');
    expect(AREA_CATEGORY).toEqual({ jobs: 'job_management', hr: 'payroll', safety: 'safety' });
  });

  it('names categories, never vendors', () => {
    const text = JSON.stringify({ AREAS, CAPABILITIES, CONNECTED_LABEL, SYSTEM_NOUN });
    for (const vendor of [...COMMON_SYSTEMS, 'Xero Payroll', 'SafeWork', 'Fair Work']) {
      expect(text.toLowerCase()).not.toContain(vendor.toLowerCase());
    }
    const categories = new Set<string>(CATEGORIES.map(c => c.id));
    for (const c of CAPABILITIES) if (c.connect) expect(categories.has(c.connect)).toBe(true);
  });
});

describe('the switch', () => {
  it('starts every capability in SPEC — nothing is written until somebody changes one', () => {
    const d = defaultChoices();
    expect(Object.keys(d)).toHaveLength(38);
    expect(Object.values(d).every(v => v === 'spec')).toBe(true);
    expect(effectiveChoices([])).toEqual(d);
  });

  it('hands any capability to the business’s own system, and back', () => {
    const c = defaultChoices();
    expect(choose(c, 'incidents', 'own').incidents).toBe('own');
    expect(choose(choose(c, 'quotes', 'own'), 'quotes', 'spec').quotes).toBe('spec');
    expect(choose(c, 'nonsense', 'own')).toBe(c);
    expect(choose(c, 'quotes', 'connected' as never)).toBe(c);
  });

  it('one press sets a whole area, and only that area', () => {
    const jobs = chooseArea(defaultChoices(), 'jobs', 'own');
    expect(capabilitiesIn('jobs').every(c => jobs[c.key] === 'own')).toBe(true);
    expect(capabilitiesIn('hr').every(c => jobs[c.key] === 'spec')).toBe(true);
    expect(areaRunner(jobs, 'jobs')).toBe('own');
    expect(areaRunner(jobs, 'safety')).toBe('spec');
    expect(areaRunner(choose(jobs, 'quotes', 'spec'), 'jobs')).toBe('mixed');
    expect(areaRunner(chooseArea(jobs, 'jobs', 'spec'), 'jobs')).toBe('spec');
    expect(chooseArea(jobs, 'nowhere' as never, 'own')).toBe(jobs);
  });

  it('reads stored rows defensively — anything unrecognised is SPEC', () => {
    expect(effectiveChoices([
      { capability: 'quotes', choice: 'own' },
      { capability: 'incidents', choice: 'spec' },
      { capability: 'x', choice: 'own' },
      { capability: 'jobs', choice: 'connected' },
    ])).toEqual({ ...defaultChoices(), quotes: 'own' });
  });

  it('writes only what differs from SPEC — back to SPEC deletes the row', () => {
    expect(rowsFor(['quotes', 'nope'], 'own')).toEqual({ set: ['quotes'], clear: [] });
    expect(rowsFor(['quotes', 'leads'], 'spec')).toEqual({ set: [], clear: ['quotes', 'leads'] });
  });

  it('totals the way the design does, and never claims anything arrives', () => {
    const none = totalsOf(defaultChoices());
    expect(none).toEqual({
      total: 38, inSpec: 38, connected: 0, systems: [],
      // Counted separately since 24 September — "running here" and "built" are different claims.
      builtHere: 38, partlyHere: 0,
    });
    expect(connectedNote(none)).toBe('Nothing connected. SPEC runs it all');
    const some = totalsOf(choose(chooseArea(defaultChoices(), 'jobs', 'own'), 'customers', 'spec'));
    expect(some.connected).toBe(16);
    expect(some.inSpec).toBe(22);
    expect(connectedNote(some)).toBe('Run in your job system');
    expect(connectedNote(totalsOf(chooseArea(defaultChoices(), 'hr', 'own'))))
      .toBe('Run in your HR system, your accounting system');
  });
});

describe('own system → connect it', () => {
  const conns = [
    { category: 'job_management', status: 'live' },
    { category: 'payroll', status: 'requested' },
    { category: 'safety', status: 'broken' },
  ];

  it('is connected only when a connection of that kind is live', () => {
    expect(connectionState('job_management', conns)).toBe('live');
    expect(connectionState('payroll', conns)).toBe('waiting');
    expect(connectionState('safety', conns)).toBe('waiting');
    expect(connectionState('crm', conns)).toBe('none');
    expect(connectionState('crm', [...conns, { category: 'crm', status: 'requested' }, { category: 'crm', status: 'live' }])).toBe('live');
  });

  it('links straight to the right place on Connections, by what the system is', () => {
    expect(connectHref('job_management')).toBe('/connections?category=job_management#add');
    expect(connectLabel('job_management')).toBe('Connect your job system');
    expect(connectLabel('payroll')).toBe('Connect your HR system');
    expect(connectLabel('financials')).toBe('Connect your accounting system');
    expect(connectLabel('crm')).toBe('Connect your CRM');
    expect(CONNECTION_WORDS.live).toBe('Connected');
  });

  it('never paints not-yet-connected red', () => {
    const map = readFileSync('src/app/coverage/coverage-map.tsx', 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ');
    expect(map).not.toMatch(/\bred\b|text-red|bg-red|pillTone\('red'\)|danger/i);
    expect(map).toContain('connectLabel(category)');
  });
});

describe('the modules respect the choice', () => {
  it('say nothing while everything runs in SPEC', () => {
    const d = defaultChoices();
    for (const m of Object.keys(MODULE_TABS) as (keyof typeof MODULE_TABS)[]) {
      for (const tab of Object.keys(MODULE_TABS[m].tabs)) expect(ownLine(m, tab, d)).toBeNull();
    }
  });

  it('name the whole area when the whole area is handed over', () => {
    const jobs = chooseArea(defaultChoices(), 'jobs', 'own');
    expect(ownLine('jobs', 'quotes', jobs)).toEqual({ text: 'You run jobs in your own job system.', category: 'job_management' });
    expect(ownLine('safety', 'today', chooseArea(defaultChoices(), 'safety', 'own'))!.text).toBe('You run safety in your own safety system.');
    expect(ownLine('people', 'have', chooseArea(defaultChoices(), 'hr', 'own'))!.text).toBe('You run HR in your own HR system.');
  });

  it('name just the tab’s own capabilities when only some are handed over', () => {
    const c = choose(choose(defaultChoices(), 'stock', 'own'), 'po', 'own');
    expect(ownLine('jobs', 'stock', c)!.text).toBe('You run Stock, vans & warehouse and Purchase orders & supplier bills in your own job system.');
    expect(ownLine('jobs', 'quotes', c)).toBeNull();
    expect(ownLine('safety', 'today', choose(defaultChoices(), 'hazards', 'own'))!.text).toContain('Hazards & near misses');
    expect(ownLine('people', 'pay', choose(defaultChoices(), 'payroll', 'own'))).toEqual({
      text: 'You run Payroll export in your own accounting system.', category: 'financials',
    });
  });

  it('the CRM follows Customers & sites, which is part of Jobs', () => {
    expect(ownLine('crm', 'deals', choose(defaultChoices(), 'customers', 'own'))).toEqual({
      text: 'You run Customers & sites in your own CRM.', category: 'crm',
    });
    expect(ownLine('crm', 'deals', choose(defaultChoices(), 'quotes', 'own'))).toBeNull();
  });

  it('every tab named is a real capability', () => {
    const keys = new Set(CAPABILITIES.map(c => c.key));
    for (const m of Object.values(MODULE_TABS)) for (const list of Object.values(m.tabs)) for (const k of list) expect(keys.has(k), k).toBe(true);
    for (const k of Object.values(SLOT_CAPABILITY)) expect(keys.has(k), k).toBe(true);
  });

  it('each module draws the line at the top, linking back to Coverage', () => {
    for (const f of ['src/app/jobs/page.tsx', 'src/app/safety/page.tsx', 'src/app/people/page.tsx', 'src/app/crm/page.tsx']) {
      expect(readFileSync(f, 'utf8'), f).toContain('<OwnSystemLine');
    }
    const line = readFileSync('src/components/own-system-line.tsx', 'utf8');
    expect(line).toContain('/coverage');
    expect(line).toContain('Switch back to SPEC');
  });
});

describe('where a number comes from follows the choice', () => {
  it('SPEC’s own record while it runs in SPEC; the business’s own system when it does not', () => {
    const d = defaultChoices();
    expect(sourceFor('safety_incident', 'SPEC Safety · incident register', d)).toBe('SPEC Safety · incident register');
    const own = chooseArea(d, 'safety', 'own');
    expect(sourceFor('safety_incident', 'SPEC Safety · incident register', own)).toBe('your safety system');
    expect(sourceFor('turnover', 'SPEC People · exits and exit reasons', chooseArea(d, 'hr', 'own'))).toBe('your HR system');
    expect(sourceFor('gross_profit', 'SPEC Jobs · job costing', chooseArea(d, 'jobs', 'own'))).toBe('your job system');
    // Two records, or none of the 38: the label does not move.
    expect(sourceFor('trifr', 'SPEC Safety + Jobs timesheets', own)).toBe('SPEC Safety + Jobs timesheets');
    expect(sourceFor('net_margin', 'your accounting system', own)).toBe('your accounting system');
  });

  it('the Power Meter reading carries it through to the breakdown', () => {
    const own = chooseArea(defaultChoices(), 'safety', 'own');
    const reading = withSources(powerReading([]), own);
    const incident = reading.heavy.find(r => r.slot.id === 'safety_incident')!;
    expect(sourceLine(incident.slot)).toBe('from your safety system');
    expect(sourceLine(reading.heavy.find(r => r.slot.id === 'gross_profit')!.slot)).toBe('from SPEC Jobs · job costing');
    // The framework itself is never edited.
    expect(FRAMEWORK[0].source).toBe('SPEC Safety · incident register');
    expect(withSources(powerReading([]), defaultChoices()).heavy[0].slot.source).toBe('SPEC Safety · incident register');
  });
});

/*
  Categories, never vendors — on every screen, not only the ones built this week.

  The People page offered to connect two named HR products, long after the never list said
  otherwise. Every page and component is read with its comments stripped; the one exception is
  Connections talking about the one connector SPEC really has, which is named because it speaks that
  company's API (see `isXero` in lib/systems). The People page is read whole, comments included.
*/
describe('no vendor on any screen', () => {
  const VENDORS = /\b(bamboo ?hr|employment ?hero|keypay|tanda|simpro|aroflo|servicem8|fergus|tradify|hubspot|salesforce|pipedrive|zoho|myob|quickbooks|safety ?minder|pylon|hammertech|donesafe|sitedocs|xero)\b/i;
  const code = (t: string) => t.replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
  const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true })
    .flatMap(e => (e.isDirectory() ? walk(`${dir}/${e.name}`) : /\.tsx?$/.test(e.name) ? [`${dir}/${e.name}`] : []));

  it('names no HR, job, safety, CRM or accounting product in any page or component', () => {
    const files = [...walk('src/app'), ...walk('src/components')].filter(f => !f.startsWith('src/app/connections/'));
    expect(files.length).toBeGreaterThan(50);
    for (const f of files) expect(code(readFileSync(f, 'utf8')), f).not.toMatch(VENDORS);
  });

  it('and the People page names none even in its notes', () => {
    for (const f of walk('src/app/people')) expect(readFileSync(f, 'utf8'), f).not.toMatch(VENDORS);
    expect(readFileSync('src/app/people/page.tsx', 'utf8')).toContain('Connect your HR system');
  });
});

/*
  ── What the map CLAIMS, against what is actually built ──────────────────────────────────────────

  The most dangerous screen in the product, and it was wrong.

  `totalsOf` counted "Running in SPEC" as *38 minus whatever the business had switched to its own
  system*, under the words "Nothing else to buy for these". A business that had connected nothing
  was therefore told SPEC runs all 38 — including purchase orders, progress claims and pre-builds,
  none of which are written. The screen could not tell a capability SPEC runs from one nobody has
  built, so it claimed every one of them.

  Every test here passed while that was true, because they all checked that the LIST matched the
  design. None of them asked whether the claim was true.
*/
describe('what the map claims is true', () => {
  it('EVERY CAPABILITY SAYS WHETHER IT IS ACTUALLY BUILT', () => {
    for (const c of CAPABILITIES) {
      expect(['yes', 'partly', 'no'], c.key).toContain(c.built);
      // Anything not finished has to say what is missing, or "partly" means nothing.
      if (c.built !== 'yes') {
        expect(c.evidence?.length ?? 0, `${c.key} must say what is missing`).toBeGreaterThan(20);
      }
    }
  });

  /*
    A capability claimed as built has to name where it lives, and that route has to exist. This is
    the check that would have caught the original fault: "Purchase orders & supplier bills" claimed
    as running in SPEC, with no page anywhere behind it.
  */
  it('ANYTHING CLAIMED AS BUILT NAMES A ROUTE THAT EXISTS', () => {
    const missing: string[] = [];
    for (const c of CAPABILITIES.filter(x => x.built === 'yes')) {
      const path = (c.evidence ?? '').match(/\/[a-z-]+(?=[?\s#.,]|$)/)?.[0];
      expect(path, `${c.key} claims to be built but names no route`).toBeTruthy();
      if (path && !existsSync(join(process.cwd(), 'src/app', path.replace(/^\//, ''), 'page.tsx'))) {
        missing.push(`${c.key} → ${path}`);
      }
    }
    expect(missing, 'claimed as built, with no page behind it').toEqual([]);
  });

  it('COUNTS WHAT IS BUILT, not what is merely unconnected', () => {
    const t = totalsOf({});
    expect(t.inSpec, 'nothing connected, so all 38 run here').toBe(38);
    /*
      `inSpec` must never be the number on the tile: it only says "not connected elsewhere". The
      honest counts are these, and they have to account for every one of the 38 with nothing
      falling between them.
    */
    expect(t.builtHere + t.partlyHere).toBeLessThanOrEqual(t.inSpec);
    expect(t.builtHere).toBe(CAPABILITIES.filter(c => c.built === 'yes').length);
    expect(t.partlyHere).toBe(CAPABILITIES.filter(c => c.built === 'partly').length);
  });

  /*
    ── The line has to match the map, whichever way the map reads ───────────────────────────────

    This used to demand the words "partly there" or "not written", which was right while there was
    a gap and would now fail on the truth. What it must actually hold is that the sentence agrees
    with the counts: it names a gap when there is one, and says so plainly when there is not.
  */
  it('SAYS THE GAP OUT LOUD when there is one, and does not invent one when there is not', () => {
    const t = totalsOf({});
    const line = coverageLine(t);
    expect(line).toMatch(/built and working/);
    if (t.builtHere === t.total) {
      expect(line, 'nothing to hedge about').not.toMatch(/partly there|not written/);
    } else {
      expect(line).toMatch(/partly there|not written/);
    }
    // And a map WITH a gap still says so — proved on a stand-in rather than by waiting for one.
    expect(coverageLine({ ...t, builtHere: 30, partlyHere: 5 }))
      .toMatch(/30 of 38 are built and working, 5 are partly there, 3 are designed and not written/);
  });

  /*
    ── Nothing is unwritten any more ────────────────────────────────────────────────────────────

    There were three on 24 September: pre-builds, purchase orders, progress claims. All three are
    built. This now asserts the empty set, so the day something is added to the map without being
    written, it fails here rather than going out as a claim.
  */
  it('HAS NOTHING LEFT THAT IS NOT WRITTEN AT ALL', () => {
    expect(CAPABILITIES.filter(c => c.built === 'no').map(c => c.key)).toEqual([]);
  });

  /*
    ── 38 means 38 ──────────────────────────────────────────────────────────────────────────────

    Kris's rule, in CLAUDE.md: "Build all 38 pages. 22 of 38 is a failure, not progress."

    Every one of them is now `yes`, and the test above proves each names a route that exists. This
    asserts the set is EMPTY rather than counting, so the day something regresses — or a 39th is
    added to the map without being written — it fails here instead of going out as a claim.
  */
  it('HAS NOTHING PARTLY BUILT EITHER — all 38 mean 38', () => {
    expect(CAPABILITIES.filter(c => c.built === 'partly').map(c => c.key)).toEqual([]);
    expect(CAPABILITIES.filter(c => c.built === 'yes')).toHaveLength(38);
  });

  it('and the screen shows a capability’s own state on its own row', () => {
    const map = readFileSync('src/app/coverage/coverage-map.tsx', 'utf8');
    expect(map).toContain('BUILT_LABEL[c.built]');
    expect(map, 'the old claim must be gone').not.toContain("note: 'Nothing else to buy for these'");
  });
});
