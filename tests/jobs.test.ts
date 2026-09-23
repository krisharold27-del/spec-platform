import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  STAGES, nextStage, isStage, stageLabel, parseEnquiry, nextRef,
  MARKUPS, GST_RATE, MARGIN_BENCHMARK, BILLABLE_TARGET,
  marginLight, billableLight, expandKit, parseComponents, lineFrom, priceLine, priceQuote,
  addToLines, stepLine, marginAdvice, jobMargin, pipelineStats, minutesBetween, billable,
  labourCostCents, workWeek, dayLabel, weekLabel, shiftWeek, bookingRefusal, priceFileState, stale, parsePriceFile,
  money, money2, toCents, pctLabel, WORKED_EXAMPLE,
  type CatalogueItem, type Kit, type LabourRate, type QuoteLine,
} from '../src/lib/jobs';

const items: CatalogueItem[] = [
  { id: 'gpo', name: 'Double power point', unit: 'each', supplier: 'Wholesaler A', costCents: 985 },
  { id: 'rcbo', name: 'RCBO 20A 30mA', unit: 'each', supplier: 'Wholesaler A', costCents: 4260 },
  { id: 'board', name: 'Enclosure, 36 pole', unit: 'each', supplier: 'Wholesaler B', costCents: 21800 },
];
const rates: LabourRate[] = [
  { id: 'lic', name: 'Electrician', costCents: 6800, chargeCents: 12000 },
  { id: 'app', name: 'Apprentice', costCents: 3200, chargeCents: 7500 },
];
const kit: Kit = {
  id: 'k1', name: 'Board upgrade', labourHours: 6, labourRateId: null, extraCostCents: 3500,
  components: [{ itemId: 'board', qty: 1 }, { itemId: 'rcbo', qty: 8 }],
};
const ctx = { items, kits: [kit], rates };

describe('the pipeline', () => {
  it('has seven stages from enquiry to paid, in order', () => {
    expect(STAGES.map(s => s.key)).toEqual(['enquiry', 'quoted', 'won', 'scheduled', 'onsite', 'invoiced', 'paid']);
  });
  it('moves one stage at a time and stops at the end', () => {
    expect(nextStage('enquiry')).toBe('quoted');
    expect(nextStage('onsite')).toBe('invoiced');
    expect(nextStage('paid')).toBeNull();
    expect(nextStage('nonsense')).toBeNull();
  });
  it('knows its own stages and labels', () => {
    expect(isStage('won')).toBe(true);
    expect(isStage('lost')).toBe(false);
    expect(stageLabel('onsite')).toBe('On site');
  });
});

describe('an enquiry from one line', () => {
  it('reads client, work and site in the order they are said', () => {
    expect(parseEnquiry('Sam Lee, switchboard upgrade, Balmain')).toEqual({ client: 'Sam Lee', title: 'switchboard upgrade', site: 'Balmain' });
  });
  it('takes a single phrase as the work, not the client', () => {
    expect(parseEnquiry('EV charger install')).toEqual({ client: 'New client', title: 'EV charger install', site: '' });
  });
  it('leaves a missing site empty rather than inventing one', () => {
    expect(parseEnquiry('Priya Shah, EV charger')?.site).toBe('');
  });
  it('keeps commas inside the site', () => {
    expect(parseEnquiry('A, B, 4 Smith St, Ryde')?.site).toBe('4 Smith St, Ryde');
  });
  it('refuses nothing at all', () => {
    expect(parseEnquiry('   ')).toBeNull();
    expect(parseEnquiry(' , , ')).toBeNull();
  });
});

describe('references', () => {
  it('starts a series at 1001', () => expect(nextRef('J', [])).toBe('J-1001'));
  it('follows the highest, not the count, so a gap never repeats a number', () => {
    expect(nextRef('J', ['J-1001', 'J-1007', 'Q-2000'])).toBe('J-1008');
  });
  it('ignores other series and junk', () => expect(nextRef('Q', ['J-5000', 'Q-x', 'Q-1002'])).toBe('Q-1003'));
});

