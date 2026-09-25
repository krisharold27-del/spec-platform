import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { powerReading, type Measure } from '../src/lib/power-meter';
import { WORKFLOWS, FAMILIES, movedBy, inFamily, isSentLinkScreen } from '../src/lib/workflows';
import {
  levers, leversLine, fixesFor, startOf, coverageGrid, ledgerPanel, ANGUS_SHIELD,
} from '../src/lib/virtual-gm-overview';

const measure = (text: string, answer: Measure['answer'], over: Partial<Measure> = {}): Measure => ({
  criterionId: text, text, roleId: 'r1', roleTitle: 'Operations Manager', answer,
  result: null, target: null, ...over,
});

const page = readFileSync('src/app/virtual-gm/page.tsx', 'utf8');
const myPage = readFileSync('src/app/my-page/page.tsx', 'utf8');
const code = (t: string) => t.replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

describe('the Virtual GM reads the same dial as My Page', () => {
  it('both screens get their reading from the one shared call', () => {
    expect(page).toContain('viewerPowerMeter(');
    expect(myPage).toContain('viewerPowerMeter(');
    // Neither assembles the meter's inputs its own way.
    expect(code(page)).not.toMatch(/powerMeterFor\(|powerReading\(|snapScore\(/);
    expect(code(myPage)).not.toMatch(/powerMeterFor\(|powerReading\(/);
  });

  it('and draws it with the same components, not a copy', () => {
    expect(page).toMatch(/import \{[^}]*\bDial\b[^}]*\bPowerBreakdown\b[^}]*\} from '@\/components\/power-meter'/);
  });

  it('is a door from My Page, and — since 25 September — a tab on the bar as well', () => {
    // It was a door only. Kris then named it a core component that must always be findable
    // (docs/CORE-COMPONENTS.md), so it is in the menu too; tests/core-components.test.ts holds that.
    expect(myPage).toContain('href="/virtual-gm"');
    expect(readFileSync('src/lib/doors.ts', 'utf8')).toContain("href: '/virtual-gm'");
  });
});

describe('levers to pull this week', () => {
  it('come only from what the meter marked not met, heavy hitters first', () => {
    const reading = powerReading([
      measure('Debtor days under 45', 'N', { result: '61', target: '45' }),
      measure('Zero safety incidents', 'N', { result: '1', target: '0' }),
      measure('Gross profit margin at target', 'Y'),
      measure('Near-miss reports lodged', ''),
    ]);
    const found = levers(reading);
    expect(found.map(l => l.slotId)).toEqual(['safety_incident', 'debtor_days']);
    expect(found[0].weight).toBe('heavy');
    expect(found[0].cause).toContain('1 against a target of 0');
    // Met and never-marked produce no lever.
    expect(found.some(l => l.slotId === 'gross_profit' || l.slotId === 'near_miss')).toBe(false);
  });

  it('every fix is a real workflow that moves that measure, starting on a real screen', () => {
    const reading = powerReading(
      ['Zero safety incidents', 'Debtor days under 45', 'Staff turnover under 10%', 'Gross profit margin at target']
        .map(t => measure(t, 'N')),
    );
    const found = levers(reading);
    expect(found.length).toBeGreaterThan(0);
    for (const l of found) {
      expect(l.fixes.length, l.slotId).toBeGreaterThan(0);
      for (const f of l.fixes) {
        const w = WORKFLOWS.find(x => x.id === f.workflowId)!;
        expect(w, f.workflowId).toBeDefined();
        expect(w.moves).toContain(l.slotId);
        expect(f.name).toBe(w.name);
        const path = f.href.split('?')[0].split('#')[0].replace(/^\//, '');
        expect(existsSync(join('src/app', path, 'page.tsx')), f.href).toBe(true);
      }
    }
  });

  it('fixesFor names every workflow the map says moves the measure', () => {
    for (const slot of ['safety_incident', 'debtor_days', 'turnover']) {
      expect(fixesFor(slot).map(f => f.workflowId)).toEqual(movedBy(slot as never).filter(w => startOf(w)).map(w => w.id));
    }
  });

  it('says nothing is missed when nothing is, and never invents a lever', () => {
    const clean = powerReading([measure('Zero safety incidents', 'Y')]);
    expect(levers(clean)).toEqual([]);
    expect(leversLine([], '2026-08')).toBe('Nothing is marked not met this month.');
    expect(leversLine([], null)).toContain('Nothing has been marked yet');
    expect(levers(powerReading([]))).toEqual([]);
  });

  it('counts the heavy hitters in the line', () => {
    const found = levers(powerReading([measure('Zero safety incidents', 'N'), measure('Debtor days under 45', 'N')]));
    expect(leversLine(found, '2026-08')).toBe('2 measures are marked not met — 1 of them a heavy hitter.');
  });
});

describe('everything the business needs, one login', () => {
  const grid = coverageGrid();

  it('is the seven workflow families, in their own order and words', () => {
    expect(grid).toHaveLength(7);
    expect(grid.map(t => t.key)).toEqual(FAMILIES.map(f => f.key));
    expect(grid.map(t => t.label)).toEqual(FAMILIES.map(f => f.label));
  });

  it('counts each family from the map, never a typed number', () => {
    for (const t of grid) {
      const mine = inFamily(t.key);
      expect(t.total).toBe(mine.length);
      expect(t.whole + t.partial).toBe(t.total);
    }
    expect(grid.reduce((n, t) => n + t.total, 0)).toBe(WORKFLOWS.length);
  });

  it('every tile opens a screen that exists', () => {
    for (const t of grid) {
      expect(existsSync(join('src/app', t.href.replace(/^\//, ''), 'page.tsx')), t.href).toBe(true);
    }
  });
});

describe('your financial system', () => {
  it('says plainly when nothing is connected', () => {
    const p = ledgerPanel([]);
    expect(p.state).toBe('none');
    expect(p.name).toBeNull();
    expect(p.says).toContain('marked by hand');
  });

  it('shows the real state of the connection the business made', () => {
    expect(ledgerPanel([{ name: 'Our books', status: 'requested', linked: false, orgName: null }]).state).toBe('named');
    expect(ledgerPanel([{ name: 'Our books', status: 'live', linked: true, orgName: null }]).state).toBe('choose');
    const linked = ledgerPanel([{ name: 'Our books', status: 'live', linked: true, orgName: 'Acme Pty Ltd' }]);
    expect(linked.state).toBe('linked');
    expect(linked.says).toContain('Acme Pty Ltd');
    expect(ledgerPanel([{ name: 'Our books', status: 'broken', linked: true, orgName: 'Acme' }]).state).toBe('broken');
  });

  it('prefers the attempt that worked when there are several', () => {
    const p = ledgerPanel([
      { name: 'Old', status: 'broken', linked: false, orgName: null },
      { name: 'New', status: 'live', linked: true, orgName: 'Acme' },
    ]);
    expect(p.name).toBe('New');
  });

  it('names Angus Shield as SPEC’s own, and not switchable yet', () => {
    expect(ANGUS_SHIELD.name).toBe('Angus Shield');
    expect(ANGUS_SHIELD.switchable).toBe(false);
    expect(ANGUS_SHIELD.line).toContain('SPEC’s own financial system');
    expect(ANGUS_SHIELD.line).toContain('not switchable yet');
    expect(page).toContain('ANGUS_SHIELD.name');
  });
});

describe('a lever never points at a page that needs a token', () => {
  it('no workflow starts on the customer’s page or the join page', () => {
    const starts = WORKFLOWS.map(startOf).filter((s): s is string => !!s);
    expect(starts.length).toBeGreaterThan(0);
    expect(starts.filter(isSentLinkScreen)).toEqual([]);
  });
});
