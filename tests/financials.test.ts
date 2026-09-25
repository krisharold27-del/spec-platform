import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import {
  csvCells, readLedgerFile, mergeFigures, glance, headline, anyFigure, whatNeedsYou, payrollFlow,
  NO_FIGURES, type Figures, type TimesheetRow,
} from '../src/lib/financials';
import { navDoors, allDoors } from '../src/lib/doors';

const f = (over: Partial<Figures>): Figures => ({ ...NO_FIGURES, ...over });

describe('reading an exported file', () => {
  it('splits quoted CSV cells', () => {
    expect(csvCells('"Net Profit","12,345.00","(1,000.00)"')).toEqual(['Net Profit', '12,345.00', '(1,000.00)']);
  });

  it('reads a Xero Profit and Loss with this month and last', () => {
    const csv = [
      'Profit and Loss', 'Demo Company', '',
      'Account,Sep 2026,Aug 2026',
      'Wages and Salaries,"41,200.00","39,800.00"',
      'Net Profit,"18,400.50","14,200.00"',
    ].join('\n');
    const read = readLedgerFile(csv);
    expect(read.figures.profitThis).toBe(1_840_050);
    expect(read.figures.profitLast).toBe(1_420_000);
    expect(read.figures.payroll).toBe(4_120_000);
    expect(read.figures.cash).toBeNull();
  });

  it('reads a Balance Sheet by name, and MYOB GST collected less paid', () => {
    const csv = [
      'Total Bank,"52,000.00"',
      'Trade Debtors,"31,000.00"',
      'Trade Creditors,"9,500.00"',
      'GST Collected,"8,000.00"',
      'GST Paid,"3,000.00"',
    ].join('\r\n');
    const { figures } = readLedgerFile(csv);
    expect(figures).toMatchObject({ cash: 5_200_000, owedToUs: 3_100_000, weOwe: 950_000, gst: 500_000 });
  });

  it('never invents a figure a file does not give', () => {
    const { figures, found } = readLedgerFile('Revenue,100\nSomething else,200');
    expect(found).toEqual([]);
    expect(anyFigure(figures)).toBe(false);
  });

  it('the first source to give a figure keeps it — the books before SiteVIP', () => {
    const merged = mergeFigures(f({ owedToUs: 100 }), f({ owedToUs: 999, weOwe: 50 }));
    expect(merged.owedToUs).toBe(100);
    expect(merged.weOwe).toBe(50);
  });
});

describe('the money at a glance', () => {
  it('leads with cash, and says so honestly when it is not in', () => {
    expect(headline({ figures: NO_FIGURES, sources: {} }).value).toBeNull();
    expect(headline({ figures: f({ cash: 5_200_000 }), sources: { cash: 'upload' } }).value).toBe('$52,000');
  });

  it('no more than six tiles, in plain words — no accounting jargon', () => {
    const tiles = glance({ figures: NO_FIGURES, sources: {} });
    expect(tiles.length).toBeLessThanOrEqual(6);
    const words = JSON.stringify(tiles).toLowerCase();
    for (const jargon of ['receivable', 'payable', 'debtor', 'creditor', 'liability']) expect(words).not.toContain(jargon);
    expect(tiles.every(t => t.value === null && !t.dot)).toBe(true);
  });

  it('profit against last month, with a dot only when it needs attention', () => {
    const up = glance({ figures: f({ profitThis: 1_000_000, profitLast: 580_000 }), sources: {} })[0];
    expect(up.says).toBe('Up $4,200 on last month.');
    expect(up.dot).toBeUndefined();
    const down = glance({ figures: f({ profitThis: 500_000, profitLast: 900_000 }), sources: {} })[0];
    expect(down.says).toBe('Down $4,000 on last month.');
    expect(down.dot).toBe('amber');
    const loss = glance({ figures: f({ profitThis: -100_000 }), sources: {} })[0];
    expect(loss.dot).toBe('red');
  });

  it('what needs you always carries the fix, and says nothing when nothing does', () => {
    const base = {
      figures: NO_FIGURES, timesheetsWaiting: 0, invoicesToChase: 0, overdueCents: 0, billsOverOrder: 0,
      payRun: 'none' as const, ledger: 'none' as const, uploadedAt: null, today: '2026-09-25',
    };
    expect(whatNeedsYou(base)).toEqual([]);
    const needs = whatNeedsYou({ ...base, invoicesToChase: 2, overdueCents: 340_000, timesheetsWaiting: 3, ledger: 'broken' });
    expect(needs.map(n => n.key)).toEqual(['ledger', 'chase', 'timesheets']);
    for (const n of needs) expect(n.action.length && n.href.length).toBeTruthy();
  });
});

describe('payroll: hours in, checked, sent to pay', () => {
  const row = (over: Partial<TimesheetRow>): TimesheetRow => ({
    personKey: 'staff:1', personName: 'Sam', jobId: 'j1', day: '2026-09-22', minutes: 480,
    finishedAt: 'x', approvedAt: null, ...over,
  });
  const label = (id: string) => (id === 'j1' ? 'J-1001 · 12 Smith St' : null);

  it('three steps, and the one thing to do next', () => {
    const flow = payrollFlow([row({}), row({ personKey: 'staff:2', personName: 'Alex', finishedAt: null })], label, 'none', 'your payroll');
    expect(flow.steps.map(s => s.title)).toEqual(['Hours in', 'Checked', 'Sent to pay']);
    expect(flow.open).toBe(1);
    expect(flow.next?.label).toBe('Finish 1 open clock-on');
    expect(flow.worked.find(w => w.who === 'Sam')?.jobs).toEqual(['J-1001 · 12 Smith St']);
  });

  it('approved and award-checked, it is ready to send', () => {
    const flow = payrollFlow([row({ approvedAt: 'y' })], label, 'checked', 'Angus Shield');
    expect(flow.steps[1].done).toBe(true);
    expect(flow.next).toEqual({ label: 'Send to Angus Shield', href: '/people?mode=pay' });
  });

  it('an empty week asks nothing', () => {
    const flow = payrollFlow([], label, 'none', 'your payroll');
    expect(flow.next).toBeNull();
    expect(flow.steps.every(s => !s.done)).toBe(true);
  });
});

describe('Financials is on the bar, right after People, and linked', () => {
  const ctx = { businesses: 1, runsSpec: false };
  it('sits after People and is a real page', () => {
    const labels = navDoors(ctx).map(d => d.label);
    expect(labels.indexOf('Financials')).toBe(labels.indexOf('People') + 1);
    expect(allDoors(ctx).some(d => d.href === '/financials')).toBe(true);
    expect(existsSync('src/app/financials/page.tsx')).toBe(true);
  });

  it('is linked from My Page and the Virtual GM, which share one financial-system panel', () => {
    expect(readFileSync('src/app/my-page/page.tsx', 'utf8')).toContain('href="/financials"');
    const vgm = readFileSync('src/app/virtual-gm/page.tsx', 'utf8');
    expect(vgm).toContain('href="/financials"');
    expect(vgm).toContain('<FinancialSystemPanel');
    expect(readFileSync('src/app/financials/page.tsx', 'utf8')).toContain('<FinancialSystemPanel');
  });
});