describe('the rules', () => {
  it('offers 25, 35 and 45% markup, 10% GST, a 40% benchmark and an 86% billable target', () => {
    expect([...MARKUPS]).toEqual([25, 35, 45]);
    expect(GST_RATE).toBe(0.1);
    expect(MARGIN_BENCHMARK).toBe(0.4);
    expect(BILLABLE_TARGET).toBe(0.86);
  });
});

describe('margin and billable lights — pending is never red', () => {
  it('nothing to measure is pending', () => {
    expect(marginLight(null)).toBe('pending');
    expect(marginLight(NaN)).toBe('pending');
    expect(billableLight(null)).toBe('pending');
  });
  it('at the benchmark is green, within ten points amber, further red', () => {
    expect(marginLight(0.4)).toBe('green');
    expect(marginLight(0.52)).toBe('green');
    expect(marginLight(0.35)).toBe('amber');
    expect(marginLight(0.3)).toBe('amber');
    expect(marginLight(0.29)).toBe('red');
    expect(marginLight(-0.1)).toBe('red');
  });
  it('billable: 86% green, 75% amber, below red', () => {
    expect(billableLight(0.86)).toBe('green');
    expect(billableLight(0.91)).toBe('green');
    expect(billableLight(0.79)).toBe('amber');
    expect(billableLight(0.75)).toBe('amber');
    expect(billableLight(0.52)).toBe('red');
  });
});

describe('kits', () => {
  it('expand into the cost of their parts plus sundries', () => {
    expect(expandKit(kit, items)).toEqual({ costCents: 21800 + 8 * 4260 + 3500, missing: [] });
  });
  it('name a missing part instead of pricing it at nothing', () => {
    const k = { ...kit, components: [...kit.components, { itemId: 'gone', qty: 2 }] };
    expect(expandKit(k, items).missing).toEqual(['gone']);
    expect(expandKit(k, items).costCents).toBe(expandKit(kit, items).costCents);
  });
  it('read their stored parts safely', () => {
    expect(parseComponents('[{"itemId":"a","qty":2}]')).toEqual([{ itemId: 'a', qty: 2 }]);
    expect(parseComponents('[{"itemId":"a","qty":0},{"qty":1},null]')).toEqual([]);
    expect(parseComponents('not json')).toEqual([]);
    expect(parseComponents(null)).toEqual([]);
    expect(parseComponents('{"a":1}')).toEqual([]);
  });
});

describe('building a line from the catalogue', () => {
  it('copies an item’s cost onto the line', () => {
    expect(lineFrom('item', 'gpo', ctx, 4)).toMatchObject({ kind: 'item', name: 'Double power point', unitCostCents: 985, qty: 4, hours: 0 });
  });
  it('copies a labour rate, one hour per unit', () => {
    expect(lineFrom('labour', 'app', ctx)).toMatchObject({ hours: 1, rateCostCents: 3200, rateChargeCents: 7500, unitCostCents: 0 });
  });
  it('expands a kit, pricing its hours at the first rate when it names none', () => {
    const l = lineFrom('kit', 'k1', ctx)!;
    expect(l.unitCostCents).toBe(59380);
    expect(l.hours).toBe(6);
    expect(l.rateChargeCents).toBe(12000);
  });
  it('uses the kit’s own rate when it names one', () => {
    const l = lineFrom('kit', 'k1', { ...ctx, kits: [{ ...kit, labourRateId: 'app' }] })!;
    expect(l.rateChargeCents).toBe(7500);
  });
  it('refuses anything that is not in the catalogue, or a nonsense quantity', () => {
    expect(lineFrom('item', 'nope', ctx)).toBeNull();
    expect(lineFrom('labour', 'nope', ctx)).toBeNull();
    expect(lineFrom('kit', 'nope', ctx)).toBeNull();
    expect(lineFrom('item', 'gpo', ctx, 0)).toBeNull();
    expect(lineFrom('item', 'gpo', ctx, -1)).toBeNull();
  });
  it('refuses a kit with labour when there is no rate to price it at', () => {
    expect(lineFrom('kit', 'k1', { ...ctx, rates: [] })).toBeNull();
  });
  it('keeps the price it was added at when the catalogue changes later', () => {
    const l = lineFrom('item', 'gpo', ctx, 1)!;
    items[0].costCents = 9999;
    try {
      expect(priceLine(l, 0).costCents).toBe(985);
    } finally {
      items[0].costCents = 985;
    }
  });
});

