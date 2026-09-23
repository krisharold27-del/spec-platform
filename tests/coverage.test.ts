import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  AREAS, CAPABILITIES, capabilitiesIn, CONNECTED_LABEL, defaultChoices, choose, readChoices,
  totalsOf, connectedNote,
} from '../src/lib/coverage';
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

  it('offers a connected system on exactly the rows the design does', () => {
    expect(CAPABILITIES.filter(c => c.connect).map(c => c.key))
      .toEqual(designRows.filter(r => r.own).map(r => r.key));
  });

  it('names categories, never vendors', () => {
    const text = JSON.stringify({ AREAS, CAPABILITIES, CONNECTED_LABEL });
    for (const vendor of [...COMMON_SYSTEMS, 'Xero Payroll', 'SafeWork', 'Fair Work']) {
      expect(text.toLowerCase()).not.toContain(vendor.toLowerCase());
    }
    const categories = new Set<string>(CATEGORIES.map(c => c.id));
    for (const c of CAPABILITIES) if (c.connect) expect(categories.has(c.connect)).toBe(true);
  });
});

describe('the switch', () => {
  it('starts in SPEC unless the business already told SPEC it runs that kind of system', () => {
    const none = defaultChoices([]);
    expect(Object.values(none).every(v => v === 'spec')).toBe(true);
    const withJobs = defaultChoices(['job_management']);
    expect(withJobs.quotes).toBe('connected');
    expect(withJobs.customers).toBe('spec');
    expect(withJobs.payroll).toBe('spec');
    expect(defaultChoices(['financials']).payroll).toBe('connected');
  });

  it('cannot hand a SPEC-only capability to a connected system', () => {
    const c = defaultChoices([]);
    expect(choose(c, 'incidents', 'connected').incidents).toBe('spec');
    expect(choose(c, 'quotes', 'connected').quotes).toBe('connected');
    expect(choose(c, 'nonsense', 'connected')).toBe(c);
  });

  it('reads stored choices defensively', () => {
    const d = defaultChoices([]);
    expect(readChoices(null, d)).toEqual(d);
    expect(readChoices('not json', d)).toEqual(d);
    expect(readChoices('{"quotes":"connected","incidents":"connected","x":"spec","jobs":7}', d))
      .toEqual({ ...d, quotes: 'connected' });
  });

  it('totals the way the design does', () => {
    const none = totalsOf(defaultChoices([]));
    expect(none).toEqual({ total: 38, inSpec: 38, connected: 0, systems: [] });
    expect(connectedNote(none)).toBe('Nothing connected. SPEC runs it all');
    const some = totalsOf(defaultChoices(['job_management', 'financials']));
    expect(some.connected).toBe(17);
    expect(some.inSpec).toBe(21);
    expect(connectedNote(some)).toBe('From your job system, your accounting system, read and written by SPEC');
  });
});
