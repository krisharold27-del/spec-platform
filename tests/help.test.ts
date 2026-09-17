import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { HELP, allAnswers, findAnswers } from '../src/lib/help';

/**
 * The help register is held to the product, not to my memory of it.
 *
 * Kris, 17 September: *"lets make an issue register expected from users… go through the full list
 * and lets make sure we have simple answers for them all"*.
 *
 * ── The thing that would rot ─────────────────────────────────────────────────────────────────────
 *
 * A help page is written once, against the product as it was that afternoon, and then the product
 * moves. Six months later it names a button that has been renamed and a page that has moved, and
 * the damage is worse than having no help at all: somebody following it concludes they are the
 * problem, or that SPEC is. They do not conclude that the instructions are old.
 *
 * So every answer that says "go here" is checked against the real routes, and every answer that
 * says "press this" is checked against the real page — by following the page's own imports, so a
 * label has to be genuinely reachable from the screen the answer sends somebody to.
 */

const APP = resolve(__dirname, '../src/app');
const SRC = resolve(__dirname, '../src');

/** Every route the app really has, as href strings. */
function routes(dir = APP, prefix = ''): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    // Route groups are (parens) and do not appear in the address.
    const segment = entry.name.startsWith('(') ? '' : `/${entry.name}`;
    const here = join(dir, entry.name);
    if (existsSync(join(here, 'page.tsx'))) out.push(`${prefix}${segment}` || '/');
    out.push(...routes(here, `${prefix}${segment}`));
  }
  return out;
}
const REAL_ROUTES = new Set([...routes(), '/']);

/**
 * Every file a page pulls in, following local imports as far as they go.
 *
 * This is what makes "press this" a real check rather than a grep of the whole codebase. "Log it"
 * lives in a component, not in `my-page/page.tsx` — but my-page imports it, so it is genuinely on
 * that screen. A label found anywhere in `src` would also match a page nobody was sent to.
 */
function reachableFrom(file: string, seen = new Set<string>()): string[] {
  if (seen.has(file) || !existsSync(file)) return [...seen];
  seen.add(file);
  const src = readFileSync(file, 'utf8');
  for (const m of src.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
    const spec = m[1];
    let target: string | null = null;
    if (spec.startsWith('@/')) target = join(SRC, spec.slice(2));
    else if (spec.startsWith('.')) target = resolve(dirname(file), spec);
    if (!target) continue;
    for (const ext of ['.tsx', '.ts', '/index.tsx', '/index.ts']) {
      if (existsSync(target + ext)) { reachableFrom(target + ext, seen); break; }
    }
  }
  return [...seen];
}

/** The page file for an href, with [params] matched by shape. */
function pageFor(href: string): string | null {
  const direct = join(APP, href, 'page.tsx');
  if (existsSync(direct)) return direct;
  return null;
}

describe('every answer can actually be followed', () => {
  const withRoute = allAnswers().filter(a => a.go);

  it('there are answers to check, across every part of the product', () => {
    expect(allAnswers().length).toBeGreaterThan(30);
    expect(HELP.length).toBeGreaterThan(6);
    expect(withRoute.length).toBeGreaterThan(25);
  });

  it('EVERY PAGE AN ANSWER NAMES REALLY EXISTS', () => {
    const missing = withRoute.filter(a => !REAL_ROUTES.has(a.go!.href)).map(a => `${a.ask} → ${a.go!.href}`);
    expect(missing, `these send somebody to a page that is not there: ${missing.join(', ')}`).toEqual([]);
  });

  it('AND EVERY BUTTON IT NAMES IS ON THAT PAGE', () => {
    /*
      The check that matters most. An answer reading "press Send invite" is a promise, and this is
      what keeps it one — if somebody renames the button, this fails and names the answer that has
      gone stale rather than leaving a customer hunting for words that are not there.
    */
    const stale: string[] = [];
    for (const a of withRoute) {
      if (!a.press) continue;
      const page = pageFor(a.go!.href);
      if (!page) { stale.push(`${a.ask} — no page file for ${a.go!.href}`); continue; }
      const found = reachableFrom(page).some(f => readFileSync(f, 'utf8').includes(a.press!));
      if (!found) stale.push(`${a.ask} — "${a.press}" is not on ${a.go!.href}`);
    }
    expect(stale, stale.join(' | ')).toEqual([]);
  });
});