describe('pricing a line', () => {
  it('marks materials up and nothing else', () => {
    const p = priceLine(lineFrom('item', 'gpo', ctx, 4)!, 35);
    expect(p.materialCostCents).toBe(3940);
    expect(p.materialSellCents).toBe(5319);
    expect(p.labourSellCents).toBe(0);
    expect(p.sellCents).toBe(5319);
  });
  it('sells labour at its charge rate, whatever the markup', () => {
    const l = lineFrom('labour', 'lic', ctx, 4)!;
    expect(priceLine(l, 25).sellCents).toBe(48000);
    expect(priceLine(l, 45).sellCents).toBe(48000);
    expect(priceLine(l, 45).costCents).toBe(27200);
    expect(priceLine(l, 45).hours).toBe(4);
  });
  it('prices a kit as marked-up materials plus its hours', () => {
    const p = priceLine(lineFrom('kit', 'k1', ctx, 2)!, 35);
    expect(p.materialCostCents).toBe(118760);
    expect(p.materialSellCents).toBe(Math.round(118760 * 1.35));
    expect(p.hours).toBe(12);
    expect(p.labourSellCents).toBe(144000);
    expect(p.labourCostCents).toBe(81600);
  });
  it('handles half hours and rounds to the cent once', () => {
    const l: QuoteLine = { kind: 'labour', ref: 'r', name: 'r', unitCostCents: 0, hours: 1, rateCostCents: 3333, rateChargeCents: 6667, qty: 0.5 };
    expect(priceLine(l, 0)).toMatchObject({ labourCostCents: 1667, labourSellCents: 3334, hours: 0.5 });
  });
  it('never prices a negative quantity', () => {
    const l = { ...lineFrom('item', 'gpo', ctx)!, qty: -3 };
    expect(priceLine(l, 35).sellCents).toBe(0);
  });
});

describe('pricing the worked example — the Switchboard upgrade', () => {
  const t = priceQuote(WORKED_EXAMPLE.lines, 35);
  it('adds materials and labour to the design’s totals', () => {
    expect(t.materialCostCents).toBe(59380 + 3940);
    expect(t.materialSellCents).toBe(80163 + 5319);
    expect(t.hours).toBe(18);
    expect(t.labourSellCents).toBe(72000 + 48000 + 60000);
    expect(t.exGstCents).toBe(265482);
  });
  it('adds GST once, on the total', () => {
    expect(t.gstCents).toBe(26548);
    expect(t.incGstCents).toBe(265482 + 26548);
    expect(money(t.incGstCents)).toBe('$2,920');
  });
  it('clears the 40% benchmark at 35% markup', () => {
    expect(t.costCents).toBe(156920);
    expect(t.margin).toBeCloseTo(0.4089, 4);
    expect(t.light).toBe('green');
    expect(t.meetsBenchmark).toBe(true);
  });
  it('drops under it at 25%, which is what the markup buttons are for', () => {
    const low = priceQuote(WORKED_EXAMPLE.lines, 25);
    expect(low.margin).toBeLessThan(0.4);
    expect(low.light).toBe('amber');
    expect(marginAdvice(low)).toMatch(/Under the 40% benchmark/);
  });
  it('earns more at 45%', () => {
    expect(priceQuote(WORKED_EXAMPLE.lines, 45).margin!).toBeGreaterThan(t.margin!);
  });
  it('lines always add up to the total', () => {
    expect(t.lines.reduce((a, l) => a + l.sellCents, 0)).toBe(t.exGstCents);
  });
});

