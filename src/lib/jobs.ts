/**
 * Jobs — the arithmetic, and nothing else.
 *
 * Every number the Jobs screen shows is worked out here: what a quote line sells for, what a kit is
 * made of, what markup and GST do to the total, what margin that leaves against the benchmark, and
 * what share of somebody's week was billable. Pure functions over plain values, so the same quote
 * always prices the same way and every rule is proven in tests/jobs.test.ts rather than by eye.
 *
 * ── Money is whole cents ──────────────────────────────────────────────────────────────────────────
 *
 * Every amount is an integer number of cents. A line is rounded to the cent once, when it is priced;
 * totals are sums of rounded lines; GST is rounded once, on the total. That is how an invoice is
 * read line by line, and it means the lines always add up to the total a client sees.
 *
 * ── A quote line carries its own prices ───────────────────────────────────────────────────────────
 *
 * A line is a snapshot, not a pointer: the cost and charge rates are copied onto it from the
 * catalogue when it is added. A supplier price file that lands next week must never re-price a quote
 * that has already gone out — nothing recalculates history — so pricing reads only the line.
 */

/* ── The pipeline ─────────────────────────────────────────────────────────────────────────────── */

export type StageKey = 'enquiry' | 'quoted' | 'won' | 'scheduled' | 'onsite' | 'invoiced' | 'paid';

export const STAGES: { key: StageKey; label: string; next: string }[] = [
  { key: 'enquiry', label: 'Enquiry', next: 'Build the quote' },
  { key: 'quoted', label: 'Quoted', next: 'Mark as won' },
  { key: 'won', label: 'Won', next: 'Book the crew' },
  { key: 'scheduled', label: 'Scheduled', next: 'Start on site' },
  { key: 'onsite', label: 'On site', next: 'Job done, invoice it' },
  { key: 'invoiced', label: 'Invoiced', next: 'Mark as paid' },
  { key: 'paid', label: 'Paid', next: 'Closed' },
];

export const isStage = (s: string): s is StageKey => STAGES.some(x => x.key === s);

/** The stage after this one, or null at the end. A job never skips a stage and never goes back here. */
export function nextStage(stage: string): StageKey | null {
  const i = STAGES.findIndex(s => s.key === stage);
  return i >= 0 && i < STAGES.length - 1 ? STAGES[i + 1].key : null;
}

export const stageLabel = (stage: string): string => STAGES.find(s => s.key === stage)?.label ?? 'Enquiry';

/** Live work: won and not yet finished. */
export const LIVE_STAGES: StageKey[] = ['won', 'scheduled', 'onsite'];

/**
 * An enquiry from one line of text: "Sam Lee, switchboard upgrade, Balmain".
 *
 * Client, what, where — in the order somebody says it on the phone. One part is taken as the work
 * rather than the client, because "switchboard upgrade" on its own is a job and "Sam Lee" on its own
 * is not. A missing site is left for later rather than invented.
 */
export function parseEnquiry(text: string): { client: string; title: string; site: string } | null {
  const parts = text.split(',').map(s => s.trim()).filter(Boolean);
  if (!parts.length) return null;
  if (parts.length === 1) return { client: 'New client', title: parts[0].slice(0, 160), site: '' };
  return {
    client: parts[0].slice(0, 120),
    title: parts[1].slice(0, 160),
    site: parts.slice(2).join(', ').slice(0, 160),
  };
}

/**
 * The next reference in a series: J-1001, J-1002 … or Q-1001 …
 *
 * Read from the highest number already used rather than from a count, so deleting a job never makes
 * two jobs share a number.
 */