describe('what the register must never become', () => {
  it('never asks a question twice', () => {
    const asks = allAnswers().map(a => a.ask.toLowerCase());
    expect(new Set(asks).size, 'the same question is answered twice').toBe(asks.length);
  });

  it('always answers in enough words to be useful, and few enough to be read', () => {
    /*
      Both ends matter. An answer under a sentence is a brush-off, and an answer of four paragraphs
      is one nobody stuck and irritated will read to the end of.
    */
    const tooShort = allAnswers().filter(a => a.say.length < 60).map(a => a.ask);
    const tooLong = allAnswers().filter(a => a.say.length > 420).map(a => a.ask);
    expect(tooShort, `too short to help: ${tooShort.join(', ')}`).toEqual([]);
    expect(tooLong, `nobody stuck reads this far: ${tooLong.join(', ')}`).toEqual([]);
  });

  it('covers the questions Kris named, in the words he used', () => {
    // From his own list: "i can't login, forgot my password, how do i add a person, how do i add a
    // role, how to add a kpi, how to delete a kpi, etc". If one of these stops being findable, the
    // register has drifted away from what it was built for.
    for (const asked of ['cant login', 'forgot my password', 'add a person', 'add a role', 'add a kpi', 'delete a kpi']) {
      expect(findAnswers(asked).length, `nothing found for "${asked}"`).toBeGreaterThan(0);
    }
  });

  it('finds the answer even when it is asked in different words', () => {
    // Nobody types "criterion". The search has to cross from their words to ours or it answers only
    // the people who already knew what to call it.
    expect(findAnswers('cant log in')[0]?.ask).toBe('I cannot sign in');
    expect(findAnswers('locked out')[0]?.ask).toBe('I cannot sign in');
    expect(findAnswers('remove kpi')[0]?.ask).toBe('How do I delete a KPI?');
    expect(findAnswers('how much does it cost')[0]?.ask).toBe('What does it cost?');
    expect(findAnswers('someone left')[0]?.ask).toContain('left');
  });

  it('never returns everything just because somebody typed a common word', () => {
    // A search that matches half the page has not answered anybody.
    expect(findAnswers('the').length).toBe(0);           // too short to be a word worth matching
    expect(findAnswers('kpi').length).toBeLessThan(allAnswers().length / 2);
  });

  it('says so plainly where the answer is that SPEC does not do this', () => {
    /*
      Three answers are refusals — changing access being the one people will look hardest for. An
      honest "there is no button, and here is why" is the most useful thing a help page can say;
      sending somebody hunting for a control that has never existed is the cruellest.
    */
    const refusals = allAnswers().filter(a => a.cannot);
    expect(refusals.length).toBeGreaterThan(0);
    const access = allAnswers().find(a => a.ask === 'How do I change what someone can see?');
    expect(access?.cannot, 'the access answer must be marked as a refusal, not read as a how-to').toBe(true);
    expect(access?.say).toContain('no switch');
  });
});

describe('help reaches the people who need it', () => {
  it('is not behind the sign-in, because the people needing it cannot sign in', () => {
    const page = readFileSync(join(APP, 'help/page.tsx'), 'utf8');
    expect(page).not.toContain('getCurrentUser');
    expect(page).not.toContain('requireManager');
    expect(page).not.toContain('redirect(\'/signin\')');
  });

  it('is linked from the footer of every page, not buried', () => {
    const ui = readFileSync(join(SRC, 'components/ui.tsx'), 'utf8');
    expect(ui).toContain('href="/help"');
    // It used to be a mailto, which made one person the help desk.
    expect(ui).not.toContain('mailto:manager@specbizhq.com?subject=SPEC%20help');
  });

  it('and still offers a real person for what it cannot answer', () => {
    const page = readFileSync(join(APP, 'help/page.tsx'), 'utf8');
    expect(page).toContain('manager@specbizhq.com');
  });

  it('is a door as well, so it is reachable from inside', () => {
    const doorsSrc = readFileSync(join(SRC, 'lib/doors.ts'), 'utf8');
    expect(doorsSrc).toContain("href: '/help'");
  });
});