describe('an empty quote', () => {
  it('has no margin, so it is pending and never red', () => {
    const t = priceQuote([], 35);
    expect(t.margin).toBeNull();
    expect(t.light).toBe('pending');
    expect(t.incGstCents).toBe(0);
    expect(marginAdvice(t)).toMatch(/Add a line/);
  });
  it('an all-labour quote still has a margin', () => {
    expect(priceQuote([lineFrom('labour', 'lic', ctx, 1)!], 35).margin).toBeCloseTo((12000 - 6800) / 12000, 6);
  });
});

describe('changing a quote', () => {
  const start = [lineFrom('item', 'gpo', ctx, 1)!];
  it('adds one to a line that is already there rather than duplicating it', () => {
    const next = addToLines(start, lineFrom('item', 'gpo', ctx, 1)!);
    expect(next).toHaveLength(1);
    expect(next[0].qty).toBe(2);
  });
  it('appends something new', () => {
    expect(addToLines(start, lineFrom('labour', 'lic', ctx)!)).toHaveLength(2);
  });
  it('steps a quantity and drops a line that reaches nothing', () => {
    expect(stepLine(start, 0, 1)[0].qty).toBe(2);
    expect(stepLine(start, 0, -1)).toEqual([]);
  });
  it('does not change the lines it was given', () => {
    addToLines(start, lineFrom('item', 'gpo', ctx, 1)!);
    stepLine(start, 0, 5);
    expect(start[0].qty).toBe(1);
  });
});

describe('a job’s margin while it runs', () => {
  it('is not measured until costs land on it', () => {
    expect(jobMargin(1_000_000, 0, null)).toBeNull();
    expect(jobMargin(1_000_000, 0, 0)).toBeNull();
    expect(jobMargin(0, 500, 500)).toBeNull();
  });
  it('is value against labour and materials', () => {
    expect(jobMargin(6_400_000, 3_180_000, 1_920_000)).toBeCloseTo(0.2031, 4);
    expect(jobMargin(100_00, 60_00, null)).toBeCloseTo(0.4, 6);
  });
});

describe('the pipeline numbers', () => {
  const jobs = [
    { stage: 'enquiry', valueCents: 320000, margin: null },
    { stage: 'quoted', valueCents: 980000, margin: null },
    { stage: 'won', valueCents: 4200000, margin: null },
    { stage: 'onsite', valueCents: 6400000, margin: 0.2 },
    { stage: 'onsite', valueCents: 18600000, margin: 0.28 },
    { stage: 'invoiced', valueCents: 1420000, margin: 0.39 },
  ];
  const s = pipelineStats(jobs);
  it('quotes out, work on the books and what is owed come from the stages', () => {
    expect(s.quotesOutCents).toBe(980000);
    expect(s.onBooksCents).toBe(4200000 + 6400000 + 18600000);
    expect(s.live).toBe(3);
    expect(s.owedCents).toBe(1420000);
  });
  it('averages margin over measured jobs only', () => {
    expect(s.averageMargin).toBeCloseTo((0.2 + 0.28 + 0.39) / 3, 6);
    expect(s.measured).toBe(3);
  });
  it('an empty business has no average, not zero', () => {
    expect(pipelineStats([]).averageMargin).toBeNull();
  });
});

