/*
  Every page can be reached, and the menu does not quietly shrink.

  Kris, 26 September: *"stop losing things - honestly i cant cope if you do that - so make a rule
  nothing can be taken off unless you ask me."*

  `tests/surface.test.ts` already stops a FUNCTION disappearing. It would have passed every run
  while Scoring and Mirrors sat off the menu for two days, because nothing was deleted — they were
  moved into a drawer. This is the half that catches that: not "does it still exist" but "can
  anybody still get to it".

  See docs/NOTHING-COMES-OFF.md for the three layers and the asymmetry they share.
*/
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { routes, orphans, EXCUSES } from '../scripts/reachable.mjs';
import { navDoors, allDoors, NAV_HREFS } from '../src/lib/doors';

const shape = { businesses: 1, runsSpec: false };

describe('nothing gets lost in a drawer', () => {
  it('EVERY PAGE HAS SOMETHING LINKING TO IT', () => {
    const lost = orphans();
    expect(
      lost,
      `${lost.length} page${lost.length === 1 ? '' : 's'} nothing in the app links to:\n\n` +
        `${lost.map(r => `  ${r}`).join('\n')}\n\n` +
        `A page nobody can reach is not in the product, whatever the file tree says.\n` +
        `Link it, or — if it is genuinely opened another way — add a line to ${EXCUSES} saying how.`,
    ).toEqual([]);
  });

  it('has pages to check at all', () => {
    /* A check whose failure mode is silence is worse than no check: if the walk ever found nothing,
       the test above would pass for ever while guarding an empty list. That is exactly the failure
       docs/CORE-COMPONENTS.md had — a real check aimed at a list missing two thirds of the point. */
    expect(routes().length).toBeGreaterThan(50);
  });

  it('EVERY TAB KRIS NAMED IS STILL ON THE BAR', () => {
    /*
      His list, 26 September, verbatim: "tabs MUST be - My Page - Mirrors - Jobs - Financials - CRM
      - Safety - People - Compliance - Set Up - Connections".

      Held against NAV_HREFS as well as the built bar, so the two cannot drift apart quietly — which
      is how the old bar ended up asserting a shape the product had stopped having.
    */
    const bar = navDoors(shape).map(d => d.href);
    expect(bar).toEqual([...NAV_HREFS]);
    for (const must of ['/my-page', '/mirrors', '/jobs', '/financials', '/crm', '/safety', '/people', '/compliance', '/board', '/setup', '/connections']) {
      expect(bar, `${must} is a tab Kris named and it has gone`).toContain(must);
    }
  });

  it('KEEPS EVERYTHING THAT CAME OFF THE BAR ONE CLICK FROM MY PAGE', () => {
    /*
      The six the 26 September cut took off, each named in docs/NOTHING-COMES-OFF.md. My Page
      renders the whole directory under "Everywhere else in SPEC", so a door in the directory is one
      press away — and two of these six were in NEITHER the bar nor the directory when the cut was
      made. Following the instruction to the letter would have lost them. This is why the rule is a
      check and not a good intention.
    */
    const directory = new Set(allDoors(shape).map(d => d.href));
    const myPage = readFileSync('src/app/my-page/page.tsx', 'utf8');
    /* /board came back to the bar as "Board pack" on 26 September, so it is no longer one of the
       ones this has to catch below — it is checked as a named tab above instead. */
    for (const gone of ['/scoring', '/virtual-gm', '/meeting', '/pages']) {
      expect(directory.has(gone), `${gone} came off the bar and is in no directory group`).toBe(true);
    }
    /* The org chart is the one Kris placed by hand: "on my page and under people". */
    expect(myPage, 'the org chart has no door on My Page').toContain('OrgChartDoor');
  });

  it('records every removal in Kris’s own words', () => {
    /*
      The escape hatch has to cost a conversation, or it is not an escape hatch. A removal is only
      agreed once it is written down WITH THE WORDS — "it seemed unused" is the sentence that lost
      Mirrors, and this is the file that refuses it.
    */
    const doc = readFileSync('docs/NOTHING-COMES-OFF.md', 'utf8');
    expect(doc).toContain('tabs MUST be');
    expect(doc).toContain('org chart is on my page and under people');
    /* Each removed item names where it is still reached from — not just that it went. */
    for (const gone of ['/org', '/scoring', '/virtual-gm', '/board', '/meeting', '/pages']) {
      expect(doc, `${gone} is not accounted for in the removals log`).toContain(gone);
    }
  });
});