export function nextRef(prefix: string, existing: readonly string[], start = 1001): string {
  let max = start - 1;
  for (const r of existing) {
    const m = r.match(new RegExp(`^${prefix}-(\\d+)$`));
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${prefix}-${max + 1}`;
}

/* ── The rules the business is held to ─────────────────────────────────────────────────────────── */

/** The markups a quote is offered at. The business picks one per quote. */
export const MARKUPS = [25, 35, 45] as const;
export const DEFAULT_MARKUP = 35;
/** Goods and services tax, Australia. */
export const GST_RATE = 0.1;
/** Gross margin a trade quote is measured against. A benchmark, not a target SPEC sets. */
export const MARGIN_BENCHMARK = 0.4;
/** Share of paid hours that should be on a client's job. */
export const BILLABLE_TARGET = 0.86;

export type Light = 'green' | 'amber' | 'red' | 'pending';

/**
 * A margin, as a light. Nothing to measure is pending — never red.
 *
 * At or above the benchmark is green; within ten points under it is amber; further under is red.
 */
export function marginLight(margin: number | null, benchmark = MARGIN_BENCHMARK): Light {
  if (margin === null || !Number.isFinite(margin)) return 'pending';
  if (margin >= benchmark - 1e-9) return 'green';
  if (margin >= benchmark - 0.1 - 1e-9) return 'amber';
  return 'red';
}

/** Billable share as a light: at or above target green, within eleven points amber, else red. */
export function billableLight(share: number | null, target = BILLABLE_TARGET): Light {
  if (share === null || !Number.isFinite(share)) return 'pending';
  if (share >= target - 1e-9) return 'green';
  if (share >= target - 0.11 - 1e-9) return 'amber';
  return 'red';
}

/* ── Catalogue, kits and labour ────────────────────────────────────────────────────────────────── */

export interface CatalogueItem {
  id: string;
  name: string;
  unit: string;
  supplier: string;
  costCents: number;
}

export interface LabourRate {
  id: string;
  name: string;
  /** What an hour costs the business. */
  costCents: number;
  /** What an hour is charged at. */
  chargeCents: number;
}

export interface KitComponent { itemId: string; qty: number }

export interface Kit {
  id: string;
  name: string;
  components: KitComponent[];
  /** Hours of labour to install one kit. */
  labourHours: number;
  /** The rate those hours are priced at. Null means the business's first labour rate. */
  labourRateId: string | null;
  /** Sundries not worth listing — fixings, labels, lugs. */
  extraCostCents: number;
}

/**
 * What one kit is made of, in cost.
 *
 * A component whose item has left the catalogue is reported by id rather than priced at zero: a kit
 * that quietly got cheaper because an item was deleted is exactly the mistake that loses money.
 */
export function expandKit(kit: Kit, items: readonly CatalogueItem[]): { costCents: number; missing: string[] } {
  let cost = kit.extraCostCents;
  const missing: string[] = [];
  for (const c of kit.components) {
    const item = items.find(i => i.id === c.itemId);
    if (!item) { missing.push(c.itemId); continue; }
    cost += item.costCents * c.qty;
  }
  return { costCents: Math.round(cost), missing };
}

/** Components safely read from their stored JSON. Anything malformed is dropped, never guessed at. */
export function parseComponents(json: string | null | undefined): KitComponent[] {
  try {
    const raw = JSON.parse(json ?? '[]');
    if (!Array.isArray(raw)) return [];
    return raw
      .filter(c => c && typeof c.itemId === 'string' && Number.isFinite(Number(c.qty)) && Number(c.qty) > 0)
      .map(c => ({ itemId: String(c.itemId), qty: Number(c.qty) }));
  } catch {
    return [];
  }
}

/* ── Quote lines ──────────────────────────────────────────────────────────────────────────────── */

export type LineKind = 'item' | 'kit' | 'labour';

/** A quote line: everything needed to price it, copied at the moment it was added. */
export interface QuoteLine {
  kind: LineKind;
  /** The catalogue item, kit or labour rate it came from. */
  ref: string;
  name: string;
  /** For an item, or a single kit's materials: what one unit costs. Zero for labour. */
  unitCostCents: number;
  /** Labour hours per unit: 1 for a labour line (qty is then hours), the kit's hours for a kit. */
  hours: number;
  rateCostCents: number;
  rateChargeCents: number;
  qty: number;
}

/**
 * A line, built from the catalogue. Null when the thing it names is not there — a form anybody can
 * edit must never be able to add a line priced from nothing.
 */
export function lineFrom(
  kind: LineKind,
  ref: string,
  ctx: { items: readonly CatalogueItem[]; kits: readonly Kit[]; rates: readonly LabourRate[] },
  qty = 1,
): QuoteLine | null {
  if (!(qty > 0)) return null;
  if (kind === 'item') {
    const it = ctx.items.find(i => i.id === ref);
    return it ? { kind, ref, name: it.name, unitCostCents: it.costCents, hours: 0, rateCostCents: 0, rateChargeCents: 0, qty } : null;
  }
  if (kind === 'labour') {
    const r = ctx.rates.find(x => x.id === ref);
    return r ? { kind, ref, name: r.name, unitCostCents: 0, hours: 1, rateCostCents: r.costCents, rateChargeCents: r.chargeCents, qty } : null;
  }
  const k = ctx.kits.find(x => x.id === ref);
  if (!k) return null;
  const rate = ctx.rates.find(r => r.id === k.labourRateId) ?? ctx.rates[0];
  // A kit with labour and no rate to price it at cannot be quoted honestly.
  if (k.labourHours > 0 && !rate) return null;
  return {
    kind, ref, name: k.name,
    unitCostCents: expandKit(k, ctx.items).costCents,
    hours: k.labourHours,
    rateCostCents: rate?.costCents ?? 0,
    rateChargeCents: rate?.chargeCents ?? 0,
    qty,
  };
}

export interface PricedLine {
  materialCostCents: number;
  materialSellCents: number;
  labourCostCents: number;
  labourSellCents: number;
  hours: number;
  sellCents: number;
  costCents: number;
}

/**
 * One line, priced. Markup applies to materials only; labour is sold at its charge rate, which
 * already carries its own margin. A kit is both: its materials marked up, its hours at the rate.
 */
export function priceLine(line: QuoteLine, markupPct: number): PricedLine {
  const qty = Math.max(0, line.qty);
  const materialCost = line.kind === 'labour' ? 0 : line.unitCostCents * qty;
  const materialSell = materialCost * (1 + markupPct / 100);
  const hours = line.kind === 'item' ? 0 : line.hours * qty;
  const labourCost = hours * line.rateCostCents;
  const labourSell = hours * line.rateChargeCents;
  const materialCostCents = Math.round(materialCost);
  const materialSellCents = Math.round(materialSell);
  const labourCostCents = Math.round(labourCost);
  const labourSellCents = Math.round(labourSell);
  return {
    materialCostCents, materialSellCents, labourCostCents, labourSellCents, hours,
    sellCents: materialSellCents + labourSellCents,
    costCents: materialCostCents + labourCostCents,
  };
}

export interface QuoteTotals {
  lines: PricedLine[];
  materialCostCents: number;
  materialSellCents: number;
  labourCostCents: number;
  labourSellCents: number;
  hours: number;
  exGstCents: number;
  gstCents: number;
  incGstCents: number;
  costCents: number;
  /** Gross margin on the ex-GST price; null for an empty quote. */
  margin: number | null;
  light: Light;
  meetsBenchmark: boolean;
}

/** The whole quote. */
export function priceQuote(lines: readonly QuoteLine[], markupPct: number, benchmark = MARGIN_BENCHMARK): QuoteTotals {
  const priced = lines.map(l => priceLine(l, markupPct));
  const sum = (f: (p: PricedLine) => number) => priced.reduce((a, p) => a + f(p), 0);
  const materialCostCents = sum(p => p.materialCostCents);
  const materialSellCents = sum(p => p.materialSellCents);
  const labourCostCents = sum(p => p.labourCostCents);
  const labourSellCents = sum(p => p.labourSellCents);
  const exGstCents = materialSellCents + labourSellCents;
  const gstCents = Math.round(exGstCents * GST_RATE);
  const costCents = materialCostCents + labourCostCents;
  const margin = exGstCents > 0 ? (exGstCents - costCents) / exGstCents : null;
  return {
    lines: priced,
    materialCostCents, materialSellCents, labourCostCents, labourSellCents,
    hours: Math.round(sum(p => p.hours) * 100) / 100,
    exGstCents, gstCents, incGstCents: exGstCents + gstCents, costCents,
    margin,
    light: marginLight(margin, benchmark),
    meetsBenchmark: margin !== null && margin >= benchmark - 1e-9,
  };
}

/** Add one of something: an existing line goes up by one, a new one is appended. */
export function addToLines(lines: readonly QuoteLine[], line: QuoteLine): QuoteLine[] {
  const i = lines.findIndex(l => l.kind === line.kind && l.ref === line.ref);
  if (i < 0) return [...lines, line];
  return lines.map((l, j) => (j === i ? { ...l, qty: l.qty + line.qty } : l));
}

/** Change a line's quantity by a step; a line that reaches zero is removed rather than kept at nothing. */
export function stepLine(lines: readonly QuoteLine[], index: number, step: number): QuoteLine[] {
  return lines
    .map((l, j) => (j === index ? { ...l, qty: Math.round((l.qty + step) * 100) / 100 } : l))
    .filter(l => l.qty > 0);
}

/** What the builder says under the price. A proposal, never a block — the leader decides. */
export function marginAdvice(t: QuoteTotals, benchmark = MARGIN_BENCHMARK): string {
  if (t.margin === null) return 'Add a line and the price builds itself.';
  const pct = Math.round(benchmark * 100);
  if (t.meetsBenchmark) return `At or above the ${pct}% benchmark.`;
  return `Under the ${pct}% benchmark. Try a higher markup or check the labour hours before it goes out.`;
}

/* ── A job's margin, while it is running ───────────────────────────────────────────────────────── */

/**
 * Margin on a job so far: the quoted value against labour and materials recorded.
 *
 * Null until there is something to measure. A job with no costs on it has not got a 100% margin —
 * it has not been measured, and pending is never red, nor flatteringly green.
 */
export function jobMargin(valueCents: number, labourCents: number, materialsCents: number | null): number | null {
  if (!(valueCents > 0)) return null;
  const cost = labourCents + (materialsCents ?? 0);
  if (cost <= 0) return null;
  return (valueCents - cost) / valueCents;
}

export interface JobLike {
  stage: string;
  valueCents: number;
  margin: number | null;
}

/** The four numbers across the top of the pipeline, from the jobs themselves. */
export function pipelineStats(jobs: readonly JobLike[]) {
  const quoted = jobs.filter(j => j.stage === 'quoted');
  const live = jobs.filter(j => (LIVE_STAGES as string[]).includes(j.stage));
  const owed = jobs.filter(j => j.stage === 'invoiced');
  const measured = jobs.filter(j => j.margin !== null);
  return {
    quotesOutCents: quoted.reduce((a, j) => a + j.valueCents, 0),
    quotesOut: quoted.length,
    onBooksCents: live.reduce((a, j) => a + j.valueCents, 0),
    live: live.length,
    owedCents: owed.reduce((a, j) => a + j.valueCents, 0),
    owed: owed.length,
    averageMargin: measured.length ? measured.reduce((a, j) => a + (j.margin as number), 0) / measured.length : null,
    measured: measured.length,
  };
}

/* ── Time ─────────────────────────────────────────────────────────────────────────────────────── */

/**
 * Minutes between Start and Finish ("07:00" and "15:30"). Null when either is missing or the finish
 * is not after the start — a shift that ends before it begins is a typo, not negative hours.
 */
export function minutesBetween(start: string | null | undefined, finish: string | null | undefined): number | null {
  const toMin = (t: string) => {
    const m = t.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return NaN;
    const h = Number(m[1]), mi = Number(m[2]);
    return h < 24 && mi < 60 ? h * 60 + mi : NaN;
  };
  if (!start || !finish) return null;
  const a = toMin(start), b = toMin(finish);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return null;
  return b - a;
}

export interface TimeEntry { minutes: number; billable: boolean }

/** Hours and billable share for a set of entries. Share is null with no hours — pending, not zero. */
export function billable(entries: readonly TimeEntry[]): { hours: number; billableHours: number; share: number | null; light: Light } {
  const total = entries.reduce((a, e) => a + Math.max(0, e.minutes), 0);
  const bill = entries.filter(e => e.billable).reduce((a, e) => a + Math.max(0, e.minutes), 0);
  const share = total > 0 ? bill / total : null;
  return {
    hours: Math.round((total / 60) * 100) / 100,
    billableHours: Math.round((bill / 60) * 100) / 100,
    share,
    light: billableLight(share),
  };
}

/** Labour cost to date on a job: hours on it at the business's standard cost rate. */
export function labourCostCents(minutes: number, rateCostCents: number): number {
  return Math.round((Math.max(0, minutes) / 60) * rateCostCents);
}

/* ── The week ─────────────────────────────────────────────────────────────────────────────────── */

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Monday to Friday of the week holding `day` (an ISO date). Weekends roll forward to next week. */
export function workWeek(day: string): string[] {
  const d = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return [];
  const dow = d.getUTCDay();
  const offset = dow === 0 ? 1 : dow === 6 ? 2 : 1 - dow;
  const monday = new Date(d.getTime() + offset * 86_400_000);
  return [0, 1, 2, 3, 4].map(i => iso(new Date(monday.getTime() + i * 86_400_000)));
}

/** "Mon 21" */
export function dayLabel(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  return `${DAY_NAMES[d.getUTCDay()]} ${d.getUTCDate()}`;
}

/** "Week of 21 September" */
export function weekLabel(monday: string): string {
  const d = new Date(`${monday}T00:00:00Z`);
  return `Week of ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** The Monday a week away from this one, either way. */
export function shiftWeek(monday: string, weeks: number): string {
  const d = new Date(`${monday}T00:00:00Z`);
  return iso(new Date(d.getTime() + weeks * 7 * 86_400_000));
}

/**
 * Can this person be booked on this day? A reason when not, null when they can.
 *
 * Clear to Work is a hard gate: somebody who is NOT clear cannot be put on a job at all, whatever
 * the job. Somebody not yet established — pencilled onto the chart, nothing recorded against them —
 * can be booked, and the grid says so in grey: most of a trade business's crew are names on the
 * chart long before they are seats, and refusing all of them would make the schedule unusable
 * rather than safe. What blocks is a recorded reason, not an absence of records.
 */
export function bookingRefusal(person: { clear: 'clear' | 'blocked' | 'unknown'; name: string }, alreadyBooked: boolean): string | null {
  if (person.clear === 'blocked') return `${person.name} is not clear to work, so cannot be booked until that is fixed.`;
  if (alreadyBooked) return `${person.name} is already booked that day.`;
  return null;
}

/* ── Supplier price files ─────────────────────────────────────────────────────────────────────── */

/** How old a supplier's prices are before a new file is due. */
export const PRICE_FILE_DAYS = 30;

/** Whether a supplier's newest price is current, or a new file is due. Amber at worst — it is a to-do. */
export function priceFileState(latestPriceDate: string | null, today: string): { state: string; light: Light } {
  if (!latestPriceDate) return { state: 'No price date', light: 'pending' };
  const age = (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${latestPriceDate}T00:00:00Z`)) / 86_400_000;
  if (!Number.isFinite(age)) return { state: 'No price date', light: 'pending' };
  return age > PRICE_FILE_DAYS ? { state: 'New file due', light: 'amber' } : { state: 'Prices current', light: 'green' };
}

/**
 * A supplier's price file, pasted in: one item per line, "name, unit, cost" or "name, cost".
 *
 * The cost is always the last field, so a name with a comma in it survives. A line whose cost is not
 * an amount — a header row, a note — is skipped and counted, never guessed at: a price file is where
 * a wrong number quietly becomes every quote for a month.
 */
export function parsePriceFile(text: string): { rows: { name: string; unit: string; costCents: number }[]; skipped: number } {
  const rows: { name: string; unit: string; costCents: number }[] = [];
  let skipped = 0;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const parts = line.split(/[,\t]/).map(p => p.trim());
    const cost = parts.length >= 2 ? toCents(parts[parts.length - 1]) : null;
    if (cost === null) { skipped++; continue; }
    const unit = parts.length >= 3 ? parts[parts.length - 2] : 'each';
    const name = parts.slice(0, parts.length >= 3 ? -2 : -1).join(', ').trim();
    if (!name) { skipped++; continue; }
    rows.push({ name: name.slice(0, 160), unit: (unit || 'each').slice(0, 30), costCents: cost });
  }
  return { rows, skipped };
}

/** Items not quoted or used in twelve months — the ones SPEC suggests retiring to keep the list lean. */
export function stale(lastUsedAt: string | null, createdAt: string, today: string): boolean {
  const from = lastUsedAt ?? createdAt;
  const age = (Date.parse(`${today}T00:00:00Z`) - Date.parse(from)) / 86_400_000;
  return Number.isFinite(age) && age > 365;
}

/* ── Display ──────────────────────────────────────────────────────────────────────────────────── */

/** "$1,234" — whole dollars, for totals. */
export const money = (cents: number): string => {
  const d = Math.round(cents / 100);
  return `${d < 0 ? '-' : ''}$${Math.abs(d).toLocaleString('en-AU')}`;
};

/** "$12.34" — to the cent, for unit prices. */
export const money2 = (cents: number): string =>
  `${cents < 0 ? '-' : ''}$${(Math.abs(cents) / 100).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Dollars typed into a form, to cents. Null for anything that is not a non-negative amount. */
export function toCents(raw: string | null | undefined): number | null {
  const s = String(raw ?? '').replace(/[$,\s]/g, '');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}

export const pctLabel = (share: number | null): string => (share === null ? '—' : `${Math.round(share * 100)}%`);

/* ── The worked example ───────────────────────────────────────────────────────────────────────── */

/**
 * The Switchboard upgrade, from the design — shown as a worked example, never as the business's own.
 *
 * It exists so the quote builder can be read before a business has typed a single catalogue item:
 * a kit, four power points and twelve hours of labour, priced the way the builder prices. The
 * prices are illustrative and the page says so; nothing here is ever written to a business's data.
 */
export const WORKED_EXAMPLE: { title: string; lines: QuoteLine[]; markupPct: number } = {
  title: 'Switchboard upgrade',
  markupPct: 35,
  lines: [
    { kind: 'kit', ref: 'x-kit', name: 'Switchboard upgrade (36 pole, 8 RCBOs)', unitCostCents: 21800 + 8 * 4260 + 3500, hours: 6, rateCostCents: 6800, rateChargeCents: 12000, qty: 1 },
    { kind: 'item', ref: 'x-gpo', name: 'Double power point, white', unitCostCents: 985, hours: 0, rateCostCents: 0, rateChargeCents: 0, qty: 4 },
    { kind: 'labour', ref: 'x-lic', name: 'Licensed electrician', unitCostCents: 0, hours: 1, rateCostCents: 6800, rateChargeCents: 12000, qty: 4 },
    { kind: 'labour', ref: 'x-app', name: 'Apprentice', unitCostCents: 0, hours: 1, rateCostCents: 3200, rateChargeCents: 7500, qty: 8 },
  ],
};

/* ── The margin slipping, while there is still time to do something ──────────────────────────── */

/**
 * A job whose margin has fallen below what it was quoted at — said while the job is still running.
 *
 * ── Why this is worth its own function ───────────────────────────────────────────────────────────
 *
 * The margin was already computed and shown. What was missing is the only part that changes an
 * outcome: **saying so before the job finishes.** A margin reported on a finished job is a post
 * mortem. The same number on Tuesday, while there are still three days of labour to go, is a
 * decision — put a second person on it, stop the unbilled extras, or raise the variation that was
 * never raised.
 *
 * So this only fires on a LIVE job. A job that is invoiced or paid has had its answer; a job still
 * being quoted has no actuals to slip against.
 */
export interface MarginSlip {
  /** True when this needs saying now. */
  slipped: boolean;
  light: Light;
  says: string;
}

export function marginSlip(
  job: { stage: string; margin: number | null; valueCents: number },
  benchmark = MARGIN_BENCHMARK,
): MarginSlip {
  const quiet: MarginSlip = { slipped: false, light: 'pending', says: '' };
  if (!LIVE_STAGES.includes(job.stage as StageKey)) return quiet;
  if (job.margin === null || !Number.isFinite(job.margin)) return quiet;
  if (job.valueCents <= 0) return quiet;

  const pct = Math.round(job.margin * 100);
  const target = Math.round(benchmark * 100);
  if (job.margin >= benchmark - 1e-9) return { slipped: false, light: 'green', says: `${pct}% margin, on the ${target}% benchmark.` };

  /*
    Under water is a different sentence from merely thin. A job running at a loss needs somebody to
    stop and look today; one at 32% against a 40% benchmark needs the variation raising.
  */
  if (job.margin < 0) {
    return {
      slipped: true, light: 'red',
      says: `Running at a loss — ${pct}%. Stop and look at this one today.`,
    };
  }
  return {
    slipped: true,
    light: job.margin >= benchmark - 0.1 ? 'amber' : 'red',
    says: `${pct}% margin against the ${target}% benchmark, and the job is still running. Raise the variation now, not at invoicing.`,
  };
}

/** How many live jobs have slipped — the figure the Jobs board leads on. */
export const slippedCount = (
  jobs: readonly { stage: string; margin: number | null; valueCents: number }[],
): number => jobs.filter(j => marginSlip(j).slipped).length;
