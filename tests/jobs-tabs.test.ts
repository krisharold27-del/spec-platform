import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/*
  ── The Jobs tabs, held to the design file ───────────────────────────────────────────────────────

  Design 17 takes Jobs from nine tabs to twenty, under three groups — Win the work, Do the work, Get
  paid and keep them. The keys are not decoration: every deep link in the product is built from them
  (My Page's "Your job today" steps open `?tab=`, the nav sends CRM to `?tab=customers`), so a tab
  renamed on one side and not the other is a set of links that quietly go nowhere.

  So this reads `designs/SPEC Jobs.dc.html` and fails if the product and the design disagree. It is
  the same discipline as the design-phrase check in `npm run check`, narrowed to the one list that
  addresses are built from.
*/

const design = readFileSync('designs/SPEC Jobs.dc.html', 'utf8');
const page = readFileSync('src/app/jobs/page.tsx', 'utf8');

/** The design's own arrays, read rather than retyped. */
function designGroups(): { key: string; label: string; tabs: string[] }[] {
  const block = design.slice(design.indexOf('GROUPS = ['));
  const body = block.slice(0, block.indexOf('];'));
  return [...body.matchAll(/\{ key: '([a-z]+)', label: '([^']+)', tabs: \[([^\]]+)\] \}/g)]
    .map(m => ({
      key: m[1],
      label: m[2],
      tabs: [...m[3].matchAll(/'([a-z]+)'/g)].map(t => t[1]),
    }));
}

function designTabs(): { key: string; label: string }[] {
  const block = design.slice(design.indexOf('TABS = ['));
  const body = block.slice(0, block.indexOf('];'));
  return [...body.matchAll(/\{ key: '([a-z]+)', label: '([^']+)' \}/g)]
    .map(m => ({ key: m[1], label: m[2].replace(/&amp;/g, '&') }));
}

/** What the product has, read out of the page the same way. */
function builtTabs(): { key: string; label: string }[] {
  const block = page.slice(page.indexOf('const TABS = ['));
  const body = block.slice(0, block.indexOf('] as const;'));
  return [...body.matchAll(/\{ key: '([a-z]+)', label: '([^']+)' \}/g)]
    .map(m => ({ key: m[1], label: m[2] }));
}

function builtGroups(): { key: string; label: string; tabs: string[] }[] {
  const block = page.slice(page.indexOf('export const TAB_GROUPS = ['));
  const body = block.slice(0, block.indexOf('] as const;'));
  return [...body.matchAll(/\{ key: '([a-z]+)', label: '([^']+)', tabs: \[([^\]]+)\] \}/g)]
    .map(m => ({
      key: m[1],
      label: m[2],
      tabs: [...m[3].matchAll(/'([a-z]+)'/g)].map(t => t[1]),
    }));
}

/*
  ── Tabs added after the design, on purpose ─────────────────────────────────────────────────────

  The design is the baseline, not the ceiling — but "the product may differ from the design" is how
  a design stops being followed at all. So an addition is allowed and has to be NAMED, with who
  asked for it. Anything else still fails, and every tab the design has must still be there.
*/
const ADDED_SINCE: { key: string; label: string; why: string }[] = [
  {
    key: 'growth', label: 'Keep work coming',
    why: 'Kris, 24 September, after the three streams were mapped and Growth came out the least automatic of them at 30% of steps: "growth automation gap - thats our weakest and most important". Quotes that chase themselves, tenders counting down, and customers past their own rhythm — all of it already existed on other tabs as lists somebody had to open, which is the thing that does not happen in the week everybody is flat out.',
  },
  {
    key: 'certificates', label: 'Certificates',
    why: 'From the workflow review, 25 September: a job finishes, the customer signs it off on the phone, the invoice goes — and the certificate of compliance is done somewhere else entirely, on a different system or a pad in the ute. So the one document that proves the work was lawful is the one document the job does not hold, and the first time anybody looks for it is an insurance claim, a fire, a regulator or a builder audit. Kris named it as a gap worth closing first.',
  },
];

describe('the Jobs tabs match the design', () => {
  it('reads both sides, rather than quietly comparing nothing', () => {
    expect(designTabs().length, 'the design’s TABS').toBeGreaterThan(15);
    expect(designGroups().length, 'the design’s GROUPS').toBe(3);
    expect(builtTabs().length, 'the product’s TABS').toBeGreaterThan(15);
  });

  it('HAS EVERY TAB THE DESIGN HAS, by key', () => {
    const built = new Set(builtTabs().map(t => t.key));
    const missing = designTabs().map(t => t.key).filter(k => !built.has(k));
    expect(missing, `the design has these and the product does not: ${missing.join(', ')}`).toEqual([]);
  });

  it('AND ADDS NOTHING THE DESIGN DOES NOT HAVE WITHOUT SAYING WHY', () => {
    const fromDesign = new Set(designTabs().map(t => t.key));
    const extra = builtTabs().map(t => t.key).filter(k => !fromDesign.has(k));
    expect(extra.sort()).toEqual(ADDED_SINCE.map(a => a.key).sort());
    for (const a of ADDED_SINCE) {
      /* A reason short enough to be a shrug is not a reason. */
      expect(a.why.length, `${a.key} needs a real reason`).toBeGreaterThan(80);
      expect(a.why, `${a.key} does not say who asked for it`).toMatch(/Kris|design/);
    }
  });

  it('AND CALLS EACH ONE WHAT THE DESIGN CALLS IT', () => {
    const want = new Map(designTabs().map(t => [t.key, t.label]));
    const added = new Map(ADDED_SINCE.map(a => [a.key, a.label]));
    for (const t of builtTabs()) {
      expect(t.label, t.key).toBe(want.get(t.key) ?? added.get(t.key));
    }
  });

  it('groups them the same way, in the same order', () => {
    /* An added tab joins a group the design already has; it never invents one. */
    const added = new Set(ADDED_SINCE.map(a => a.key));
    const stripped = builtGroups().map(g => ({ ...g, tabs: g.tabs.filter(t => !added.has(t)) }));
    expect(stripped).toEqual(designGroups());
  });

  /*
    The order of the groups is the order work flows — win it, do it, get paid. It is the one thing
    on this screen a tradie reads as a sentence, so it is asserted rather than left to a sort.
  */
  it('AND THE GROUPS READ IN THE ORDER WORK FLOWS', () => {
    expect(builtGroups().map(g => g.label))
      .toEqual(['Win the work', 'Do the work', 'Get paid and keep them']);
  });

  /* Every tab belongs to exactly one group, or it is a screen nothing can reach. */
  it('LEAVES NO TAB UNREACHABLE, and puts none in two places', () => {
    const inGroups = builtGroups().flatMap(g => g.tabs);
    expect([...inGroups].sort()).toEqual(builtTabs().map(t => t.key).sort());
    expect(new Set(inGroups).size, 'a tab in two groups').toBe(inGroups.length);
  });

  /* The default is the middle of the day, not the start of the sales process. */
  it('opens on Do the work → Jobs board', () => {
    expect(page).toMatch(/one\(sp\.tab\)[^;]*'pipeline'|'pipeline'[^;]*one\(sp\.tab\)/);
  });
});