describe('timesheets', () => {
  it('reads Start and Finish into minutes', () => {
    expect(minutesBetween('07:00', '15:30')).toBe(510);
    expect(minutesBetween('6:45', '7:00')).toBe(15);
  });
  it('refuses a finish before the start, or nonsense', () => {
    expect(minutesBetween('15:00', '07:00')).toBeNull();
    expect(minutesBetween('07:00', '07:00')).toBeNull();
    expect(minutesBetween('25:00', '26:00')).toBeNull();
    expect(minutesBetween('07:00', null)).toBeNull();
    expect(minutesBetween('seven', '15:00')).toBeNull();
  });
  it('works out billable share across a week', () => {
    const b = billable([
      { minutes: 480, billable: true }, { minutes: 480, billable: true },
      { minutes: 120, billable: false },
    ]);
    expect(b.hours).toBe(18);
    expect(b.billableHours).toBe(16);
    expect(b.share).toBeCloseTo(16 / 18, 6);
    expect(b.light).toBe('green');
  });
  it('yard-only time is honest red, and no time at all is pending', () => {
    expect(billable([{ minutes: 480, billable: false }]).light).toBe('red');
    expect(billable([]).share).toBeNull();
    expect(billable([]).light).toBe('pending');
  });
  it('costs labour at the standard rate', () => {
    expect(labourCostCents(90, 6800)).toBe(10200);
    expect(labourCostCents(-5, 6800)).toBe(0);
  });
});

describe('the week', () => {
  it('is Monday to Friday of the week holding the day', () => {
    expect(workWeek('2026-09-23')).toEqual(['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25']);
    expect(workWeek('2026-09-21')[0]).toBe('2026-09-21');
    expect(workWeek('2026-09-25')[0]).toBe('2026-09-21');
  });
  it('a weekend looks ahead to the coming week', () => {
    expect(workWeek('2026-09-26')[0]).toBe('2026-09-28');
    expect(workWeek('2026-09-27')[0]).toBe('2026-09-28');
  });
  it('refuses a nonsense day', () => expect(workWeek('not a day')).toEqual([]));
  it('labels days and weeks the way the design does', () => {
    expect(dayLabel('2026-09-21')).toBe('Mon 21');
    expect(weekLabel('2026-09-21')).toBe('Week of 21 September');
    expect(shiftWeek('2026-09-21', 1)).toBe('2026-09-28');
    expect(shiftWeek('2026-09-21', -1)).toBe('2026-09-14');
  });
});

describe('booking the crew', () => {
  it('somebody not clear to work cannot be booked', () => {
    expect(bookingRefusal({ clear: 'blocked', name: 'Marcus' }, false)).toMatch(/not clear to work/);
  });
  it('somebody not yet established can be booked — a missing record is not a recorded reason', () => {
    expect(bookingRefusal({ clear: 'unknown', name: 'Sione' }, false)).toBeNull();
  });
  it('not clear outranks everything else', () => {
    expect(bookingRefusal({ clear: 'blocked', name: 'Marcus' }, true)).toMatch(/not clear to work/);
  });
  it('one job per person per day', () => {
    expect(bookingRefusal({ clear: 'clear', name: 'Tom' }, true)).toMatch(/already booked/);
    expect(bookingRefusal({ clear: 'clear', name: 'Tom' }, false)).toBeNull();
  });
});

describe('the catalogue', () => {
  it('a supplier’s prices are current for thirty days, then a new file is due — amber, not red', () => {
    expect(priceFileState('2026-09-01', '2026-09-23')).toEqual({ state: 'Prices current', light: 'green' });
    expect(priceFileState('2026-08-15', '2026-09-23')).toEqual({ state: 'New file due', light: 'amber' });
    expect(priceFileState(null, '2026-09-23').light).toBe('pending');
  });
  it('flags an item nobody has used in twelve months', () => {
    expect(stale('2025-09-01T00:00:00Z', '2025-01-01T00:00:00Z', '2026-09-23')).toBe(true);
    expect(stale(null, '2026-01-01T00:00:00Z', '2026-09-23')).toBe(false);
    expect(stale('2026-09-01T00:00:00Z', '2020-01-01T00:00:00Z', '2026-09-23')).toBe(false);
  });
});

