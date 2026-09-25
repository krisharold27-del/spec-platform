import { ANGUS_SHIELD } from './virtual-gm-overview';

/**
 * The out-simple story on the front door at www.sitevipapp.com — the words, and which parts of it
 * are real today.
 *
 * Kris, 25 September: hero "Simple.", then Virtual GM + Virtual Admin, Claude recommends, Switch when
 * ready (with Angus Shield as the financial option), Make it simple every week, the Simple Guarantee,
 * and back into the problem box. Pure, so it is tested directly.
 *
 * ── The honesty rule ─────────────────────────────────────────────────────────────────────────────
 *
 * *"Only present a feature as available if it actually works on the site now."* So every section
 * that describes a feature carries a `live` flag and, when live, the `evidence` route a signed-in
 * business uses it at. `tests/out-simple.test.ts` fails if a flag is on without that route existing
 * — the same rule `lib/coverage` holds the 38 to. A section that is not live is still on the page,
 * with an honest "Arriving now" in place of anything you could press: no dead buttons.
 *
 * Switching a flag on is one line here, once the feature ships.
 *
 * Angus Shield is not flagged by hand at all: it reads `ANGUS_SHIELD.switchable`, the same value the
 * switch gate inside the product reads, so the front door can never promise it before /switch can
 * deliver it.
 *
 * ── Categories, never vendors ────────────────────────────────────────────────────────────────────
 *
 * The brief names two accounting products. The product names none (CLAUDE.md, the never list), so
 * they are written as the kind of system they are: your accounting system, your payroll.
 */

export const OUT_SIMPLE_HERO = {
  word: 'Simple.',
  line: 'Your GM and your admin department, run virtually.',
  push: 'Don’t pay three hundred grand for a GM. Just use SPEC.',
} as const;

export type FeatureKey = 'virtual_gm' | 'recommends' | 'switch' | 'angus_shield' | 'make_it_simple' | 'guarantee';

export interface Feature {
  key: FeatureKey;
  /** True only while a signed-in business can actually use it. */
  live: boolean;
  /** The route it works at. Required whenever `live` is true. */
  evidence?: string;
}

/**
 * The switches. Kept apart from the words so turning one on is a one-line change and a reviewable one.
 *
 * As of 25 September: Virtual GM (/virtual-gm), Claude recommends (the labour-rate card on
 * /virtual-gm and the Jobs catalogue) and Switch when ready (/switch, with its Simple Guarantee claim)
 * are deployed. The weekly one-page "Make it simple" report is not built yet. Angus Shield keeps no
 * books yet, so it is not switchable.
 */
export const FEATURES: Record<FeatureKey, Feature> = {
  virtual_gm: { key: 'virtual_gm', live: true, evidence: '/virtual-gm' },
  recommends: { key: 'recommends', live: true, evidence: '/virtual-gm' },
  switch: { key: 'switch', live: true, evidence: '/switch' },
  angus_shield: { key: 'angus_shield', live: ANGUS_SHIELD.switchable, evidence: '/switch' },
  make_it_simple: { key: 'make_it_simple', live: false },
  guarantee: { key: 'guarantee', live: true, evidence: '/switch' },
};

export const isLive = (key: FeatureKey): boolean => FEATURES[key].live;

/** What a section says in place of a button while its feature is still being built. */
export const ARRIVING = 'Arriving now';

/** (2) Virtual GM + Virtual Admin Department. */
export const VIRTUAL_TEAM = {
  heading: 'A virtual GM and a virtual admin department. SPEC runs both.',
  gm: {
    title: 'The GM thinking',
    line: 'Every morning it reads the whole business and tells you what to pull this week.',
    items: ['Safety', 'People', 'Earnings', 'Compliance'],
  },
  admin: {
    title: 'The admin',
    line: 'The paperwork that eats your nights, done in one place.',
    items: ['Payroll', 'Invoicing', 'Bills', 'Compliance paperwork', 'HR admin', 'Reporting'],
  },
} as const;

/** (3) Claude recommends. The example is an example, and says so on the page. */
export const RECOMMENDS = {
  heading: 'Claude recommends. You decide.',
  line: 'Every decision is backed by your own numbers — not a guess, not a rule of thumb.',
  example: {
    headline: 'Set your labour rate at $105/hr — here’s why.',
    facts: [
      'What a paid hour really costs you, once super, leave, tools, vans and the office are in',
      'The hours your crew actually bills, from their own timesheets',
      'The margin a healthy trade business keeps',
    ],
    ask: 'Ready?',
    done: 'Done. Your price book is updated, and the decision is logged with the numbers behind it.',
    later: 'No worries. It stays here, and gets checked again as the numbers move.',
  },
} as const;

/** (4) Switch when ready. */
export const SWITCH_STORY = {
  heading: 'Switch when you’re ready. Not before.',
  steps: [
    { title: 'Day one, nothing changes', line: 'Keep your accounting system, your payroll and whatever else you run.' },
    { title: 'SPEC learns them', line: 'In the background, it checks your own data against how SPEC would do it.' },
    { title: 'It tells you when it’s safe', line: 'Plain words: ready, or exactly what’s still missing.' },
    { title: 'One toggle', line: 'Switch it over. Don’t like it? Undo puts everything back.' },
  ],
  nots: ['No $10k–$15k setup', 'No consultants', 'No migration project'],
} as const;

/** Angus Shield — the financial option inside Switch when ready. */
export const ANGUS_STORY = {
  name: 'Angus Shield',
  tagline: 'Stay in the black.',
  line: 'SPEC’s own books and payroll. When it’s ready for your business, it runs side by side with your current system first, and you only switch when the two match.',
} as const;

/** (5) Make it simple, every week. */
export const MAKE_IT_SIMPLE = {
  heading: 'Make it simple, every week.',
  line: 'Before your COGS meeting, Claude hands you one page: what got simpler this week, and the next three things to simplify.',
  sample: {
    simpler: 'Timesheets now land on the job as they happen — no Friday chase.',
    next: ['Quotes still retyped into invoices', 'Two places to book leave', 'Tickets tracked in a spreadsheet'],
  },
} as const;

/** (6) The Simple Guarantee. */
export const GUARANTEE_STORY = {
  heading: 'The Simple Guarantee.',
  line: 'If it’s not simple, that month is free.',
  how: 'Tell us inside SPEC where it wasn’t simple. It gets logged, it gets fixed, and that month comes off your bill.',
} as const;

/** (7) Back into the problem box. */
export const CTA = {
  heading: 'Got one thing that keeps coming back?',
  button: 'Tell us about it',
  href: '#problem',
} as const;