describe('a pasted price file', () => {
  it('reads name, unit and cost, or just name and cost', () => {
    expect(parsePriceFile('RCBO 20A 30mA, each, 42.60\nConduit 25mm, length, $6.10\nCable tie 300mm, 0.12')).toEqual({
      rows: [
        { name: 'RCBO 20A 30mA', unit: 'each', costCents: 4260 },
        { name: 'Conduit 25mm', unit: 'length', costCents: 610 },
        { name: 'Cable tie 300mm', unit: 'each', costCents: 12 },
      ],
      skipped: 0,
    });
  });
  it('keeps commas in a name, and reads tabs from a spreadsheet', () => {
    expect(parsePriceFile('TPS cable, 2.5mm, twin & earth, roll, 128.40').rows[0]).toEqual({ name: 'TPS cable, 2.5mm, twin & earth', unit: 'roll', costCents: 12840 });
    expect(parsePriceFile('Downlight\teach\t14.20').rows[0]).toEqual({ name: 'Downlight', unit: 'each', costCents: 1420 });
  });
  it('skips a header row or a line with no price, and says how many', () => {
    const r = parsePriceFile('Item, Unit, Cost\n\nJust a note\n, each, 5\nGPO, each, 9.85');
    expect(r.rows).toHaveLength(1);
    expect(r.skipped).toBe(3);
  });
});

describe('display', () => {
  it('writes money the Australian way', () => {
    expect(money(1860000)).toBe('$18,600');
    expect(money(0)).toBe('$0');
    expect(money(-16400)).toBe('-$164');
    expect(money2(985)).toBe('$9.85');
    expect(money2(12840)).toBe('$128.40');
  });
  it('reads typed dollars into cents, and refuses anything else', () => {
    expect(toCents('128.40')).toBe(12840);
    expect(toCents('$1,284')).toBe(128400);
    expect(toCents('')).toBeNull();
    expect(toCents('-3')).toBeNull();
    expect(toCents('abc')).toBeNull();
  });
  it('shows an unmeasured share as a dash', () => {
    expect(pctLabel(null)).toBe('—');
    expect(pctLabel(0.884)).toBe('88%');
  });
});

describe('the Jobs screen keeps the rules', () => {
  const read = (p: string) => readFileSync(p, 'utf8');
  const files = ['src/app/jobs/page.tsx', 'src/app/jobs/actions.ts', 'src/components/quote-builder.tsx', 'src/lib/jobs.ts', 'src/lib/jobs-data.ts'];
  const JOBS_TABLES = ['jobs', 'quotes', 'quote_lines', 'catalogue_items', 'labour_rates', 'kits', 'schedule_bookings', 'timesheet_entries'];

  it('names no vendor — categories only: your job system, your accounting system', () => {
    const vendors = /\b(simpro|xero|myob|quickbooks|servicem8|tradify|aroflo|rexel|mmem|cnw|bunnings|reece)\b/i;
    for (const f of files) expect(read(f), f).not.toMatch(vendors);
  });

  it('names no client of SPEC’s', () => {
    for (const f of files) expect(read(f), f).not.toMatch(/\bJBI\b/);
  });

  it('puts every Jobs table under the tenant policy, and every one carries its own tenant_id', () => {
    const rls = read('drizzle/0001_rls.sql');
    const schemaText = read('src/db/schema.ts');
    for (const t of JOBS_TABLES) {
      expect(rls, `${t} has no tenant policy`).toContain(`'${t}'`);
      const block = schemaText.slice(schemaText.indexOf(`pgTable('${t}'`));
      expect(block.slice(0, block.indexOf('.enableRLS()')), `${t} has no tenant_id`).toContain("text('tenant_id').notNull()");
    }
  });

  it('never trusts a price from the browser — the quote is re-priced on the server from the catalogue', () => {
    const actions = read('src/app/jobs/actions.ts');
    expect(actions).toMatch(/lineFrom\(w\.kind, w\.ref, ctx, w\.qty\)/);
    expect(actions).not.toMatch(/unitCostCents:\s*Number\(/);
  });

  it('checks Clear to Work on the server before a booking, not only on the grid', () => {
    expect(read('src/app/jobs/actions.ts')).toMatch(/bookingRefusal\(person, Boolean\(taken\)\)/);
  });
});
